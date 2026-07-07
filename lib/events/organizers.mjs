// M5 — event ORGANIZER / COLLABORATOR tagging + custom ENTITIES (DL-085).
//
// Organizer tagging is a CENTRAL action (requireGlobal event.manage): it defines WHO
// organizes an event, and an organizing CLUB tag is also the scope at which that club's
// coordinator gains event.manage on the event (DL-086) — so a coordinator must not be
// able to self-tag. setEventOrganizers REPLACES the full tag set idempotently (deduped
// by target + the DB per-target uniques), inside ONE transaction, writing ONE semantic
// audit summary row (parity with setAchievementCredits, DL-081). Custom entities are
// admin/dev-defined durable stakeholders, also gated on GLOBAL event.manage.
//
// Reads (listEventOrganizers / listEventEntities) are public-display data (the same
// names shown on the playground + Events-Organized page) — UNGATED, PII-minimized
// (a member organizer appears by display NAME only, never email).
import prisma from "../prisma.mjs";
import { assertActorPermission, getCurrentYearId } from "../year/context.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import { normalizeEmail } from "../auth/email.mjs";
import { assertEventManage, EVENT_MANAGE_PERM } from "./authz.mjs";
import { organizerTargetKind, normalizeOrganizerKind, normalizeOrganizerRole, normalizeEntityInput, EVENT_ENTITY_STATUS_SET } from "./forms.mjs";

const ORGANIZER_ENTITY = "event_organizer";
const ENTITY_ENTITY = "event_entity";

const WITH_TARGETS = {
  user: { select: { id: true, name: true } },
  orgUnitLineage: { select: { lineageKey: true, canonicalName: true } },
  entity: { select: { id: true, name: true, kind: true } },
};

// PURE JSON-safe shape. PII-minimized (DL-082 parity): a member organizer appears by
// display NAME only — the internal app_user uuid is NOT serialized (this shape is
// returned by the UNGATED listEventOrganizers public read). Durable non-PII ids for
// clubs/entities (orgUnitLineageKey / entityId) ARE kept (they drive links + the editor).
export function shapeOrganizer(o) {
  if (!o) return null;
  return {
    id: o.id,
    eventItemId: o.eventItemId,
    kind: o.kind,
    targetKind: o.orgUnitLineageKey ? "club" : o.entityId ? "entity" : "user",
    orgUnitLineageKey: o.orgUnitLineageKey ?? null,
    clubName: o.orgUnitLineage?.canonicalName ?? null,
    entityId: o.entityId ?? null,
    entityName: o.entity?.name ?? null,
    entityKind: o.entity?.kind ?? null,
    memberName: o.user?.name ?? null,
    role: o.role ?? null,
    sortOrder: o.sortOrder ?? 0,
  };
}

export function shapeEntity(e) {
  if (!e) return null;
  return {
    id: e.id,
    name: e.name,
    kind: e.kind ?? null,
    description: e.description ?? null,
    status: e.status,
    createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt ?? null,
  };
}

// Resolve one tag descriptor → { orgUnitLineageKey, entityId, userId } (exactly one set).
// Emails resolve to an EXISTING account (missing → 422, never auto-created, DL-081 parity).
async function resolveOrganizerTarget(input, client) {
  const kind = organizerTargetKind(input); // throws on both / neither
  if (kind === "club") {
    const lin = await client.orgUnitLineage.findUnique({ where: { lineageKey: input.orgUnitLineageKey }, select: { lineageKey: true } });
    if (!lin) throw new CmsValidationError("Unknown org-unit lineage.");
    return { orgUnitLineageKey: lin.lineageKey, entityId: null, userId: null };
  }
  if (kind === "entity") {
    const ent = await client.eventEntity.findUnique({ where: { id: input.entityId }, select: { id: true } });
    if (!ent) throw new CmsValidationError("Unknown custom entity.");
    return { orgUnitLineageKey: null, entityId: ent.id, userId: null };
  }
  if (input.userId) {
    const u = await client.user.findUnique({ where: { id: input.userId }, select: { id: true } });
    if (!u) throw new CmsValidationError("Unknown account (userId).");
    return { orgUnitLineageKey: null, entityId: null, userId: u.id };
  }
  const email = normalizeEmail(input.email);
  if (!email) throw new CmsValidationError("A valid email is required to tag a member.");
  const u = await client.user.findUnique({ where: { email }, select: { id: true } });
  if (!u) throw new CmsValidationError(`No account exists for ${email}. Create the account first (M0), then tag it.`);
  return { orgUnitLineageKey: null, entityId: null, userId: u.id };
}

// REPLACE the full organizer/collaborator tag set for an event (idempotent by target).
// CENTRAL: authorizes GLOBAL event.manage FIRST (DL-086). Each tag is
// { one of orgUnitLineageKey|entityId|userId|email, kind?, role?, sortOrder? }.
export async function setEventOrganizers(eventItemId, tags = [], actor = {}) {
  const item = await assertEventManage(actor, eventItemId, { requireGlobal: true }); // authorize FIRST
  if (!Array.isArray(tags)) throw new CmsValidationError("organizers must be an array.");

  const seen = new Set();
  const rows = [];
  for (const t of tags) {
    const target = await resolveOrganizerTarget(t ?? {}, prisma);
    const key = target.orgUnitLineageKey ? `c:${target.orgUnitLineageKey}` : target.entityId ? `e:${target.entityId}` : `u:${target.userId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      eventItemId: item.id,
      kind: normalizeOrganizerKind(t?.kind),
      orgUnitLineageKey: target.orgUnitLineageKey,
      entityId: target.entityId,
      userId: target.userId,
      role: normalizeOrganizerRole(t?.role),
      sortOrder: Number.isFinite(t?.sortOrder) ? Math.trunc(t.sortOrder) : rows.length,
      createdById: actor?.userId ?? null,
    });
  }

  const { saved } = await auditedMutation(
    actor,
    async (tx) => {
      await tx.eventOrganizer.deleteMany({ where: { eventItemId: item.id } });
      if (rows.length) await tx.eventOrganizer.createMany({ data: rows });
      const saved = await tx.eventOrganizer.findMany({
        where: { eventItemId: item.id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: WITH_TARGETS,
      });
      return { saved };
    },
    ({ saved }) => ({
      action: "update",
      entityType: ORGANIZER_ENTITY,
      entityId: item.id,
      academicYearId: item.academicYearId,
      after: {
        eventItemId: item.id,
        count: saved.length,
        organizers: saved.filter((r) => r.kind === "organizer").length,
        collaborators: saved.filter((r) => r.kind === "collaborator").length,
      },
      summary: `Set ${saved.length} organizer/collaborator tag(s) on event ${item.id}`,
    })
  );
  return { organizers: saved.map(shapeOrganizer) };
}

// Read an event's organizer/collaborator tags, ordered. Ungated public-display data.
export async function listEventOrganizers(eventItemId, { client = prisma } = {}) {
  if (!eventItemId) return [];
  const rows = await client.eventOrganizer.findMany({
    where: { eventItemId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: WITH_TARGETS,
  });
  return rows.map(shapeOrganizer);
}

// ── custom entities (CENTRAL — GLOBAL event.manage) ──

export async function createEventEntity(input = {}, actor = {}) {
  await assertActorPermission(actor, EVENT_MANAGE_PERM, {}); // GLOBAL — authorize FIRST
  const clean = normalizeEntityInput(input);
  const { entity } = await auditedMutation(
    actor,
    async (tx) => ({ entity: await tx.eventEntity.create({ data: { ...clean, createdById: actor?.userId ?? null } }) }),
    ({ entity }) => ({
      action: "create",
      entityType: ENTITY_ENTITY,
      entityId: entity.id,
      after: { name: entity.name, kind: entity.kind },
      summary: `Created custom event entity "${entity.name}"`,
    })
  );
  return { entity: shapeEntity(entity) };
}

export async function updateEventEntity(id, patch = {}, actor = {}) {
  await assertActorPermission(actor, EVENT_MANAGE_PERM, {});
  const existing = await prisma.eventEntity.findUnique({ where: { id } });
  if (!existing) throw new CmsNotFoundError(`Custom entity ${id} not found.`);
  const data = {};
  if (patch.name !== undefined || patch.kind !== undefined || patch.description !== undefined) {
    const clean = normalizeEntityInput({ name: patch.name ?? existing.name, kind: patch.kind ?? existing.kind, description: patch.description ?? existing.description });
    Object.assign(data, clean);
  }
  if (patch.status !== undefined) {
    if (!EVENT_ENTITY_STATUS_SET.has(patch.status)) throw new CmsValidationError("Entity status must be 'active' or 'archived'.");
    data.status = patch.status;
  }
  const { entity } = await auditedMutation(
    actor,
    async (tx) => ({ entity: await tx.eventEntity.update({ where: { id }, data }) }),
    ({ entity }) => ({
      action: "update",
      entityType: ENTITY_ENTITY,
      entityId: entity.id,
      before: { name: existing.name, kind: existing.kind, status: existing.status },
      after: { name: entity.name, kind: entity.kind, status: entity.status },
      summary: `Updated custom event entity "${entity.name}"`,
    })
  );
  return { entity: shapeEntity(entity) };
}

// List custom entities (default active only). Ungated (names are public-display data).
export async function listEventEntities({ status = "active", client = prisma } = {}) {
  const rows = await client.eventEntity.findMany({
    where: status ? { status } : undefined,
    orderBy: { name: "asc" },
  });
  return rows.map(shapeEntity);
}
