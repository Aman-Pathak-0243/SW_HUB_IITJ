// Org-unit service (capability 2) — create / edit / publish / archive the
// year-scoped, self-referential `org_unit` rows that model councils, clubs,
// hostels, messes (and future kinds). Each org_unit is tied to an
// `org_unit_lineage` row that carries its identity ACROSS years; a lineage is
// created only for a genuinely NEW logical unit and never a bare uuid (DL-007).
//
// INTEGRITY IS THE DATABASE'S JOB (DL-029). We honor — never re-implement — the
// `org_unit_hierarchy_guard` (same-year parent + allowed child type) and the
// `lock_guard`; a rejected write surfaces as a friendly CmsError
// (ORG_HIERARCHY / YEAR_LOCKED) via the shared `withMappedDbErrors` inside
// `auditedMutation`.
//
// AUDIT + AUTH mirror the CMS / year services: each mutation runs in one
// transaction with auto-audit suppressed and writes exactly ONE semantic
// audit_log row after commit (DL-012 / DL-028 / DL-033); every mutating op gates
// on `org_unit.*` via the shared `assertActorPermission` (a `system` actor —
// seed / migration — bypasses), scoped to the unit's (year, lineage).
import prisma from "../prisma.mjs";
import { auditedMutation, assertActorPermission } from "../year/context.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";

const ENTITY = "org_unit";

// Permission key per mutating operation (capability-3 grain; keys in
// lib/rbac/permissions.mjs). Edit + publish both fall under `org_unit.update`.
export const ORG_UNIT_OP_PERMISSIONS = {
  create: "org_unit.create",
  update: "org_unit.update",
  archive: "org_unit.archive",
};

// A compact, JSON-safe snapshot for audit before/after.
export function orgUnitSnapshot(unit) {
  if (!unit) return null;
  return {
    id: unit.id,
    academicYearId: unit.academicYearId,
    orgUnitTypeId: unit.orgUnitTypeId,
    parentId: unit.parentId,
    lineageKey: unit.lineageKey,
    slug: unit.slug,
    name: unit.name,
    status: unit.status,
    sortOrder: unit.sortOrder,
    archivedAt: unit.archivedAt,
  };
}

// ── reads (used by the importer + admin) ─────────────────────────────────────

// Resolve an org_unit_type id from its key ('council'|'club'|'hostel'|'mess'|…).
export async function resolveTypeId(typeKey, { client = prisma } = {}) {
  if (!typeKey) return null;
  const t = await client.orgUnitType.findUnique({ where: { key: typeKey }, select: { id: true } });
  return t?.id ?? null;
}

// Find one org_unit by (year, slug) — the importer's idempotency lookup.
export async function findOrgUnitBySlug(academicYearId, slug, { client = prisma } = {}) {
  if (!academicYearId || !slug) return null;
  return client.orgUnit.findFirst({ where: { academicYearId, slug } });
}

// ── mutations ────────────────────────────────────────────────────────────────

// Create a new org_unit. When `lineageKey` is omitted a NEW org_unit_lineage row
// is created (a genuinely new logical unit); pass an existing `lineageKey` to add
// a fresh per-year instance of a unit that already exists in another year.
// input: { academicYearId, typeKey?|orgUnitTypeId, parentId?, lineageKey?,
//          slug, name, sortOrder?, status?, canonicalName? }
export async function createOrgUnit(input, actor = {}) {
  if (!input?.academicYearId) throw new CmsValidationError("academicYearId is required.");
  if (!input?.slug) throw new CmsValidationError("A slug is required.");
  if (!input?.name) throw new CmsValidationError("A name is required.");

  const orgUnitTypeId = input.orgUnitTypeId ?? (await resolveTypeId(input.typeKey));
  if (!orgUnitTypeId) throw new CmsValidationError(`Unknown org unit type '${input.typeKey ?? ""}'.`);

  const scope = { academicYearId: input.academicYearId, orgUnitLineageKey: input.lineageKey };
  await assertActorPermission(actor, ORG_UNIT_OP_PERMISSIONS.create, scope);

  return auditedMutation(
    actor,
    async (tx) => {
      // Create the lineage row only for a genuinely new logical unit (DL-007).
      let lineageKey = input.lineageKey ?? null;
      if (!lineageKey) {
        const lineage = await tx.orgUnitLineage.create({
          data: {
            canonicalName: input.canonicalName ?? input.name,
            firstSeenYearId: input.academicYearId,
            createdById: actor?.userId ?? null,
          },
        });
        lineageKey = lineage.lineageKey;
      }
      const unit = await tx.orgUnit.create({
        data: {
          academicYearId: input.academicYearId,
          orgUnitTypeId,
          parentId: input.parentId ?? null,
          lineageKey,
          slug: input.slug,
          name: input.name,
          sortOrder: input.sortOrder ?? 0,
          status: input.status ?? "draft",
          createdById: actor?.userId ?? null,
          updatedById: actor?.userId ?? null,
        },
      });
      return { unit };
    },
    ({ unit }) => ({
      action: "create",
      entityType: ENTITY,
      entityId: unit.id,
      academicYearId: unit.academicYearId,
      after: orgUnitSnapshot(unit),
      summary: `Created ${unit.slug} org unit "${unit.name}"`,
    })
  );
}

async function loadUnitOrThrow(id) {
  const unit = await prisma.orgUnit.findUnique({ where: { id } });
  if (!unit) throw new CmsNotFoundError(`Org unit ${id} not found.`);
  return unit;
}

// Edit a unit's structural fields (name/slug/parent/sortOrder/status). Only the
// keys present in `patch` are touched; an empty patch is a no-op (no audit row).
// patch: { name?, slug?, parentId?, sortOrder?, status? }
export async function editOrgUnit(id, patch = {}, actor = {}) {
  const unit = await loadUnitOrThrow(id);
  const scope = { academicYearId: unit.academicYearId, orgUnitLineageKey: unit.lineageKey };
  await assertActorPermission(actor, ORG_UNIT_OP_PERMISSIONS.update, scope);

  const data = {};
  for (const f of ["name", "slug", "sortOrder", "status"]) {
    if (patch[f] !== undefined) data[f] = patch[f];
  }
  if (patch.parentId !== undefined) data.parentId = patch.parentId;
  // Keep archivedAt consistent with a status change so the soft-delete flag and
  // the lifecycle status can never drift (archiveOrgUnit/publishOrgUnit do this
  // for their paths; mirror it for a direct status edit).
  if (patch.status !== undefined) {
    if (patch.status === "archived" && !unit.archivedAt) data.archivedAt = new Date();
    else if (patch.status !== "archived" && unit.archivedAt) data.archivedAt = null;
  }
  if (!Object.keys(data).length) return { unit, changed: false };

  return auditedMutation(
    actor,
    async (tx) => {
      const updated = await tx.orgUnit.update({
        where: { id },
        data: { ...data, updatedById: actor?.userId ?? null },
      });
      return { unit: updated, changed: true };
    },
    ({ unit: updated }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: updated.id,
      academicYearId: updated.academicYearId,
      before: orgUnitSnapshot(unit),
      after: orgUnitSnapshot(updated),
      summary: `Edited org unit "${updated.name}"`,
    })
  );
}

// Publish a unit (make it eligible for public listing). Idempotent: a
// published, non-archived unit is a no-op. Records a semantic `publish` row.
export async function publishOrgUnit(id, actor = {}) {
  const unit = await loadUnitOrThrow(id);
  const scope = { academicYearId: unit.academicYearId, orgUnitLineageKey: unit.lineageKey };
  await assertActorPermission(actor, ORG_UNIT_OP_PERMISSIONS.update, scope);
  if (unit.status === "published" && !unit.archivedAt) return { unit, changed: false };

  return auditedMutation(
    actor,
    async (tx) => {
      const updated = await tx.orgUnit.update({
        where: { id },
        data: { status: "published", archivedAt: null, updatedById: actor?.userId ?? null },
      });
      return { unit: updated, changed: true };
    },
    ({ unit: updated }) => ({
      action: "publish",
      entityType: ENTITY,
      entityId: updated.id,
      academicYearId: updated.academicYearId,
      before: orgUnitSnapshot(unit),
      after: orgUnitSnapshot(updated),
      summary: `Published org unit "${updated.name}"`,
    })
  );
}

// Archive (soft-delete) a unit. Never removes history; the public layer hides
// archived units. Idempotent. NOTE: ON DELETE RESTRICT means a parent council
// cannot be hard-deleted while clubs reference it; archiving is the supported
// removal, and child units should be archived first (the caller's concern).
export async function archiveOrgUnit(id, actor = {}) {
  const unit = await loadUnitOrThrow(id);
  const scope = { academicYearId: unit.academicYearId, orgUnitLineageKey: unit.lineageKey };
  await assertActorPermission(actor, ORG_UNIT_OP_PERMISSIONS.archive, scope);
  if (unit.archivedAt) return { unit, changed: false };

  return auditedMutation(
    actor,
    async (tx) => {
      const updated = await tx.orgUnit.update({
        where: { id },
        data: { status: "archived", archivedAt: new Date(), updatedById: actor?.userId ?? null },
      });
      return { unit: updated, changed: true };
    },
    ({ unit: updated }) => ({
      action: "archive",
      entityType: ENTITY,
      entityId: updated.id,
      academicYearId: updated.academicYearId,
      before: orgUnitSnapshot(unit),
      after: orgUnitSnapshot(updated),
      summary: `Archived org unit "${updated.name}"`,
    })
  );
}
