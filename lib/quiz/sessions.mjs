// LIVE-QUIZ session lifecycle + the SERVER-AUTHORITATIVE timer (Session 16, DL-104/106).
// A session is one live run of an event's question bank, host-paced (Kahoot-style):
//   pending (lobby) → [next] → active (a question open; server stamps question_started_at)
//                   → [reveal] (answers closed; correct answer + leaderboard shown)
//                   → [next] → active → … → [end] ended.
//
// The TIMER is server-authoritative WITHOUT a background scheduler: a question stays
// `active` until the HOST reveals/advances it, but lib/quiz/answers.mjs accepts an answer
// ONLY within time_limit_seconds of the server's question_started_at — so a late answer
// is rejected regardless of when the host reveals. This needs no persistent job and
// survives restarts (state is in Postgres). Every transition is authorized by
// assertEventManage, audited (one semantic row), and published to the SSE broadcaster
// AFTER commit (subscribers only ever see committed state). Published payloads are
// display-safe (no emails/uuids) — the participant question shape omits correct answers.
import prisma from "../prisma.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import { assertEventManage } from "../events/authz.mjs";
import { publish, channels } from "../realtime/broadcast.mjs";
import { canTransition, publicLeaderboard } from "./forms.mjs";
import { shapeQuestion, shapeQuestionForPlayer } from "./questions.mjs";
import { getLeaderboard } from "./leaderboard.mjs";

const ENTITY = "quiz_session";
const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);

async function loadSessionOrThrow(sessionId, client = prisma) {
  if (!sessionId) throw new CmsValidationError("A session id is required.");
  const s = await client.quizSession.findUnique({ where: { id: sessionId } });
  if (!s) throw new CmsNotFoundError(`Quiz session ${sessionId} not found.`);
  return s;
}

// Ordered question bank + position of the current question (1-based). One query.
async function sessionMeta(session, client = prisma) {
  const rows = await client.quizQuestion.findMany({
    where: { eventItemId: session.eventItemId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const orderedIds = rows.map((r) => r.id);
  const idx = session.currentQuestionId ? orderedIds.indexOf(session.currentQuestionId) : -1;
  return { orderedIds, totalQuestions: orderedIds.length, questionNo: idx >= 0 ? idx + 1 : 0 };
}

async function participantCount(sessionId, client = prisma) {
  return client.quizParticipant.count({ where: { sessionId } });
}

// The deadline (ISO) an active question closes at (server-authoritative), or null.
function deadlineOf(session, timeLimitSeconds) {
  if (session.status !== "active" || !session.questionStartedAt || !timeLimitSeconds) return null;
  return iso(new Date(new Date(session.questionStartedAt).getTime() + timeLimitSeconds * 1000));
}

// ── the SSE snapshot (onOpen) + the reducer's authoritative state ──
// forHost=true includes the correct answers on the current question; participants never
// receive them until reveal. `userId` resolves the viewer's own answer + score.
export async function getSessionState(sessionId, { userId = null, forHost = false, client = prisma } = {}) {
  const session = await client.quizSession.findUnique({ where: { id: sessionId } });
  if (!session) return null;
  const meta = await sessionMeta(session, client);
  const players = await participantCount(session.id, client);

  let question = null;
  let timeLimitSeconds = null;
  let myAnswer = null;
  if (session.currentQuestionId) {
    const q = await client.quizQuestion.findUnique({ where: { id: session.currentQuestionId } });
    if (q) {
      timeLimitSeconds = q.timeLimitSeconds;
      const revealed = session.status === "reveal" || session.status === "ended";
      question = forHost || revealed ? shapeQuestion(q) : shapeQuestionForPlayer(q);
      if (userId) {
        const a = await client.quizAnswer.findUnique({
          where: { sessionId_questionId_userId: { sessionId: session.id, questionId: q.id, userId } },
          select: { selectedOptionIds: true, isCorrect: true, pointsAwarded: true },
        }).catch(() => null);
        if (a) myAnswer = { selectedOptionIds: a.selectedOptionIds, isCorrect: session.status === "reveal" || session.status === "ended" ? a.isCorrect : null, pointsAwarded: session.status === "reveal" || session.status === "ended" ? a.pointsAwarded : null };
      }
    }
  }

  // Leaderboard is shown on reveal + ended (during 'active' only a progress count leaks).
  let leaderboard = null;
  if (session.status === "reveal" || session.status === "ended") {
    const lb = await getLeaderboard(session.id, { top: 20, meUserId: userId, client });
    leaderboard = { top: publicLeaderboard(lb.top, { meUserId: userId }), players: lb.players, me: lb.me ? { score: lb.me.score, rank: lb.me.rank } : null };
  }
  const answeredCount = session.currentQuestionId
    ? await client.quizAnswer.count({ where: { sessionId: session.id, questionId: session.currentQuestionId } })
    : 0;

  return {
    type: "snapshot",
    sessionId: session.id,
    eventItemId: session.eventItemId,
    // Monotonic revision (the session row's updatedAt, bumped on every transition) so the
    // client can DROP a stale snapshot that arrives AFTER a fresher transition delta — the
    // SSE subscribe-then-await-onOpen ordering can otherwise enqueue an older onOpen snapshot
    // behind a newer broadcast (review). Deltas without `status` (answered/lobby) merge and
    // carry no rev.
    rev: session.updatedAt instanceof Date ? session.updatedAt.getTime() : new Date(session.updatedAt).getTime(),
    status: session.status,
    questionNo: meta.questionNo,
    totalQuestions: meta.totalQuestions,
    question,
    questionStartedAt: iso(session.questionStartedAt),
    timeLimitSeconds,
    deadline: deadlineOf(session, timeLimitSeconds),
    players,
    answeredCount,
    myAnswer,
    correctOptionIds: session.status === "reveal" || session.status === "ended" ? question?.correctOptionIds ?? null : null,
    leaderboard,
  };
}

// Publish the current snapshot to the session's channel (display-safe; no host secrets:
// forHost=false so the broadcast never carries correct answers except at reveal/ended).
async function broadcastState(sessionId, type) {
  try {
    const snap = await getSessionState(sessionId, { forHost: false });
    if (snap) await publish(channels.quiz(sessionId), { ...snap, type: type ?? snap.type });
  } catch (e) {
    console.warn("[quiz] broadcastState failed:", e?.message ?? e);
  }
}

// ── host lifecycle (assertEventManage; audited; publishes after commit) ──

// Create (or return the existing) live session for an event. Idempotent: the DB partial
// unique allows one non-ended session per event, so a second create returns the current one.
export async function createSession(eventItemId, actor = {}) {
  const item = await assertEventManage(actor, eventItemId);
  const existing = await prisma.quizSession.findFirst({ where: { eventItemId: item.id, status: { not: "ended" } } });
  if (existing) return { session: shapeSession(existing), changed: false };
  const total = await prisma.quizQuestion.count({ where: { eventItemId: item.id } });
  if (total === 0) throw new CmsValidationError("Add at least one question before starting a live quiz.", { status: 422, code: "QUIZ_NO_QUESTIONS" });

  const { row } = await auditedMutation(
    actor,
    async (tx) => ({ row: await tx.quizSession.create({ data: { eventItemId: item.id, status: "pending", createdById: actor?.userId ?? null } }) }),
    ({ row }) => ({ action: "create", entityType: ENTITY, entityId: row.id, academicYearId: item.academicYearId, summary: `Opened a live quiz lobby for event ${item.id}` })
  );
  await broadcastState(row.id, "lobby");
  return { session: shapeSession(row), changed: true };
}

// Advance to the NEXT question (pending/reveal → active). Stamps question_started_at with
// the SERVER clock. If there is no next question, the session ENDS. Audited + published.
export async function nextQuestion(sessionId, actor = {}) {
  const session = await loadSessionOrThrow(sessionId);
  const item = await assertEventManage(actor, session.eventItemId);
  if (session.status === "active") throw new CmsValidationError("Reveal the current question before advancing.", { status: 409, code: "QUIZ_QUESTION_ACTIVE" });
  if (!canTransition(session.status, "active")) throw new CmsValidationError(`Cannot advance from '${session.status}'.`, { status: 409, code: "QUIZ_BAD_TRANSITION" });

  const meta = await sessionMeta(session);
  const curIdx = session.currentQuestionId ? meta.orderedIds.indexOf(session.currentQuestionId) : -1;
  const nextId = meta.orderedIds[curIdx + 1] ?? null;
  if (!nextId) return endSession(sessionId, actor); // no more questions → end

  const startedAt = new Date(); // SERVER-authoritative question open time (DL-106)
  const { row } = await auditedMutation(
    actor,
    async (tx) => ({
      row: await tx.quizSession.update({
        where: { id: sessionId },
        data: { status: "active", currentQuestionId: nextId, questionStartedAt: startedAt, startedAt: session.startedAt ?? startedAt },
      }),
    }),
    ({ row }) => ({ action: "update", entityType: ENTITY, entityId: row.id, academicYearId: item.academicYearId, before: { status: session.status }, after: { status: "active", questionNo: curIdx + 2 }, summary: `Live quiz ${sessionId}: opened question ${curIdx + 2} on event ${item.id}` })
  );
  await broadcastState(row.id, "question");
  return { session: shapeSession(row), changed: true };
}

// Close the current question (active → reveal): answers are no longer accepted (the
// answer path also enforces the time window), and the correct answer + leaderboard are
// published. Audited + published.
export async function revealQuestion(sessionId, actor = {}) {
  const session = await loadSessionOrThrow(sessionId);
  const item = await assertEventManage(actor, session.eventItemId);
  if (!canTransition(session.status, "reveal")) throw new CmsValidationError(`Cannot reveal from '${session.status}'.`, { status: 409, code: "QUIZ_BAD_TRANSITION" });

  const { row } = await auditedMutation(
    actor,
    async (tx) => ({ row: await tx.quizSession.update({ where: { id: sessionId }, data: { status: "reveal" } }) }),
    ({ row }) => ({ action: "update", entityType: ENTITY, entityId: row.id, academicYearId: item.academicYearId, before: { status: session.status }, after: { status: "reveal" }, summary: `Live quiz ${sessionId}: revealed a question on event ${item.id}` })
  );
  await broadcastState(row.id, "reveal");
  return { session: shapeSession(row), changed: true };
}

// End the session (any non-ended → ended). Clears the current question + the Redis cache;
// publishes the final leaderboard. Audited + published.
export async function endSession(sessionId, actor = {}) {
  const session = await loadSessionOrThrow(sessionId);
  const item = await assertEventManage(actor, session.eventItemId);
  if (session.status === "ended") return { session: shapeSession(session), changed: false };

  const { row } = await auditedMutation(
    actor,
    async (tx) => ({ row: await tx.quizSession.update({ where: { id: sessionId }, data: { status: "ended", endedAt: new Date(), currentQuestionId: null } }) }),
    ({ row }) => ({ action: "update", entityType: ENTITY, entityId: row.id, academicYearId: item.academicYearId, before: { status: session.status }, after: { status: "ended" }, summary: `Live quiz ${sessionId}: ended on event ${item.id}` })
  );
  await broadcastState(row.id, "ended");
  return { session: shapeSession(row), changed: true };
}

// ── member: join the lobby (records presence; NOT audited) ──
// Idempotent upsert. Publishes the updated lobby count. Called when a member opens the
// live stream (the SSE route). Any logged-in member may watch; ANSWERING is gated
// separately by assertCanParticipate in lib/quiz/answers.mjs.
export async function joinSession(sessionId, userId) {
  if (!sessionId || !userId) return { joined: false };
  const session = await prisma.quizSession.findUnique({ where: { id: sessionId }, select: { id: true, status: true } });
  if (!session || session.status === "ended") return { joined: false };
  await prisma.quizParticipant.upsert({
    where: { sessionId_userId: { sessionId, userId } },
    update: {},
    create: { sessionId, userId },
  });
  const players = await participantCount(sessionId);
  await publish(channels.quiz(sessionId), { type: "lobby", players });
  return { joined: true, players };
}

// ── reads ──
export function shapeSession(s) {
  if (!s) return null;
  return {
    id: s.id,
    eventItemId: s.eventItemId,
    status: s.status,
    currentQuestionId: s.currentQuestionId ?? null,
    questionStartedAt: iso(s.questionStartedAt),
    startedAt: iso(s.startedAt),
    endedAt: iso(s.endedAt),
  };
}

// The current non-ended session for an event (or null). Ungated read — the participant
// page gates via requireMember; used to find which session to join.
export async function getLiveSessionForEvent(eventItemId, { client = prisma } = {}) {
  if (!eventItemId) return null;
  const s = await client.quizSession.findFirst({ where: { eventItemId, status: { not: "ended" } }, orderBy: { createdAt: "desc" } });
  return shapeSession(s);
}

// The host control-panel view (GATED): the question bank (with answers), the current
// session, and the live leaderboard. Authorize FIRST.
export async function getQuizHostView(eventItemId, actor = {}) {
  const item = await assertEventManage(actor, eventItemId);
  const [questions, session] = await Promise.all([
    prisma.quizQuestion.findMany({ where: { eventItemId: item.id }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    prisma.quizSession.findFirst({ where: { eventItemId: item.id, status: { not: "ended" } }, orderBy: { createdAt: "desc" } }),
  ]);
  let leaderboard = null;
  let state = null;
  if (session) {
    state = await getSessionState(session.id, { forHost: true });
    const lb = await getLeaderboard(session.id, { top: 50 });
    leaderboard = { top: publicLeaderboard(lb.top), players: lb.players };
  }
  return {
    eventItemId: item.id,
    questions: questions.map(shapeQuestion),
    session: shapeSession(session),
    state,
    leaderboard,
  };
}
