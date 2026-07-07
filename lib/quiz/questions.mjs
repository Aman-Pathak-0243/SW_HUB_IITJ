// LIVE-QUIZ question authoring (Session 16, DL-104/105). Organizer-only: every mutation
// authorizes via the assertEventManage seam FIRST (GLOBAL staff/admin/dev OR SCOPED to a
// tagged organizing club lineage, DL-086) and writes ONE semantic audit row (a
// cross-stakeholder op). Questions are the event's durable question bank, reused across
// live sessions. Validation is the PURE lib/quiz/forms.mjs (mirrored client-side, DL-051).
import prisma from "../prisma.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import { assertEventManage } from "../events/authz.mjs";
import { normalizeQuestion, normalizeQuestionPatch } from "./forms.mjs";

const ENTITY = "quiz_question";

// Full shape for the HOST/organizer (includes the correct answers).
export function shapeQuestion(q) {
  if (!q) return null;
  return {
    id: q.id,
    eventItemId: q.eventItemId,
    prompt: q.prompt,
    options: Array.isArray(q.options) ? q.options : [],
    correctOptionIds: q.correctOptionIds ?? [],
    points: q.points,
    timeLimitSeconds: q.timeLimitSeconds,
    sortOrder: q.sortOrder,
  };
}

// PLAYER-facing shape — NEVER leaks the correct answers (anti-cheat). Used in the live
// participant snapshot while a question is active.
export function shapeQuestionForPlayer(q) {
  if (!q) return null;
  return {
    id: q.id,
    prompt: q.prompt,
    options: (Array.isArray(q.options) ? q.options : []).map((o) => ({ id: o.id, text: o.text })),
    points: q.points,
    timeLimitSeconds: q.timeLimitSeconds,
    sortOrder: q.sortOrder,
  };
}

async function loadQuestionOrThrow(questionId, client = prisma) {
  if (!questionId) throw new CmsValidationError("A question id is required.");
  const q = await client.quizQuestion.findUnique({ where: { id: questionId } });
  if (!q) throw new CmsNotFoundError(`Quiz question ${questionId} not found.`);
  return q;
}

// Ordered question bank for an event (host view — includes correct answers). Gated.
export async function listQuestionsForHost(eventItemId, actor = {}) {
  const item = await assertEventManage(actor, eventItemId);
  const rows = await prisma.quizQuestion.findMany({
    where: { eventItemId: item.id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(shapeQuestion);
}

// Create a question. Authorize FIRST. sortOrder defaults to append-at-end. Audited.
export async function createQuestion(eventItemId, input = {}, actor = {}) {
  const item = await assertEventManage(actor, eventItemId);
  const data = normalizeQuestion(input);
  const last = await prisma.quizQuestion.findFirst({ where: { eventItemId: item.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const sortOrder = data.sortOrder ?? (last ? last.sortOrder + 1 : 0);

  const { row } = await auditedMutation(
    actor,
    async (tx) => ({
      row: await tx.quizQuestion.create({
        data: {
          eventItemId: item.id,
          prompt: data.prompt,
          options: data.options,
          correctOptionIds: data.correctOptionIds,
          points: data.points,
          timeLimitSeconds: data.timeLimitSeconds,
          sortOrder,
          createdById: actor?.userId ?? null,
        },
      }),
    }),
    ({ row }) => ({
      action: "create",
      entityType: ENTITY,
      entityId: row.id,
      academicYearId: item.academicYearId,
      after: { prompt: row.prompt, options: row.options?.length ?? 0, points: row.points },
      summary: `Added quiz question to event ${item.id}`,
    })
  );
  return shapeQuestion(row);
}

// Edit a question (partial patch — only provided fields change). Audited. REFUSES editing
// a question that is the CURRENT question of a live (non-ended) session: the answer path
// re-reads the live time_limit/points/correct_option_ids, so a mid-flight edit would move
// the SERVER-authoritative answer window / re-decide correctness for the OPEN question
// (review). Advance/end the session first (past answers keep their frozen points_awarded).
export async function editQuestion(questionId, patch = {}, actor = {}) {
  const existing = await loadQuestionOrThrow(questionId);
  const item = await assertEventManage(actor, existing.eventItemId);
  const liveCurrent = await prisma.quizSession.findFirst({
    where: { currentQuestionId: questionId, status: { not: "ended" } },
    select: { id: true },
  });
  if (liveCurrent) {
    throw new CmsValidationError("This question is live in a running session — advance or end it before editing.", { status: 409, code: "QUIZ_QUESTION_LIVE" });
  }
  const data = normalizeQuestionPatch(patch);

  const { row } = await auditedMutation(
    actor,
    async (tx) => ({ row: await tx.quizQuestion.update({ where: { id: questionId }, data }) }),
    ({ row }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: row.id,
      academicYearId: item.academicYearId,
      before: { prompt: existing.prompt, points: existing.points, timeLimitSeconds: existing.timeLimitSeconds },
      after: { prompt: row.prompt, points: row.points, timeLimitSeconds: row.timeLimitSeconds },
      summary: `Edited quiz question ${row.id} on event ${item.id}`,
    })
  );
  return shapeQuestion(row);
}

// Delete a question. Refuses if it is the CURRENT question of a live (non-ended) session
// (deleting it mid-run would strand players). Audited with a before-snapshot.
export async function deleteQuestion(questionId, actor = {}) {
  const existing = await loadQuestionOrThrow(questionId);
  const item = await assertEventManage(actor, existing.eventItemId);
  const liveCurrent = await prisma.quizSession.findFirst({
    where: { currentQuestionId: questionId, status: { not: "ended" } },
    select: { id: true },
  });
  if (liveCurrent) {
    throw new CmsValidationError("This question is live in a running session — end or advance the session first.", { status: 409, code: "QUIZ_QUESTION_LIVE" });
  }
  // REFUSE deleting a question that already has recorded answers: quiz_answer FK-cascades
  // on question delete (migration), so deleting it would silently erase those answers and
  // retroactively change the Postgres leaderboard (review). The whole-event delete path
  // (content_item cascade) is the only intended way those rows go. Past scores are durable.
  const answered = await prisma.quizAnswer.count({ where: { questionId } });
  if (answered > 0) {
    throw new CmsValidationError("This question already has recorded answers and can't be deleted — its scores are part of the leaderboard.", { status: 409, code: "QUIZ_QUESTION_ANSWERED" });
  }
  await auditedMutation(
    actor,
    async (tx) => {
      await tx.quizQuestion.delete({ where: { id: questionId } });
      return { existing };
    },
    () => ({
      action: "delete",
      entityType: ENTITY,
      entityId: existing.id,
      academicYearId: item.academicYearId,
      before: { prompt: existing.prompt },
      summary: `Deleted quiz question ${existing.id} from event ${item.id}`,
    })
  );
  return { deleted: true };
}

// Reorder the question bank: `orderedIds` is the full set of the event's question ids in
// the desired order. Sets sort_order = index. One summary audit row. Ignores unknown ids.
export async function reorderQuestions(eventItemId, orderedIds = [], actor = {}) {
  const item = await assertEventManage(actor, eventItemId);
  if (!Array.isArray(orderedIds)) throw new CmsValidationError("orderedIds must be an array.");
  const owned = await prisma.quizQuestion.findMany({ where: { eventItemId: item.id }, select: { id: true } });
  const ownedSet = new Set(owned.map((q) => q.id));
  const ids = orderedIds.filter((id) => ownedSet.has(id));

  await auditedMutation(
    actor,
    async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx.quizQuestion.update({ where: { id: ids[i] }, data: { sortOrder: i } });
      }
      return { count: ids.length };
    },
    ({ count }) => (count ? {
      action: "update",
      entityType: ENTITY,
      entityId: item.id,
      academicYearId: item.academicYearId,
      summary: `Reordered ${count} quiz question(s) on event ${item.id}`,
    } : null)
  );
  return { reordered: ids.length };
}
