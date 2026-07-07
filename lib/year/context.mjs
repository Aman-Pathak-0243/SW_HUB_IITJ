// Academic Year context (capability 1) — the temporal spine's read/write entry
// point. Resolves the single CURRENT academic year (the DB guarantees exactly
// one via the `academic_year_one_current_uq` partial unique WHERE is_current),
// lists years, creates a new year, and switches which year is current. This is
// the canonical home for current-year resolution; lib/cms/visibility.mjs
// re-exports `resolveCurrentYear` from here so there is a single source of truth.
//
// INTEGRITY IS THE DATABASE'S JOB (DL-029). We do not re-implement the
// one-current partial unique, the label/date CHECKs, or the lock_guard in app
// code — we honor their ordering and surface a friendly error (lib/cms/errors.mjs)
// when a guard rejects a write.
//
// AUDIT: each mutating op runs with auto-audit suppressed and writes exactly ONE
// semantic audit_log row after commit (DL-012 / DL-028), mirroring the CMS
// service. AUTHORIZATION: mutations reuse the Session-2 RBAC util
// (assertPermission) gated on `year.*`; a `system` actor (seed/migration) bypasses.
import prisma from "../prisma.mjs";
import { assertPermission } from "../rbac/authorize.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
// The post-commit audited-mutation wrapper + Neon-safe tx ceiling are shared with
// the CMS service (single source of truth — DL-012/028); re-exported so the year
// modules (lock.mjs / transition.mjs) import them from one place.
import { auditedMutation, TX_OPTS } from "../cms/audited-mutation.mjs";

export { auditedMutation, TX_OPTS };

const ENTITY = "academic_year";

// Permission key per mutating operation (capability-3 grain; keys seeded by
// lib/rbac/permissions.mjs).
export const YEAR_OP_PERMISSIONS = {
  create: "year.create",
  update: "year.update",
  setCurrent: "year.update",
  lock: "year.lock",
  transition: "year.transition",
};

// ── shared helpers (reused by lock.mjs / transition.mjs) ────────────────────

// Enforce a permission for the actor. `actor.system` bypasses (seed/migration/
// cron). Throws a 401-shaped error when unauthenticated, 403 when unauthorized.
// Year operations are institute-wide, so the default scope is global ({}).
export async function assertActorPermission(actor, permissionKey, scope = {}) {
  if (actor?.system) return;
  if (!actor?.userId) {
    const err = new Error("An actor user id is required for this operation.");
    err.status = 401;
    err.code = "UNAUTHENTICATED";
    throw err;
  }
  await assertPermission(actor.userId, permissionKey, scope);
}

// A compact, JSON-safe snapshot of an academic_year for audit before/after.
export function yearSnapshot(year) {
  if (!year) return null;
  return {
    id: year.id,
    label: year.label,
    status: year.status,
    isCurrent: year.isCurrent,
    startDate: year.startDate,
    endDate: year.endDate,
    transitionedFromYearId: year.transitionedFromYearId ?? null,
  };
}

// ── current-year resolution (reads) ─────────────────────────────────────────

// The current academic year row, or null if none is marked current. The
// `academic_year_one_current_uq` partial unique guarantees at most one.
export async function resolveCurrentYear(client = prisma) {
  return client.academicYear.findFirst({ where: { isCurrent: true } });
}

// The current academic year id, or null.
export async function getCurrentYearId(client = prisma) {
  return (await resolveCurrentYear(client))?.id ?? null;
}

// The current academic year, or throw a friendly 409 when none is set (a
// misconfigured deployment with no current year). For callers that must have one.
export async function requireCurrentYear(client = prisma) {
  const year = await resolveCurrentYear(client);
  if (!year) {
    throw new CmsValidationError("No academic year is currently set as the active year.", {
      status: 409,
      code: "NO_CURRENT_YEAR",
    });
  }
  return year;
}

// Fetch a year by id (or null).
export async function getYear(yearId, { client = prisma } = {}) {
  if (!yearId) return null;
  return client.academicYear.findUnique({ where: { id: yearId } });
}

// Fetch a year by its 'YYYY-YY' label (or null).
export async function getYearByLabel(label, { client = prisma } = {}) {
  if (!label) return null;
  return client.academicYear.findUnique({ where: { label } });
}

// List academic years, newest first by start date. Optionally filter by status
// and/or include per-year content/structure counts for an admin year list.
export async function listYears({ status, includeCounts = false } = {}, { client = prisma } = {}) {
  const years = await client.academicYear.findMany({
    where: status ? { status } : undefined,
    orderBy: [{ startDate: "desc" }],
  });
  if (!includeCounts) return years;
  // Three grouped aggregates total (one per entity), not three counts PER year:
  // under Neon's per-query latency the old 3×N round-trips dominated the page.
  const [orgUnits, contentItems, appointments] = await Promise.all([
    client.orgUnit.groupBy({ by: ["academicYearId"], where: { archivedAt: null }, _count: true }),
    client.contentItem.groupBy({ by: ["academicYearId"], where: { archivedAt: null }, _count: true }),
    client.appointment.groupBy({ by: ["academicYearId"], where: { archivedAt: null }, _count: true }),
  ]);
  const toMap = (rows) => new Map(rows.map((r) => [r.academicYearId, r._count]));
  const ouMap = toMap(orgUnits);
  const ciMap = toMap(contentItems);
  const apMap = toMap(appointments);
  return years.map((y) => ({
    ...y,
    counts: {
      orgUnits: ouMap.get(y.id) ?? 0,
      contentItems: ciMap.get(y.id) ?? 0,
      appointments: apMap.get(y.id) ?? 0,
    },
  }));
}

// ── mutations ───────────────────────────────────────────────────────────────

// Create a new academic year. Defaults status to 'planning' (the wizard builds
// it before it goes live). The label format ('YYYY-YY') and end>start ordering
// are DB CHECKs; we surface friendly errors rather than re-validating here, but a
// cheap shape check on label saves a round-trip.
// input: { label, startDate, endDate, status?, transitionedFromYearId? }
export async function createYear(input, actor = {}) {
  if (!input?.label) throw new CmsValidationError("A year label ('YYYY-YY') is required.");
  if (!/^\d{4}-\d{2}$/.test(input.label)) {
    throw new CmsValidationError("Year label must be in 'YYYY-YY' format (e.g. 2026-27).", {
      code: "INVALID_YEAR_LABEL",
    });
  }
  if (!input.startDate || !input.endDate) {
    throw new CmsValidationError("Both startDate and endDate are required.");
  }
  await assertActorPermission(actor, YEAR_OP_PERMISSIONS.create);

  return auditedMutation(
    actor,
    async (tx) => {
      const year = await tx.academicYear.create({
        data: {
          label: input.label,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          status: input.status ?? "planning",
          isCurrent: false, // becoming current is an explicit, separate action
          transitionedFromYearId: input.transitionedFromYearId ?? null,
          createdById: actor?.userId ?? null,
          updatedById: actor?.userId ?? null,
        },
      });
      return { year };
    },
    ({ year }) => ({
      action: "create",
      entityType: ENTITY,
      entityId: year.id,
      academicYearId: year.id,
      after: yearSnapshot(year),
      summary: `Created academic year ${year.label} (${year.status})`,
    })
  );
}

// Make `yearId` the current year: demote whichever year is current, then promote
// the target — in ONE transaction so the `academic_year_one_current_uq` partial
// unique never sees two current years. The target must exist and not be locked
// (a locked, read-only year cannot be the live editable current year).
export async function setCurrentYear(yearId, actor = {}) {
  await assertActorPermission(actor, YEAR_OP_PERMISSIONS.setCurrent);
  const target = await getYear(yearId);
  if (!target) throw new CmsNotFoundError(`Academic year ${yearId} not found.`);
  if (target.status === "locked") {
    throw new CmsValidationError("A locked year cannot be made current. Unlock it first.", {
      status: 409,
      code: "YEAR_LOCKED_SET_CURRENT",
    });
  }

  return auditedMutation(
    actor,
    async (tx) => {
      const before = await tx.academicYear.findFirst({ where: { isCurrent: true } });
      // Idempotent: already the current year → no demote/promote needed.
      if (before?.id === yearId) {
        return { year: before, previous: before, changed: false };
      }
      // Demote the incumbent FIRST so the one-current partial unique is satisfied
      // at every step, then promote the target.
      if (before) {
        await tx.academicYear.update({
          where: { id: before.id },
          data: { isCurrent: false, updatedById: actor?.userId ?? null },
        });
      }
      const year = await tx.academicYear.update({
        where: { id: yearId },
        // Promote to current and ensure it is live (a 'planning' year becomes
        // 'active' when it goes current; an already-active year is unchanged).
        data: {
          isCurrent: true,
          status: target.status === "planning" ? "active" : target.status,
          updatedById: actor?.userId ?? null,
        },
      });
      return { year, previous: before ?? null, changed: true };
    },
    ({ year, previous, changed }) =>
      changed
        ? {
            action: "update",
            entityType: ENTITY,
            entityId: year.id,
            academicYearId: year.id,
            before: yearSnapshot(previous),
            after: yearSnapshot(year),
            summary: previous
              ? `Set current year to ${year.label} (was ${previous.label})`
              : `Set current year to ${year.label}`,
          }
        : null
  );
}
