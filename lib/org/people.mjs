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
import { CmsValidationError } from "../cms/errors.mjs";
import { cleanName } from "./normalize.mjs";

const ENTITY = "person";

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
