// LIVE-QUIZ answer write path (Session 16, DL-104/106). MEMBER self-service, LOGIN-ONLY,
// gated by the M1 assertCanParticipate() active-only seam (an inactive account may watch
// but not answer — parity with event registration, DL-086). NOT audited: the quiz_answer
// row is itself the durable record (like a registration), and there is one per (session,
// question, member) — the DB UNIQUE makes each answer ONE-SHOT.
//
// SCORING is SERVER-AUTHORITATIVE (DL-106): the elapsed time is measured HERE as
// (server now − quiz_session.question_started_at); the client cannot claim it. An answer
// is rejected unless the current question is `active` AND received within the time limit.
// Correctness/points are NOT returned to the player (they'd leak the answer) — the player
// learns the result at reveal via the SSE stream.
import prisma from "../prisma.mjs";
import { withMappedDbErrors, CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import { assertCanParticipate } from "../auth/session.mjs";
import { publish, channels } from "../realtime/broadcast.mjs";
import { scoreAnswer } from "./forms.mjs";

// Coerce a client selection to a clean array of option ids that exist on the question.
function cleanSelection(selected, question) {
  const valid = new Set((Array.isArray(question.options) ? question.options : []).map((o) => String(o.id).toLowerCase()));
  const arr = Array.isArray(selected) ? selected : selected === undefined || selected === null ? [] : [selected];
  const out = [];
  for (const s of arr) {
    const id = String(s).trim().toLowerCase();
    if (id && valid.has(id) && !out.includes(id)) out.push(id);
    if (out.length >= 16) break; // hard cap
  }
  return out;
}

// Submit the signed-in member's answer to the CURRENTLY-ACTIVE question of a session.
// `member` is the requireMember() object OR a userId string. Returns { accepted, already }
// — never the correctness/points (anti-cheat). Idempotent: a repeat submission for the
// same question returns { already: true } without re-scoring.
export async function submitAnswer(input = {}, member, actor = {}) {
  const userId = (member && typeof member === "object" ? member.id : member) ?? actor?.userId;
  if (!userId) { const e = new Error("A member id is required."); e.status = 401; e.code = "UNAUTHENTICATED"; throw e; }
  await assertCanParticipate(member ?? userId); // active-only seam (403 if inactive)

  const { sessionId, questionId } = input;
  if (!sessionId || !questionId) throw new CmsValidationError("A sessionId and questionId are required.");

  const session = await prisma.quizSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new CmsNotFoundError(`Quiz session ${sessionId} not found.`);
  // The question must be the one currently OPEN — this rejects answers to a revealed /
  // past / future question and to an ended session (status + pointer check).
  if (session.status !== "active" || session.currentQuestionId !== questionId) {
    throw new CmsValidationError("This question is not open for answers.", { status: 409, code: "QUESTION_NOT_ACTIVE" });
  }
  const question = await prisma.quizQuestion.findUnique({ where: { id: questionId } });
  if (!question || question.eventItemId !== session.eventItemId) {
    throw new CmsValidationError("That question does not belong to this session.", { status: 409, code: "QUIZ_MISMATCH" });
  }

  // Already answered? (fast path + the UNIQUE backstops the race below.)
  const prior = await prisma.quizAnswer.findUnique({
    where: { sessionId_questionId_userId: { sessionId, questionId, userId } },
    select: { id: true },
  }).catch(() => null);
  if (prior) return { accepted: true, already: true };

  // SERVER-authoritative timing (DL-106): the elapsed time is measured here.
  const startedAt = session.questionStartedAt ? new Date(session.questionStartedAt).getTime() : Date.now();
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const selection = cleanSelection(input.selectedOptionIds ?? input.selected, question);
  const { isCorrect, pointsAwarded, withinWindow } = scoreAnswer(question, selection, elapsedMs);
  if (!withinWindow) {
    throw new CmsValidationError("Time's up — the answer window for this question has closed.", { status: 409, code: "ANSWER_WINDOW_CLOSED" });
  }

  let created = true;
  await withMappedDbErrors(async () => {
    try {
      await prisma.quizAnswer.create({
        data: { sessionId, questionId, userId, selectedOptionIds: selection, isCorrect, pointsAwarded, responseMs: elapsedMs },
      });
    } catch (e) {
      // Lost the one-shot race (a duplicate arrived first) → treat as already answered.
      if (String(e?.code) === "P2002") { created = false; return; }
      throw e;
    }
  });
  if (!created) return { accepted: true, already: true };

  // Best-effort: publish a progress tick (answered COUNT only — no scores/correctness
  // during an active question; anti-cheat). A failure never fails the answer write (the
  // durable quiz_answer row is the record; the leaderboard is read from Postgres later).
  try {
    const answeredCount = await prisma.quizAnswer.count({ where: { sessionId, questionId } });
    await publish(channels.quiz(sessionId), { type: "answered", questionId, answeredCount });
  } catch (e) {
    console.warn("[quiz] post-answer publish failed:", e?.message ?? e);
  }
  return { accepted: true, already: false };
}
