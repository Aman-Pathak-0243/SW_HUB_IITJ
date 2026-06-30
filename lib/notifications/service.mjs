// Centralized notification / request queue (M0 slice of M7). Backs the
// admin-mediated account lifecycle: a public "Request an account" form and a
// "Forgot password" form create rows here; the admin & developer Password
// Management tabs read them, a stakeholder "Fix"es one (which ASSIGNS it, audited),
// and resolution is tracked. M7 extends this same table (more types/labels,
// threshold alerts, keyset pagination) — no parallel pipeline.
//
// Conventions (the spine): authorize FIRST for reads/assignment/resolution; one
// semantic audit row per assign/resolve (the cross-stakeholder actions) via
// auditedMutation; the public REQUEST create is itself the durable record (no auth
// actor) so it is not audited. `referenceId` is a human, monotonic, DB-unique
// handle minted from the raw-SQL `notification_ref_seq` sequence (race-free).
import prisma, { prismaBase } from "../prisma.mjs";
import { assertActorPermission } from "../year/context.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsValidationError, CmsNotFoundError, CmsError } from "../cms/errors.mjs";
import { normalizeEmail } from "../auth/email.mjs";

const ENTITY = "notification";

export const NOTIFICATION_TYPES = {
  ACCOUNT_REQUEST: "account_request",
  PASSWORD_RESET: "password_reset",
};
export const NOTIFICATION_STATUSES = ["open", "assigned", "resolved", "dismissed"];
const OPEN_STATUSES = ["open", "assigned"];

const REF_PREFIX = { account_request: "AR", password_reset: "PR" };

// ── PURE ──
export function shapeNotification(n) {
  if (!n) return null;
  return {
    id: n.id,
    referenceId: n.referenceId,
    type: n.type,
    status: n.status,
    title: n.title,
    body: n.body ?? null,
    subjectEmail: n.subjectEmail ?? null,
    entityType: n.entityType ?? null,
    entityId: n.entityId ?? null,
    data: n.data ?? null,
    assignedToUserId: n.assignedToUserId ?? null,
    assignedToEmail: n.assignedTo?.email ?? null,
    assignedAt: n.assignedAt instanceof Date ? n.assignedAt.toISOString() : n.assignedAt ?? null,
    resolvedByUserId: n.resolvedByUserId ?? null,
    resolvedByEmail: n.resolvedBy?.email ?? null,
    resolvedAt: n.resolvedAt instanceof Date ? n.resolvedAt.toISOString() : n.resolvedAt ?? null,
    resolutionNote: n.resolutionNote ?? null,
    createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt ?? null,
  };
}

const WITH_PEOPLE = {
  assignedTo: { select: { email: true } },
  resolvedBy: { select: { email: true } },
};

// Mint a human, monotonic, DB-unique reference id (AR-00001 / PR-00001 / NT-00001)
// from the raw-SQL sequence. Concurrent requests can never collide (the sequence is
// atomic; reference_id is also UNIQUE at the DB as a backstop).
async function mintReferenceId(type, client = prismaBase) {
  const rows = await client.$queryRaw`SELECT nextval('notification_ref_seq') AS n`;
  const n = rows?.[0]?.n ?? 0n;
  const prefix = REF_PREFIX[type] ?? "NT";
  return `${prefix}-${String(n).padStart(5, "0")}`;
}

// Find an already-OPEN request of a type for an email so repeated public submissions
// collapse onto one queue row (no flooding).
async function findOpenRequest(type, subjectEmail) {
  return prismaBase.notification.findFirst({
    where: { type, subjectEmail, status: { in: OPEN_STATUSES } },
    include: WITH_PEOPLE,
    orderBy: { createdAt: "desc" },
  });
}

// Insert an OPEN request, deduping race-free: the fast-path findOpenRequest avoids
// burning a sequence number in the common case, and the `notification_one_open_per_
// email_uq` partial unique is the BACKSTOP — two concurrent same-email submissions
// can't both insert (the loser hits P2002 → we return the winner's existing row).
async function createOpenRequest(type, subjectEmail, extra) {
  const dup = await findOpenRequest(type, subjectEmail);
  if (dup) return { notification: shapeNotification(dup), created: false };
  const referenceId = await mintReferenceId(type);
  try {
    const row = await prismaBase.notification.create({
      data: { referenceId, type, status: "open", subjectEmail, ...extra },
      include: WITH_PEOPLE,
    });
    return { notification: shapeNotification(row), created: true };
  } catch (e) {
    // A concurrent request won the race (DB partial-unique). Return its open row.
    if (e?.code === "P2002") {
      const existing = await findOpenRequest(type, subjectEmail);
      if (existing) return { notification: shapeNotification(existing), created: false };
    }
    throw e;
  }
}

// ── public request creators (no auth; the route gates the plugin + CSRF/rate-limit) ──

// "Request an account" — surfaces to admin/dev so they can manually provision the
// account + initial password (delivered via external institute mail).
export async function createAccountRequest({ email, name, message } = {}) {
  const clean = normalizeEmail(email);
  if (!clean) throw new CmsValidationError("A valid email address is required.");
  const data = {};
  if (name) data.name = String(name).slice(0, 200);
  if (message) data.message = String(message).slice(0, 2000);
  return createOpenRequest(NOTIFICATION_TYPES.ACCOUNT_REQUEST, clean, {
    title: `Account request — ${clean}`,
    data: Object.keys(data).length ? data : undefined,
  });
}

// "Forgot password" — surfaces to BOTH the admin & developer Password Management
// tabs. We DO NOT leak whether the account exists to the public caller (the route
// always returns a generic success); the queue row records the account match for
// the stakeholder who fulfils it.
export async function createPasswordResetRequest({ email } = {}) {
  const clean = normalizeEmail(email);
  if (!clean) throw new CmsValidationError("A valid email address is required.");
  const account = await prismaBase.user.findUnique({ where: { email: clean }, select: { id: true } });
  return createOpenRequest(NOTIFICATION_TYPES.PASSWORD_RESET, clean, {
    title: `Password reset — ${clean}`,
    entityType: account ? "app_user" : null,
    entityId: account?.id ?? null,
    data: { accountExists: !!account },
  });
}

// ── reads (gated notification.read) ──
export async function listNotifications({ status, type, assignedToUserId, take = 200 } = {}, actor = {}) {
  await assertActorPermission(actor, "notification.read");
  const where = {};
  if (status) where.status = status;
  if (type) where.type = type;
  if (assignedToUserId) where.assignedToUserId = assignedToUserId;
  const rows = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: WITH_PEOPLE,
  });
  return rows.map(shapeNotification);
}

// Counts by status (for dashboard badges). Gated on notification.read.
export async function getNotificationCounts(actor = {}) {
  await assertActorPermission(actor, "notification.read");
  const grouped = await prisma.notification.groupBy({ by: ["status"], _count: { _all: true } });
  const counts = { open: 0, assigned: 0, resolved: 0, dismissed: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;
  counts.openTotal = counts.open + counts.assigned;
  return counts;
}

export async function getNotification(id, actor = {}) {
  await assertActorPermission(actor, "notification.read");
  const n = await prisma.notification.findUnique({ where: { id }, include: WITH_PEOPLE });
  if (!n) throw new CmsNotFoundError(`Notification ${id} not found.`);
  return shapeNotification(n);
}

// ── mutations (audited) ──

// "Fix" — take a request. ASSIGNS it to the actor (audited), moving open→assigned.
// Idempotent when already held by the actor; a closed request cannot be (re)taken.
export async function assignNotification(id, actor = {}) {
  await assertActorPermission(actor, "notification.assign");
  const existing = await prisma.notification.findUnique({ where: { id }, include: WITH_PEOPLE });
  if (!existing) throw new CmsNotFoundError(`Notification ${id} not found.`);
  if (existing.status === "resolved" || existing.status === "dismissed") {
    throw new CmsError("This request is already closed.", { status: 409, code: "REQUEST_CLOSED" });
  }
  if (existing.status === "assigned" && existing.assignedToUserId === actor?.userId) {
    return { notification: shapeNotification(existing), changed: false };
  }

  const { notification } = await auditedMutation(
    actor,
    async (tx) => ({
      notification: await tx.notification.update({
        where: { id },
        data: { status: "assigned", assignedToUserId: actor?.userId ?? null, assignedAt: new Date() },
        include: WITH_PEOPLE,
      }),
    }),
    ({ notification }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: notification.id,
      before: { status: existing.status, assignedToUserId: existing.assignedToUserId },
      after: { status: notification.status, assignedToUserId: notification.assignedToUserId },
      summary: `Took request ${notification.referenceId} (${notification.type})`,
    })
  );
  return { notification: shapeNotification(notification), changed: true };
}

// Resolve or dismiss a request (audited). `status` ∈ {resolved, dismissed}.
export async function resolveNotification(id, { status = "resolved", note } = {}, actor = {}) {
  await assertActorPermission(actor, "notification.resolve");
  if (!["resolved", "dismissed"].includes(status)) {
    throw new CmsValidationError("Resolution status must be 'resolved' or 'dismissed'.");
  }
  const existing = await prisma.notification.findUnique({ where: { id }, include: WITH_PEOPLE });
  if (!existing) throw new CmsNotFoundError(`Notification ${id} not found.`);
  if (existing.status === status) return { notification: shapeNotification(existing), changed: false };

  const { notification } = await auditedMutation(
    actor,
    async (tx) => ({
      notification: await tx.notification.update({
        where: { id },
        data: {
          status,
          resolvedByUserId: actor?.userId ?? null,
          resolvedAt: new Date(),
          resolutionNote: note ? String(note).slice(0, 2000) : null,
        },
        include: WITH_PEOPLE,
      }),
    }),
    ({ notification }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: notification.id,
      before: { status: existing.status },
      after: { status: notification.status },
      summary: `${status === "dismissed" ? "Dismissed" : "Resolved"} request ${notification.referenceId}`,
    })
  );
  return { notification: shapeNotification(notification), changed: true };
}
