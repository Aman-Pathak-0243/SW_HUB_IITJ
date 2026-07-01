// M5 — event CLOSURE reports (DL-088). After an event, an organizing stakeholder may
// submit an OPTIONAL markdown closure report (their role + contribution + a
// self-reported budget). A CENTRAL admin reviews it → a comment + a corrected budget.
// One report per (event, submitter). Stakeholder DATA-ISSUE feedback reuses the M7
// `feedback` table (no new table) — a submitter files a ticket referencing the event.
//
// Authorization (DL-086/088):
//   • submit  — assertEventManage (an organizing coordinator OR staff/admin) submits
//               THEIR OWN report (submittedById = actor).
//   • review  — requireGlobal event.manage (central admin/staff/dev) writes the review
//               comment + corrected budget. A scoped coordinator cannot review.
// Both are audited (one semantic row each). Markdown rendered escape-first (DL-077).
import prisma from "../prisma.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import { assertEventManage } from "./authz.mjs";
import { normalizeBudget, normalizeReportBody } from "./forms.mjs";

const ENTITY = "event_closure_report";

const asNum = (v) => (v == null ? null : typeof v === "object" && typeof v.toNumber === "function" ? v.toNumber() : Number(v));

export function shapeClosureReport(r) {
  if (!r) return null;
  return {
    id: r.id,
    eventItemId: r.eventItemId,
    submittedById: r.submittedById,
    submitterName: r.submittedBy?.name ?? null,
    submitterEmail: r.submittedBy?.email ?? null,
    roleContribution: r.roleContribution,
    reportedBudget: asNum(r.reportedBudget),
    status: r.status,
    reviewComment: r.reviewComment ?? null,
    correctedBudget: asNum(r.correctedBudget),
    reviewedById: r.reviewedById ?? null,
    reviewerName: r.reviewedBy?.name ?? null,
    reviewedAt: r.reviewedAt instanceof Date ? r.reviewedAt.toISOString() : r.reviewedAt ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt ?? null,
  };
}

const WITH_PEOPLE = {
  submittedBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true } },
};

// Submit (or update) the actor's OWN closure report for an event. Idempotent by
// (event, submitter) — re-submitting a report updates the body/budget and returns it to
// status 'submitted' for a fresh review, CLEARING any prior review (comment / corrected
// budget / reviewer / timestamp) so a re-submitted report never shows a stale review
// against a now-changed body (review). A new review overwrites these fields again.
export async function submitClosureReport(input = {}, actor = {}) {
  const item = await assertEventManage(actor, input.eventItemId); // authorize FIRST (organizer)
  if (!actor?.userId) { const e = new Error("An actor is required."); e.status = 401; e.code = "UNAUTHENTICATED"; throw e; }
  const roleContribution = normalizeReportBody(input.roleContribution);
  const reportedBudget = normalizeBudget(input.reportedBudget);
  const existing = await prisma.eventClosureReport.findUnique({ where: { eventItemId_submittedById: { eventItemId: item.id, submittedById: actor.userId } } });

  const { report } = await auditedMutation(
    actor,
    async (tx) => ({
      report: await tx.eventClosureReport.upsert({
        where: { eventItemId_submittedById: { eventItemId: item.id, submittedById: actor.userId } },
        create: { eventItemId: item.id, submittedById: actor.userId, roleContribution, reportedBudget: reportedBudget ?? null, status: "submitted" },
        update: {
          roleContribution,
          ...(reportedBudget !== undefined ? { reportedBudget } : {}),
          status: "submitted",
          // Clear any prior review — a re-submitted report is genuinely pending re-review.
          reviewComment: null,
          correctedBudget: null,
          reviewedById: null,
          reviewedAt: null,
        },
        include: WITH_PEOPLE,
      }),
    }),
    ({ report }) => ({
      action: existing ? "update" : "create",
      entityType: ENTITY,
      entityId: report.id,
      academicYearId: item.academicYearId,
      before: existing ? { status: existing.status } : undefined,
      after: { status: report.status, hasBudget: report.reportedBudget != null },
      summary: `${existing ? "Updated" : "Submitted"} closure report for event ${item.id}`,
    })
  );
  return { report: shapeClosureReport(report) };
}

// CENTRAL review: add a comment + a corrected budget (marks status='reviewed').
// requireGlobal event.manage (a scoped coordinator cannot review — DL-088).
export async function reviewClosureReport(reportId, patch = {}, actor = {}) {
  const existing = await prisma.eventClosureReport.findUnique({ where: { id: reportId }, include: WITH_PEOPLE });
  if (!existing) throw new CmsNotFoundError(`Closure report ${reportId} not found.`);
  const item = await assertEventManage(actor, existing.eventItemId, { requireGlobal: true }); // CENTRAL
  const correctedBudget = normalizeBudget(patch.correctedBudget);
  const comment = patch.reviewComment != null ? String(patch.reviewComment).slice(0, 20000) : undefined;
  if (comment === undefined && correctedBudget === undefined) {
    throw new CmsValidationError("A review needs a comment and/or a corrected budget.");
  }

  const { report } = await auditedMutation(
    actor,
    async (tx) => ({
      report: await tx.eventClosureReport.update({
        where: { id: reportId },
        data: {
          ...(comment !== undefined ? { reviewComment: comment } : {}),
          ...(correctedBudget !== undefined ? { correctedBudget } : {}),
          status: "reviewed",
          reviewedById: actor?.userId ?? null,
          reviewedAt: new Date(),
        },
        include: WITH_PEOPLE,
      }),
    }),
    ({ report }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: report.id,
      academicYearId: item.academicYearId,
      before: { status: existing.status, correctedBudget: asNum(existing.correctedBudget) },
      after: { status: report.status, correctedBudget: asNum(report.correctedBudget) },
      summary: `Reviewed closure report ${report.id} for event ${item.id}`,
    })
  );
  return { report: shapeClosureReport(report) };
}

// Read an event's closure reports (organizer + admin view). GATED via assertEventManage
// (they carry submitter identity + budget). Ordered newest-first.
export async function listClosureReports(eventItemId, actor = {}, { client = prisma } = {}) {
  const item = await assertEventManage(actor, eventItemId);
  const rows = await client.eventClosureReport.findMany({ where: { eventItemId: item.id }, orderBy: { createdAt: "desc" }, include: WITH_PEOPLE });
  return rows.map(shapeClosureReport);
}
