// Person directory (capability 4 support) — the year-agnostic registry of humans
// referenced by appointments (faculty PICs/wardens, student coordinators/
// secretaries, staff caretakers, committee members). A person's per-year role is
// an `appointment`, never a column here.
//
// IDENTITY is by cleaned full name (lib/org/normalize.mjs#personKey): the same
// "Mehul Gupta" who is hostel secretary across four hostels is ONE person with
// four appointments. V1 "emails" are shared role mailboxes (the same address is
// reused by different people and `person.email` is UNIQUE), so we do NOT trust
// them as identity and never let one collide: `upsertPerson` drops an email that
// already belongs to a different person rather than tripping the unique (DL-034).
//
// The `person_email_link_guard` trigger only fires when a person is linked to an
// app_user (app_user_id) — the importer never links accounts, so it is honored
// trivially; if a future caller links one, a mismatched email surfaces the
// friendly PERSON_EMAIL_LINK error.
import prisma from "../prisma.mjs";
import { auditedMutation, assertActorPermission } from "../year/context.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import { cleanName } from "./normalize.mjs";
import { findOrCreateInventoryAsset } from "../media/service.mjs";

const ENTITY = "person";

// Resolve a photo URL (a /public path or an external URL) → a media_asset id, so the
// directory can set/replace a person's photo by URL. "" / null clears it. Reused by
// createPerson + editPerson.
async function resolvePhotoMediaId(photoUrl) {
  if (photoUrl === undefined) return undefined; // leave unchanged
  if (!photoUrl) return null; // explicit clear
  const m = await findOrCreateInventoryAsset(photoUrl);
  return m?.id ?? null;
}

function personSnapshot(p) {
  if (!p) return null;
  return { id: p.id, fullName: p.fullName, personType: p.personType, email: p.email, profileUrl: p.profileUrl, photoMediaId: p.photoMediaId };
}

// Look up a person by cleaned full name, case-INSENSITIVELY (so "soham kakkar"
// and "Soham Kakkar" are the same human, matching personKey's intent). Whitespace
// is normalized first. Honorific/middle-name variants of one name are reconciled
// in the dataset (lib/org/data/*), not here.
export async function findPersonByName(fullName, { client = prisma } = {}) {
  const name = cleanName(fullName);
  if (!name) return null;
  return client.person.findFirst({ where: { fullName: { equals: name, mode: "insensitive" } } });
}

// Would setting `email` on `personId` collide with a DIFFERENT existing person?
// (person.email is UNIQUE WHERE NOT NULL.) Pure-ish read helper, exported for tests.
export async function emailWouldCollide(email, personId, { client = prisma } = {}) {
  if (!email) return false;
  const owner = await client.person.findFirst({ where: { email }, select: { id: true } });
  return !!owner && owner.id !== personId;
}

// Create or update a person, keyed by cleaned full name (case-insensitive).
// Idempotent: a second run with the same data is a no-op (no audit row).
// `personType` is set on create and never silently downgraded. An `email` that
// would collide with another person is dropped (stored null) — see DL-034.
// `scope` is the RBAC scope of the appointment this person is being created for
// (so a unit/year-scoped org_manager — not just a global one — can create the
// people their in-scope roster needs); defaults to global {}.
// input: { fullName, personType, email?, phone?, profileUrl?, photoMediaId? }
export async function upsertPerson(input, actor = {}, { scope = {} } = {}) {
  const fullName = cleanName(input?.fullName);
  if (!fullName) throw new CmsValidationError("A person fullName is required.");
  if (!input?.personType) throw new CmsValidationError("A personType is required for a new person.");
  // People are managed in service of the roster; gate on appointment.create at the
  // SAME scope as the motivating appointment (not forced-global).
  await assertActorPermission(actor, "appointment.create", scope);

  const existing = await prisma.person.findFirst({ where: { fullName: { equals: fullName, mode: "insensitive" } } });

  // Resolve a non-colliding email (null when it would clash with another person).
  let email = input.email ?? null;
  if (email && (await emailWouldCollide(email, existing?.id ?? null))) email = null;

  if (existing) {
    // Only fill gaps / apply provided fields; never overwrite a set value with null.
    const data = {};
    if (email && !existing.email) data.email = email;
    if (input.phone && !existing.phone) data.phone = input.phone;
    if (input.profileUrl && !existing.profileUrl) data.profileUrl = input.profileUrl;
    if (input.photoMediaId && !existing.photoMediaId) data.photoMediaId = input.photoMediaId;
    if (!Object.keys(data).length) return { person: existing, created: false, changed: false };
    return auditedMutation(
      actor,
      async (tx) => ({ person: await tx.person.update({ where: { id: existing.id }, data: { ...data, updatedById: actor?.userId ?? null } }) }),
      ({ person }) => ({
        action: "update",
        entityType: ENTITY,
        entityId: person.id,
        before: personSnapshot(existing),
        after: personSnapshot(person),
        summary: `Updated person "${person.fullName}"`,
      })
    ).then((r) => ({ ...r, created: false, changed: true }));
  }

  return auditedMutation(
    actor,
    async (tx) => ({
      person: await tx.person.create({
        data: {
          fullName,
          personType: input.personType,
          email,
          phone: input.phone ?? null,
          profileUrl: input.profileUrl ?? null,
          photoMediaId: input.photoMediaId ?? null,
          createdById: actor?.userId ?? null,
          updatedById: actor?.userId ?? null,
        },
      }),
    }),
    ({ person }) => ({
      action: "create",
      entityType: ENTITY,
      entityId: person.id,
      after: personSnapshot(person),
      summary: `Created ${person.personType} "${person.fullName}"`,
    })
  ).then((r) => ({ ...r, created: true, changed: true }));
}

// ── directory management (admin People directory) ─────────────────────────────
// These are the ADD / UPDATE / DELETE operations for the person directory itself —
// distinct from upsertPerson (which only fills gaps in service of the roster). They
// authorize on the appointment.* permissions (people are appointment-adjacent) and
// accept a `photoUrl` (resolved to a media_asset).

// ADD a brand-new person. Rejects a name that already exists (edit them instead).
// input: { fullName, personType, email?, phone?, profileUrl?, photoUrl? }
export async function createPerson(input = {}, actor = {}) {
  const fullName = cleanName(input?.fullName);
  if (!fullName) throw new CmsValidationError("A person fullName is required.");
  if (!input?.personType) throw new CmsValidationError("A personType is required (student / faculty / staff / external).");
  await assertActorPermission(actor, "appointment.create");

  const dup = await prisma.person.findFirst({ where: { fullName: { equals: fullName, mode: "insensitive" }, archivedAt: null } });
  if (dup) throw new CmsValidationError(`A person named "${fullName}" already exists — edit them instead.`, { status: 409, code: "PERSON_EXISTS" });
  let email = input.email || null;
  if (email && (await emailWouldCollide(email, null))) throw new CmsValidationError("That email already belongs to another person.");
  const photoMediaId = (await resolvePhotoMediaId(input.photoUrl)) ?? (input.photoMediaId ?? null);

  const { person } = await auditedMutation(
    actor,
    async (tx) => ({
      person: await tx.person.create({
        data: { fullName, personType: input.personType, email, phone: input.phone || null, profileUrl: input.profileUrl || null, photoMediaId, createdById: actor?.userId ?? null, updatedById: actor?.userId ?? null },
      }),
    }),
    ({ person }) => ({ action: "create", entityType: ENTITY, entityId: person.id, after: personSnapshot(person), summary: `Created ${person.personType} "${person.fullName}" (directory)` })
  );
  return { person: personSnapshot(person), created: true };
}

// EDIT an existing person — OVERWRITES the provided fields (unlike upsertPerson). For
// the admin People directory. patch: { fullName?, personType?, email?, phone?,
// profileUrl?, photoUrl? } ("" clears email/phone/profileUrl/photo). Gated appointment.update.
export async function editPerson(id, patch = {}, actor = {}) {
  await assertActorPermission(actor, "appointment.update");
  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) throw new CmsNotFoundError(`Person ${id} not found.`);

  const data = {};
  if (patch.fullName !== undefined) {
    const name = cleanName(patch.fullName);
    if (!name) throw new CmsValidationError("fullName cannot be empty.");
    data.fullName = name;
  }
  if (patch.personType !== undefined && patch.personType) data.personType = patch.personType;
  if (patch.phone !== undefined) data.phone = patch.phone || null;
  if (patch.profileUrl !== undefined) data.profileUrl = patch.profileUrl || null;
  if (patch.email !== undefined) {
    const email = patch.email || null;
    if (email && (await emailWouldCollide(email, id))) throw new CmsValidationError("That email already belongs to another person.");
    data.email = email;
  }
  const photoMediaId = await resolvePhotoMediaId(patch.photoUrl);
  if (photoMediaId !== undefined) data.photoMediaId = photoMediaId;
  if (!Object.keys(data).length) return { person: personSnapshot(existing), changed: false };

  const { person } = await auditedMutation(
    actor,
    async (tx) => ({ person: await tx.person.update({ where: { id }, data: { ...data, updatedById: actor?.userId ?? null } }) }),
    ({ person }) => ({ action: "update", entityType: ENTITY, entityId: person.id, before: personSnapshot(existing), after: personSnapshot(person), summary: `Edited person "${person.fullName}" (directory)` })
  );
  return { person: personSnapshot(person), changed: true };
}

// DELETE from the directory (soft archive → hidden from the directory). Blocked while
// the person still holds ACTIVE appointments, so a live PIC/AD/secretary is never
// orphaned — remove/reassign those appointments first. Gated appointment.archive.
export async function archivePerson(id, actor = {}) {
  await assertActorPermission(actor, "appointment.archive");
  const existing = await prisma.person.findUnique({ where: { id } });
  if (!existing) throw new CmsNotFoundError(`Person ${id} not found.`);
  if (existing.archivedAt) return { person: personSnapshot(existing), changed: false };

  const activeAppointments = await prisma.appointment.count({ where: { personId: id, archivedAt: null } });
  if (activeAppointments > 0) {
    throw new CmsValidationError(
      `"${existing.fullName}" still holds ${activeAppointments} active appointment(s). Remove/archive those appointments first, then delete them from the directory.`,
      { status: 409, code: "PERSON_HAS_APPOINTMENTS" }
    );
  }

  const { person } = await auditedMutation(
    actor,
    async (tx) => ({ person: await tx.person.update({ where: { id }, data: { archivedAt: new Date(), updatedById: actor?.userId ?? null } }) }),
    ({ person }) => ({ action: "archive", entityType: ENTITY, entityId: person.id, before: personSnapshot(existing), summary: `Removed person "${person.fullName}" from the directory` })
  );
  return { person: personSnapshot(person), changed: true };
}
