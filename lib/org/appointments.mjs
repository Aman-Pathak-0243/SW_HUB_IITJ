// Appointment (roster) service (capabilities 4 & 5) — create / edit / publish /
// archive `appointment` rows: person P holds position X in org_unit U during
// academic_year Y. Never overwritten; each year is a new row, and intra-year
// edits are audit-only history (NOT versioned — DL-004).
//
// INTEGRITY IS THE DATABASE'S JOB (DL-029). We honor — never re-implement:
//   • the COMPOSITE FK (org_unit_id, academic_year_id) → org_unit(id,
//     academic_year_id): we derive academicYearId FROM the unit so the cached
//     year can never disagree.
//   • `appointment_type_guard`: we leave org_unit_type_id NULL so the trigger
//     auto-fills it from the unit AND maintains the `is_singleton` flag from
//     position.max_holders; a Warden-on-a-club mismatch surfaces APPOINTMENT_TYPE.
//   • both cardinality guards: the singleton partial unique
//     (`appointment_singleton_position_uq`) + the deferred count trigger
//     (`appointment_cardinality_guard`) surface APPOINTMENT_CARDINALITY.
// All via the shared `withMappedDbErrors` inside `auditedMutation`.
//
// AUTH gates on `appointment.*`, scoped to the unit's (year, lineage); a `system`
// actor bypasses (importer / seed). AUDIT writes one semantic row per op.
import prisma from "../prisma.mjs";
import { auditedMutation, assertActorPermission } from "../year/context.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";

const ENTITY = "appointment";

export const APPOINTMENT_OP_PERMISSIONS = {
  create: "appointment.create",
  update: "appointment.update",
  archive: "appointment.archive",
};

function appointmentSnapshot(a) {
  if (!a) return null;
  return {
    id: a.id,
    academicYearId: a.academicYearId,
    orgUnitId: a.orgUnitId,
    positionId: a.positionId,
    personId: a.personId,
    titleOverride: a.titleOverride,
    status: a.status,
    isSingleton: a.isSingleton,
    sortOrder: a.sortOrder,
    archivedAt: a.archivedAt,
  };
}

async function loadUnitForScope(orgUnitId) {
  const unit = await prisma.orgUnit.findUnique({
    where: { id: orgUnitId },
    select: { id: true, academicYearId: true, lineageKey: true },
  });
  if (!unit) throw new CmsNotFoundError(`Org unit ${orgUnitId} not found.`);
  return unit;
}

// Find an active appointment for (year, unit, position, person) — the importer's
// idempotency lookup (matches the no-duplicate-active partial unique).
export async function findAppointment(academicYearId, orgUnitId, positionId, personId, { client = prisma } = {}) {
  return client.appointment.findFirst({
    where: { academicYearId, orgUnitId, positionId, personId, archivedAt: null },
  });
}

// Create an appointment. The academic year is taken FROM the unit (composite-FK
// agreement); org_unit_type_id is left NULL for the type guard to fill.
// input: { orgUnitId, positionId, personId, titleOverride?, status?, sortOrder?,
//          startDate?, endDate? }
export async function createAppointment(input, actor = {}) {
  if (!input?.orgUnitId) throw new CmsValidationError("orgUnitId is required.");
  if (!input?.positionId) throw new CmsValidationError("positionId is required.");
  if (!input?.personId) throw new CmsValidationError("personId is required.");

  const unit = await loadUnitForScope(input.orgUnitId);
  const scope = { academicYearId: unit.academicYearId, orgUnitLineageKey: unit.lineageKey };
  await assertActorPermission(actor, APPOINTMENT_OP_PERMISSIONS.create, scope);

  return auditedMutation(
    actor,
    async (tx) => {
      const appt = await tx.appointment.create({
        data: {
          academicYearId: unit.academicYearId, // FROM the unit → composite FK agrees
          orgUnitId: unit.id,
          orgUnitTypeId: null, // appointment_type_guard auto-fills + sets is_singleton
          positionId: input.positionId,
          personId: input.personId,
          titleOverride: input.titleOverride ?? null,
          status: input.status ?? "draft",
          publishedAt: input.status === "published" ? new Date() : null,
          sortOrder: input.sortOrder ?? 0,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          createdById: actor?.userId ?? null,
          updatedById: actor?.userId ?? null,
        },
      });
      return { appointment: appt };
    },
    ({ appointment }) => ({
      action: "create",
      entityType: ENTITY,
      entityId: appointment.id,
      academicYearId: appointment.academicYearId,
      after: appointmentSnapshot(appointment),
      summary: `Appointed person ${appointment.personId} to position ${appointment.positionId} in unit ${appointment.orgUnitId}`,
    })
  );
}

async function loadAppointmentOrThrow(id) {
  const appt = await prisma.appointment.findUnique({ where: { id }, include: { orgUnit: { select: { lineageKey: true } } } });
  if (!appt) throw new CmsNotFoundError(`Appointment ${id} not found.`);
  return appt;
}

// Edit an appointment. Only provided keys change; an empty patch is a no-op.
// patch: { titleOverride?, status?, sortOrder?, personId?, positionId?, startDate?, endDate? }
export async function editAppointment(id, patch = {}, actor = {}) {
  const appt = await loadAppointmentOrThrow(id);
  const scope = { academicYearId: appt.academicYearId, orgUnitLineageKey: appt.orgUnit?.lineageKey };
  await assertActorPermission(actor, APPOINTMENT_OP_PERMISSIONS.update, scope);

  const data = {};
  for (const f of ["titleOverride", "status", "sortOrder", "personId", "positionId", "startDate", "endDate"]) {
    if (patch[f] !== undefined) data[f] = patch[f];
  }
  if (patch.status === "published" && appt.status !== "published") data.publishedAt = new Date();
  if (!Object.keys(data).length) return { appointment: appt, changed: false };

  return auditedMutation(
    actor,
    async (tx) => {
      const updated = await tx.appointment.update({ where: { id }, data: { ...data, updatedById: actor?.userId ?? null } });
      return { appointment: updated, changed: true };
    },
    ({ appointment: updated }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: updated.id,
      academicYearId: updated.academicYearId,
      before: appointmentSnapshot(appt),
      after: appointmentSnapshot(updated),
      summary: `Edited appointment ${updated.id}`,
    })
  );
}

// Publish an appointment (roster goes live). Idempotent for an already-published,
// non-archived row.
export async function publishAppointment(id, actor = {}) {
  const appt = await loadAppointmentOrThrow(id);
  const scope = { academicYearId: appt.academicYearId, orgUnitLineageKey: appt.orgUnit?.lineageKey };
  await assertActorPermission(actor, APPOINTMENT_OP_PERMISSIONS.update, scope);
  if (appt.status === "published" && !appt.archivedAt) return { appointment: appt, changed: false };

  return auditedMutation(
    actor,
    async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: { status: "published", archivedAt: null, publishedAt: appt.publishedAt ?? new Date(), updatedById: actor?.userId ?? null },
      });
      return { appointment: updated, changed: true };
    },
    ({ appointment: updated }) => ({
      action: "publish",
      entityType: ENTITY,
      entityId: updated.id,
      academicYearId: updated.academicYearId,
      before: appointmentSnapshot(appt),
      after: appointmentSnapshot(updated),
      summary: `Published appointment ${updated.id}`,
    })
  );
}

// Archive (soft-delete) an appointment — frees its singleton slot for the year.
// Idempotent.
export async function archiveAppointment(id, actor = {}) {
  const appt = await loadAppointmentOrThrow(id);
  const scope = { academicYearId: appt.academicYearId, orgUnitLineageKey: appt.orgUnit?.lineageKey };
  await assertActorPermission(actor, APPOINTMENT_OP_PERMISSIONS.archive, scope);
  if (appt.archivedAt) return { appointment: appt, changed: false };

  return auditedMutation(
    actor,
    async (tx) => {
      const updated = await tx.appointment.update({
        where: { id },
        data: { status: "archived", archivedAt: new Date(), updatedById: actor?.userId ?? null },
      });
      return { appointment: updated, changed: true };
    },
    ({ appointment: updated }) => ({
      action: "archive",
      entityType: ENTITY,
      entityId: updated.id,
      academicYearId: updated.academicYearId,
      before: appointmentSnapshot(appt),
      after: appointmentSnapshot(updated),
      summary: `Archived appointment ${updated.id}`,
    })
  );
}
