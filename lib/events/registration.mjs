// M5 — event REGISTRATION (DL-087). Two audiences:
//   • MEMBER self-service (LOGIN-ONLY) — registerForEvent / cancelRegistration. Gated
//     by the M1 assertCanParticipate() active-only seam (an inactive account can browse
//     but not participate). The DB PARTIAL UNIQUE (event,user) WHERE status<>'cancelled'
//     dedups active registrations; capacity → WAITLIST is a service decision
//     (registrationOutcome) with the DEFERRED cardinality trigger as the concurrency
//     backstop (DL-009/021). Self actions are the durable row and are NOT audited.
//   • ORGANIZER management — addRegistration / setRegistrationStatus / removeRegistration,
//     gated by assertEventManage (a coordinator of an organizing club, or staff/admin).
//     These cross-stakeholder changes ARE audited (one semantic row each).
import prisma from "../prisma.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { withMappedDbErrors, CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import { normalizeEmail } from "../auth/email.mjs";
import { assertCanParticipate } from "../auth/session.mjs";
import { assertEventManage, loadEventOrThrow } from "./authz.mjs";
import { isRegistrationOpen, registrationOutcome, normalizeRegistrationStatus } from "./forms.mjs";
import { getEventSettings } from "./settings.mjs";

const ENTITY = "event_registration";
const WITH_USER = { user: { select: { id: true, email: true, name: true, status: true } } };

// PII shape (email/name) — for the GATED organizer roster only.
export function shapeRegistration(r) {
  if (!r) return null;
  return {
    id: r.id,
    eventItemId: r.eventItemId,
    userId: r.userId,
    userEmail: r.user?.email ?? null,
    userName: r.user?.name ?? null,
    userStatus: r.user?.status ?? null,
    status: r.status,
    teamName: r.teamName ?? null,
    note: r.note ?? null,
    registeredAt: r.registeredAt instanceof Date ? r.registeredAt.toISOString() : r.registeredAt ?? null,
  };
}

// PII-free shape for a member's own registration (own data — no email exposure needed).
export function shapeMyRegistration(r) {
  if (!r) return null;
  return {
    id: r.id,
    eventItemId: r.eventItemId,
    status: r.status,
    teamName: r.teamName ?? null,
    registeredAt: r.registeredAt instanceof Date ? r.registeredAt.toISOString() : r.registeredAt ?? null,
  };
}

// PURE keyset cursor (registeredAt + id; the id is a uuid, not monotonic).
export function encodeRegCursor(row) {
  if (!row) return null;
  const iso = row.registeredAt instanceof Date ? row.registeredAt.toISOString() : String(row.registeredAt);
  return Buffer.from(`${iso}|${row.id}`, "utf8").toString("base64url");
}
export function decodeRegCursor(cursor) {
  if (!cursor) return null;
  const raw = Buffer.from(String(cursor), "base64url").toString("utf8");
  const i = raw.lastIndexOf("|");
  if (i < 0) throw new CmsValidationError(`Invalid cursor '${cursor}'.`);
  const registeredAt = new Date(raw.slice(0, i));
  const id = raw.slice(i + 1);
  if (Number.isNaN(registeredAt.getTime()) || !id) throw new CmsValidationError(`Invalid cursor '${cursor}'.`);
  return { registeredAt, id };
}

function eventOpenOrThrow(item) {
  if (item.status !== "published") {
    throw new CmsValidationError("This event is not open for registration yet.", { status: 409, code: "EVENT_NOT_OPEN" });
  }
}

// ── MEMBER self-service (login-only; NOT audited — the row is the durable record) ──

// Register the signed-in member for an event. `member` is the requireMember() object
// (carries a live status) OR a userId string. Idempotent: an existing ACTIVE
// registration is returned unchanged. Assigns confirmed/waitlisted by capacity.
export async function registerForEvent(input = {}, member, actor = {}) {
  const item = await loadEventOrThrow(input.eventItemId);
  eventOpenOrThrow(item);
  await assertCanParticipate(member ?? actor?.userId); // M1 active-only seam (403 if not)
  const userId = (member && typeof member === "object" ? member.id : member) ?? actor?.userId;
  if (!userId) {
    const e = new Error("A member id is required to register."); e.status = 401; e.code = "UNAUTHENTICATED"; throw e;
  }

  const settings = await getEventSettings(item.id);
  if (!isRegistrationOpen(settings)) {
    throw new CmsValidationError("Registration for this event is closed.", { status: 409, code: "REGISTRATION_CLOSED" });
  }

  const active = await prisma.eventRegistration.findFirst({ where: { eventItemId: item.id, userId, status: { not: "cancelled" } } });
  if (active) return { registration: shapeMyRegistration(active), changed: false };

  const create = async (status) =>
    prisma.eventRegistration.create({
      data: { eventItemId: item.id, userId, status, teamName: input.teamName ?? null, note: input.note ?? null, createdById: userId },
    });

  const confirmed = await prisma.eventRegistration.count({ where: { eventItemId: item.id, status: "confirmed" } });
  const outcome = registrationOutcome(confirmed, settings?.capacity ?? null);
  const row = await withMappedDbErrors(async () => {
    try {
      return await create(outcome);
    } catch (e) {
      // Lost the capacity race (the deferred guard rejected a confirmed insert) → the
      // event just filled; retry as waitlisted so the member still gets a spot in line.
      if (outcome === "confirmed" && String(e?.message ?? "").includes("event_registration_capacity_guard")) {
        return create("waitlisted");
      }
      throw e;
    }
  });
  return { registration: shapeMyRegistration(row), changed: true };
}

// Cancel the signed-in member's OWN active registration. When a CONFIRMED spot frees
// up under a capacity, the earliest waitlisted member is auto-promoted. NOT audited.
export async function cancelRegistration(input = {}, member, actor = {}) {
  const item = await loadEventOrThrow(input.eventItemId);
  const userId = (member && typeof member === "object" ? member.id : member) ?? actor?.userId;
  if (!userId) { const e = new Error("A member id is required."); e.status = 401; e.code = "UNAUTHENTICATED"; throw e; }

  const active = await prisma.eventRegistration.findFirst({ where: { eventItemId: item.id, userId, status: { not: "cancelled" } } });
  if (!active) return { changed: false };
  const wasConfirmed = active.status === "confirmed";

  await withMappedDbErrors(() =>
    prisma.$transaction(async (tx) => {
      await tx.eventRegistration.update({ where: { id: active.id }, data: { status: "cancelled", cancelledAt: new Date() } });
      if (wasConfirmed) await promoteEarliestWaitlisted(tx, item.id);
    })
  );
  return { changed: true };
}

// Promote the earliest-registered waitlisted member to confirmed when a confirmed seat
// frees up under a capacity. Called from EVERY path that vacates a confirmed seat —
// member self-cancel AND organizer cancel/remove/downgrade — so a freed seat is never
// stranded regardless of who freed it (review). Runs inside a caller transaction.
//
// CONCURRENCY: the earliest waitlisted row is selected FOR UPDATE SKIP LOCKED, so two
// concurrent confirmed-cancellations lock DISTINCT waitlisted rows and each promotes a
// different member (rather than both racing to promote the same earliest row and leaving
// one freed seat empty). The DEFERRED capacity trigger backstops the upper bound.
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
async function promoteEarliestWaitlisted(tx, eventItemId, excludeId = null) {
  const settings = await tx.eventSettings.findUnique({ where: { eventItemId }, select: { capacity: true } });
  const capacity = settings?.capacity ?? null;
  if (capacity == null) return null; // unlimited → nobody was waitlisted for capacity
  const confirmed = await tx.eventRegistration.count({ where: { eventItemId, status: "confirmed" } });
  if (confirmed >= capacity) return null; // still full
  // `excludeId` skips the row the caller just DOWNGRADED to waitlisted, so an organizer
  // moving a member confirmed→waitlisted can't immediately re-promote that same row.
  const rows = await tx.$queryRaw`
    SELECT id FROM event_registration
    WHERE event_item_id = ${eventItemId}::uuid AND status = 'waitlisted' AND id <> ${excludeId ?? NIL_UUID}::uuid
    ORDER BY registered_at ASC
    LIMIT 1 FOR UPDATE SKIP LOCKED`;
  const next = Array.isArray(rows) ? rows[0] : null;
  if (!next) return null;
  return tx.eventRegistration.update({ where: { id: next.id }, data: { status: "confirmed" } });
}

// Promote waitlisted members when CAPACITY is RAISED (consolidation review B4). Raising
// capacity is a seat-CREATING path the seat-vacating promotion above didn't cover, so a
// higher (or newly-unlimited) capacity used to strand the existing waitlist. Called by
// upsertEventSettings after a capacity change. Fills exactly the open seats from the front
// of the waitlist (earliest-registered first), FOR UPDATE SKIP LOCKED so a concurrent
// registration/cancel can't double-fill. The DEFERRED capacity trigger backstops the bound.
export async function promoteWaitlistForCapacity(eventItemId, { client = prisma } = {}) {
  if (!eventItemId) return { promoted: 0 };
  return client.$transaction(async (tx) => {
    const settings = await tx.eventSettings.findUnique({ where: { eventItemId }, select: { capacity: true } });
    const capacity = settings?.capacity ?? null;
    let openSeats = null; // null ⇒ unlimited ⇒ promote ALL remaining waitlisted
    if (capacity != null) {
      const confirmed = await tx.eventRegistration.count({ where: { eventItemId, status: "confirmed" } });
      openSeats = capacity - confirmed;
      if (openSeats <= 0) return { promoted: 0 };
    }
    const rows = openSeats == null
      ? await tx.$queryRaw`
          SELECT id FROM event_registration
          WHERE event_item_id = ${eventItemId}::uuid AND status = 'waitlisted'
          ORDER BY registered_at ASC FOR UPDATE SKIP LOCKED`
      : await tx.$queryRaw`
          SELECT id FROM event_registration
          WHERE event_item_id = ${eventItemId}::uuid AND status = 'waitlisted'
          ORDER BY registered_at ASC LIMIT ${openSeats} FOR UPDATE SKIP LOCKED`;
    const ids = (Array.isArray(rows) ? rows : []).map((r) => r.id);
    if (!ids.length) return { promoted: 0 };
    await tx.eventRegistration.updateMany({ where: { id: { in: ids } }, data: { status: "confirmed" } });
    return { promoted: ids.length };
  });
}

// ── ORGANIZER management (audited; assertEventManage) ──

async function resolveUser(input, client) {
  if (input.userId) {
    const u = await client.user.findUnique({ where: { id: input.userId }, select: { id: true, email: true } });
    if (!u) throw new CmsValidationError("Unknown account (userId).");
    return u;
  }
  const email = normalizeEmail(input.email);
  if (!email) throw new CmsValidationError("A userId or a valid email is required.");
  const u = await client.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!u) throw new CmsValidationError(`No account exists for ${email}. Create the account first (M0).`);
  return u;
}

// Organizer manually registers a participant (e.g. a walk-in). Audited.
export async function addRegistration(input = {}, actor = {}) {
  const item = await assertEventManage(actor, input.eventItemId); // authorize FIRST
  const status = input.status ? normalizeRegistrationStatus(input.status) : "confirmed";
  if (status === "cancelled") throw new CmsValidationError("Add a registration as confirmed or waitlisted, not cancelled.");
  const user = await resolveUser(input, prisma);
  const existing = await prisma.eventRegistration.findFirst({ where: { eventItemId: item.id, userId: user.id, status: { not: "cancelled" } } });
  if (existing) return { registration: shapeRegistration({ ...existing, user: { id: user.id, email: user.email } }), changed: false };

  const { reg } = await auditedMutation(
    actor,
    async (tx) => ({
      reg: await tx.eventRegistration.create({
        data: { eventItemId: item.id, userId: user.id, status, teamName: input.teamName ?? null, note: input.note ?? null, createdById: actor?.userId ?? null },
        include: WITH_USER,
      }),
    }),
    ({ reg }) => ({
      action: "create",
      entityType: ENTITY,
      entityId: reg.id,
      academicYearId: item.academicYearId,
      after: { userEmail: reg.user?.email, status: reg.status },
      summary: `Registered ${reg.user?.email ?? reg.userId} for event ${item.id} (${reg.status})`,
    })
  );
  return { registration: shapeRegistration(reg), changed: true };
}

// Organizer changes a registration's status (promote waitlisted→confirmed, cancel, …).
export async function setRegistrationStatus(registrationId, status, actor = {}) {
  const normalized = normalizeRegistrationStatus(status);
  const existing = await prisma.eventRegistration.findUnique({ where: { id: registrationId }, include: WITH_USER });
  if (!existing) throw new CmsNotFoundError(`Registration ${registrationId} not found.`);
  const item = await assertEventManage(actor, existing.eventItemId);
  if (existing.status === normalized) return { registration: shapeRegistration(existing), changed: false };

  // Vacating a CONFIRMED seat (→ waitlisted/cancelled) frees capacity → auto-promote the
  // earliest waitlisted member, exactly like a member self-cancel (review: was stranded).
  const freesSeat = existing.status === "confirmed" && normalized !== "confirmed";
  const { reg } = await auditedMutation(
    actor,
    async (tx) => {
      const reg = await tx.eventRegistration.update({
        where: { id: registrationId },
        data: { status: normalized, cancelledAt: normalized === "cancelled" ? new Date() : null },
        include: WITH_USER,
      });
      if (freesSeat) await promoteEarliestWaitlisted(tx, item.id, registrationId); // exclude the row just downgraded
      return { reg };
    },
    ({ reg }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: reg.id,
      academicYearId: item.academicYearId,
      before: { status: existing.status },
      after: { status: reg.status },
      summary: `Registration ${reg.user?.email ?? reg.userId} for event ${item.id}: ${existing.status} → ${reg.status}`,
    })
  );
  return { registration: shapeRegistration(reg), changed: true };
}

// Organizer removes a registration (hard delete). Audited with a before-snapshot.
export async function removeRegistration(registrationId, actor = {}) {
  const existing = await prisma.eventRegistration.findUnique({ where: { id: registrationId }, include: WITH_USER });
  if (!existing) throw new CmsNotFoundError(`Registration ${registrationId} not found.`);
  const item = await assertEventManage(actor, existing.eventItemId);
  const freesSeat = existing.status === "confirmed";
  await auditedMutation(
    actor,
    async (tx) => {
      await tx.eventRegistration.delete({ where: { id: registrationId } });
      if (freesSeat) await promoteEarliestWaitlisted(tx, item.id); // don't strand the freed seat
      return { existing };
    },
    () => ({
      action: "delete",
      entityType: ENTITY,
      entityId: existing.id,
      academicYearId: item.academicYearId,
      before: { userEmail: existing.user?.email, status: existing.status },
      summary: `Removed registration ${existing.user?.email ?? existing.userId} from event ${item.id}`,
    })
  );
  return { removed: true };
}

// ── reads ──

// Keyset-paginated registration roster (PII — emails/names — so GATED via
// assertEventManage). { entries, nextCursor, hasMore }. Newest-first.
export async function listRegistrations(input = {}, actor = {}) {
  const item = await assertEventManage(actor, input.eventItemId);
  const n = Math.min(Math.max(Number(input.take) || 200, 1), 1000);
  const where = { eventItemId: item.id };
  if (input.status) where.status = normalizeRegistrationStatus(input.status);
  if (input.cursor) {
    const c = decodeRegCursor(input.cursor);
    where.OR = [{ registeredAt: { lt: c.registeredAt } }, { registeredAt: c.registeredAt, id: { lt: c.id } }];
  }
  const rows = await prisma.eventRegistration.findMany({
    where,
    orderBy: [{ registeredAt: "desc" }, { id: "desc" }],
    take: n + 1,
    include: WITH_USER,
  });
  const hasMore = rows.length > n;
  const page = hasMore ? rows.slice(0, n) : rows;
  return {
    entries: page.map(shapeRegistration),
    nextCursor: hasMore && page.length ? encodeRegCursor(page[page.length - 1]) : null,
    hasMore,
  };
}

// Public aggregate registration counts (no PII, ungated). { confirmed, waitlisted, total }.
export async function getRegistrationCounts(eventItemId, { client = prisma } = {}) {
  if (!eventItemId) return { confirmed: 0, waitlisted: 0, total: 0 };
  const grouped = await client.eventRegistration.groupBy({
    by: ["status"],
    where: { eventItemId, status: { not: "cancelled" } },
    _count: { _all: true },
  });
  const map = new Map(grouped.map((g) => [g.status, g._count._all]));
  const confirmed = map.get("confirmed") ?? 0;
  const waitlisted = map.get("waitlisted") ?? 0;
  return { confirmed, waitlisted, total: confirmed + waitlisted };
}

// The signed-in member's own registration for an event (or null). Self data — no gate.
export async function getMyRegistration(eventItemId, userId, { client = prisma } = {}) {
  if (!eventItemId || !userId) return null;
  const row = await client.eventRegistration.findFirst({ where: { eventItemId, userId, status: { not: "cancelled" } } });
  return shapeMyRegistration(row);
}

// A member's active registrations across events (their "my events"), each resolved to
// the event's title/slug. Self read — no gate. Newest-first.
export async function listUserRegistrations(userId, { client = prisma } = {}) {
  if (!userId) return [];
  const rows = await client.eventRegistration.findMany({
    where: { userId, status: { not: "cancelled" } },
    orderBy: { registeredAt: "desc" },
    include: { event: { select: { id: true, slug: true, publishedRevisionId: true, status: true } } },
  });
  if (!rows.length) return [];
  const revIds = [...new Set(rows.map((r) => r.event?.publishedRevisionId).filter(Boolean))];
  const revs = revIds.length ? await client.contentRevision.findMany({ where: { id: { in: revIds } }, select: { id: true, title: true } }) : [];
  const titleByRev = new Map(revs.map((r) => [r.id, r.title]));
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    registeredAt: r.registeredAt instanceof Date ? r.registeredAt.toISOString() : r.registeredAt ?? null,
    event: r.event
      ? { id: r.event.id, slug: r.event.slug, title: titleByRev.get(r.event.publishedRevisionId) ?? null, published: r.event.status === "published" }
      : null,
  }));
}
