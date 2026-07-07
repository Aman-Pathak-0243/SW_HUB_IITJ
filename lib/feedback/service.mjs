// Feedback / support tickets (M7, DL-070) — a STANDALONE table (the DL-038 rule:
// not CMS content). A public form creates a ticket with a human, DB-unique
// `reference_id` (FB-NNNNN from the raw-SQL `feedback_ref_seq`) so a user can
// reference a bug against any component/service id; stakeholders triage → assign →
// resolve through a CHECK-guarded `status` workflow.
//
// Conventions (the spine): authorize FIRST for reads/assignment/resolution; one
// semantic audit row per assign/status change (the cross-stakeholder actions) via
// auditedMutation; the public CREATE is itself the durable record (no auth actor)
// so it is not audited. Reads are keyset-paginated newest-first.
import prisma, { prismaBase } from "../prisma.mjs";
import { assertActorPermission } from "../year/context.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsValidationError, CmsNotFoundError, CmsError } from "../cms/errors.mjs";
import { normalizeEmail } from "../auth/email.mjs";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  FEEDBACK_RESOLUTION_STATUSES,
  validateFeedbackForm,
} from "./forms.mjs";

export { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES };

const ENTITY = "feedback";
const READ_PERM = "feedback.read";
const RESOLVE_PERM = "feedback.resolve";

const WITH_PEOPLE = {
  submitter: { select: { email: true } },
  assignedTo: { select: { email: true } },
  resolvedBy: { select: { email: true } },
};

// ── PURE ──
export function shapeFeedback(f) {
  if (!f) return null;
  return {
    id: f.id,
    referenceId: f.referenceId,
    category: f.category,
    status: f.status,
    subject: f.subject,
    body: f.body,
    component: f.component ?? null,
    submitterEmail: f.submitterEmail ?? f.submitter?.email ?? null,
    submitterUserId: f.submitterUserId ?? null,
    assignedToUserId: f.assignedToUserId ?? null,
    assignedToEmail: f.assignedTo?.email ?? null,
    assignedAt: f.assignedAt instanceof Date ? f.assignedAt.toISOString() : f.assignedAt ?? null,
    resolvedByUserId: f.resolvedByUserId ?? null,
    resolvedByEmail: f.resolvedBy?.email ?? null,
    resolvedAt: f.resolvedAt instanceof Date ? f.resolvedAt.toISOString() : f.resolvedAt ?? null,
    resolutionNote: f.resolutionNote ?? null,
    createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt ?? null,
  };
}

// PURE keyset cursor (createdAt + id; feedback.id is a uuid, not monotonic).
export function encodeFeedbackCursor(row) {
  if (!row) return null;
  const iso = row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt);
  return Buffer.from(`${iso}|${row.id}`, "utf8").toString("base64url");
}
export function decodeFeedbackCursor(cursor) {
  if (!cursor) return null;
  const raw = Buffer.from(String(cursor), "base64url").toString("utf8");
  const i = raw.lastIndexOf("|");
  if (i < 0) throw new CmsValidationError(`Invalid cursor '${cursor}'.`);
  const createdAt = new Date(raw.slice(0, i));
  const id = raw.slice(i + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) throw new CmsValidationError(`Invalid cursor '${cursor}'.`);
  return { createdAt, id };
}

async function mintReferenceId(client = prismaBase) {
  const rows = await client.$queryRaw`SELECT nextval('feedback_ref_seq') AS n`;
  const n = rows?.[0]?.n ?? 0n;
  return `FB-${String(n).padStart(5, "0")}`;
}

// ── public create (no auth; the route gates the plugin + CSRF/rate-limit) ──
// `submitterUserId` is supplied by the route ONLY for an authenticated session (it
// is never accepted from the public body). Returns the shaped ticket incl. its ref id.
export async function createFeedback(input = {}, { submitterUserId = null } = {}) {
  const v = validateFeedbackForm(input);
  if (!v.ok) {
    const first = Object.values(v.errors)[0];
    throw new CmsValidationError(first || "Invalid feedback.", { code: "INVALID_FEEDBACK", details: v.errors });
  }
  const submitterEmail = v.value.email ? normalizeEmail(v.value.email) : null;
  const referenceId = await mintReferenceId();
  const row = await prismaBase.feedback.create({
    data: {
      referenceId,
      category: v.value.category,
      status: "open",
      subject: v.value.subject,
      body: v.value.body,
      component: v.value.component ?? null,
      submitterEmail,
      submitterUserId: submitterUserId ?? null,
    },
    include: WITH_PEOPLE,
  });
  return { feedback: shapeFeedback(row), created: true };
}

// ── reads (gated feedback.read) ──
export async function listFeedbackPage({ status, category, assignedToUserId, cursor, take = 50 } = {}, actor = {}) {
  await assertActorPermission(actor, READ_PERM);
  const n = Math.min(Math.max(Number(take) || 50, 1), 200);
  const where = {};
  if (status) where.status = status;
  if (category) where.category = category;
  if (assignedToUserId) where.assignedToUserId = assignedToUserId;
  if (cursor) {
    const c = decodeFeedbackCursor(cursor);
    where.OR = [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }];
  }
  const rows = await prisma.feedback.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: n + 1,
    include: WITH_PEOPLE,
  });
  const hasMore = rows.length > n;
  const page = hasMore ? rows.slice(0, n) : rows;
  return {
    entries: page.map(shapeFeedback),
    nextCursor: hasMore && page.length ? encodeFeedbackCursor(page[page.length - 1]) : null,
    hasMore,
  };
}

export async function getFeedbackCounts(actor = {}) {
  await assertActorPermission(actor, READ_PERM);
  const grouped = await prisma.feedback.groupBy({ by: ["status"], _count: { _all: true } });
  const counts = { open: 0, triaged: 0, in_progress: 0, resolved: 0, dismissed: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;
  counts.openTotal = counts.open + counts.triaged + counts.in_progress;
  return counts;
}

export async function getFeedback(id, actor = {}) {
  await assertActorPermission(actor, READ_PERM);
  const row = await prisma.feedback.findUnique({ where: { id }, include: WITH_PEOPLE });
  if (!row) throw new CmsNotFoundError(`Feedback ${id} not found.`);
  return shapeFeedback(row);
}

// ── mutations (audited, gated feedback.resolve) ──

// "Take" a ticket — assign it to the actor (audited). Idempotent when already held.
// A closed (resolved/dismissed) ticket cannot be (re)assigned.
export async function assignFeedback(id, actor = {}) {
  await assertActorPermission(actor, RESOLVE_PERM);
  const existing = await prisma.feedback.findUnique({ where: { id }, include: WITH_PEOPLE });
  if (!existing) throw new CmsNotFoundError(`Feedback ${id} not found.`);
  if (existing.status === "resolved" || existing.status === "dismissed") {
    throw new CmsError("This ticket is already closed.", { status: 409, code: "FEEDBACK_CLOSED" });
  }
  if (existing.assignedToUserId === actor?.userId && existing.status !== "open") {
    return { feedback: shapeFeedback(existing), changed: false };
  }
  const { feedback } = await auditedMutation(
    actor,
    async (tx) => ({
      feedback: await tx.feedback.update({
        where: { id },
        data: {
          assignedToUserId: actor?.userId ?? null,
          assignedAt: new Date(),
          // taking an untriaged ticket moves it into the workflow
          status: existing.status === "open" ? "triaged" : existing.status,
        },
        include: WITH_PEOPLE,
      }),
    }),
    ({ feedback }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: feedback.id,
      before: { status: existing.status, assignedToUserId: existing.assignedToUserId },
      after: { status: feedback.status, assignedToUserId: feedback.assignedToUserId },
      summary: `Took feedback ${feedback.referenceId} (${feedback.category})`,
    })
  );
  return { feedback: shapeFeedback(feedback), changed: true };
}

// Move a ticket's status (triaged | in_progress | resolved | dismissed), with an
// optional resolution note recorded on resolve/dismiss (audited).
export async function setFeedbackStatus(id, { status, note } = {}, actor = {}) {
  await assertActorPermission(actor, RESOLVE_PERM);
  if (!FEEDBACK_RESOLUTION_STATUSES.includes(status)) {
    throw new CmsValidationError(`Status must be one of: ${FEEDBACK_RESOLUTION_STATUSES.join(", ")}.`);
  }
  const existing = await prisma.feedback.findUnique({ where: { id }, include: WITH_PEOPLE });
  if (!existing) throw new CmsNotFoundError(`Feedback ${id} not found.`);
  if (existing.status === status && !note) return { feedback: shapeFeedback(existing), changed: false };

  const closing = status === "resolved" || status === "dismissed";
  const { feedback } = await auditedMutation(
    actor,
    async (tx) => ({
      feedback: await tx.feedback.update({
        where: { id },
        data: {
          status,
          // Closing stamps resolvedBy/resolvedAt AND keeps/sets the resolution note;
          // RE-OPENING to a live status (triaged/in_progress) CLEARS resolvedBy/resolvedAt
          // AND the resolution note (unless a new note is supplied) so a now-live ticket
          // can't show a stale resolution (Session-11 review + consolidation review B8 —
          // the note was previously left behind on reopen).
          resolutionNote: note != null ? String(note).slice(0, 2000) : closing ? existing.resolutionNote : null,
          resolvedByUserId: closing ? actor?.userId ?? null : null,
          resolvedAt: closing ? new Date() : null,
        },
        include: WITH_PEOPLE,
      }),
    }),
    ({ feedback }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: feedback.id,
      before: { status: existing.status },
      after: { status: feedback.status },
      summary: `Feedback ${feedback.referenceId} → ${status}`,
    })
  );
  return { feedback: shapeFeedback(feedback), changed: true };
}
