// Live-DB integration tests for Session 16 — LIVE QUIZZES & LIVE LEADERBOARDS.
// Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set. Run isolated (KNOWN_ISSUES
// #39) against the local Docker Postgres:
//   RUN_DB_TESTS=1 dotenv -e .env.test -- vitest run tests/quiz.db.test.mjs --pool=forks --poolOptions.forks.singleFork
//
// Runs WITHOUT Redis — exercises the in-process broadcaster + the Postgres leaderboard
// fallback (the authoritative path; Redis is the optional accelerator, DL-107). Fixtures
// (zz-quiz-*): a published EVENT organized by CLUB A, a coordinator scoped to A (may
// manage), a coordinator scoped to B (403), a global STAFF, and members (one inactive).
// Asserts: assertEventManage gating on authoring + lifecycle; the server-authoritative
// timer (window-closed rejection); one-shot answers; correct/wrong scoring; the
// pending→active→reveal→ended state machine; the PG leaderboard ordering; and that the
// participant snapshot never leaks the correct answer while a question is active.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

let prismaBase, content, users, organizers, questions, sessions, answers, leaderboard;
let dev, actor, staffActor, currentYear, clubType;
let clubA, clubALineage, coordA, coordAActor;
let clubB, clubBLineage, coordB, coordBActor;
let eventItem, q1, q2, session;
let m1, m2, m3, inactive;
const startedAt = new Date();
const createdUserIds = [];
const createdItemIds = [];
const createdUnitIds = [];
const createdLineages = [];
const createdAssignmentIds = [];

const mkEmail = (t) => `zz-quiz-${t}-${randomUUID()}@iitjammu.ac.in`;

async function load() {
  const p = await import("../lib/prisma.mjs");
  prismaBase = p.prismaBase;
  content = await import("../lib/cms/content.mjs");
  users = await import("../lib/users/admin.mjs");
  organizers = await import("../lib/events/organizers.mjs");
  questions = await import("../lib/quiz/questions.mjs");
  sessions = await import("../lib/quiz/sessions.mjs");
  answers = await import("../lib/quiz/answers.mjs");
  leaderboard = await import("../lib/quiz/leaderboard.mjs");
}

async function makeClub(name) {
  const lineage = await prismaBase.orgUnitLineage.create({ data: { canonicalName: name, firstSeenYearId: currentYear.id } });
  const unit = await prismaBase.orgUnit.create({
    data: { academicYearId: currentYear.id, orgUnitTypeId: clubType.id, lineageKey: lineage.lineageKey, slug: `zz-quiz-${randomUUID().slice(0, 8)}`, name, status: "published" },
  });
  createdUnitIds.push(unit.id);
  createdLineages.push(lineage.lineageKey);
  return { unit, lineageKey: lineage.lineageKey };
}

async function newMember(tag, { status = "active" } = {}) {
  const { user } = await users.createUser({ email: mkEmail(tag), name: `ZZ ${tag}` }, actor);
  createdUserIds.push(user.id);
  if (status !== "active") await prismaBase.user.update({ where: { id: user.id }, data: { status } });
  return user;
}

async function grantScoped(userId, roleKey, lineageKey) {
  const role = await prismaBase.role.findUnique({ where: { key: roleKey } });
  await users.grantRole({ userId, roleId: role.id, ...(lineageKey ? { orgUnitLineageKey: lineageKey, academicYearId: currentYear.id } : {}) }, actor);
  const g = await prismaBase.roleAssignment.findFirst({ where: { userId, roleId: role.id }, select: { id: true } });
  if (g) createdAssignmentIds.push(g.id);
}

async function teardown() {
  if (!prismaBase) return;
  for (const id of createdItemIds) await prismaBase.contentItem.delete({ where: { id } }).catch(() => {}); // cascades quiz_* + event_organizer
  for (const id of createdUserIds) await prismaBase.user.delete({ where: { id } }).catch(() => {});
  for (const id of createdUnitIds) await prismaBase.orgUnit.delete({ where: { id } }).catch(() => {});
  for (const key of createdLineages) await prismaBase.orgUnitLineage.delete({ where: { lineageKey: key } }).catch(() => {});
  const entityTypes = ["quiz_question", "quiz_session", "event_organizer"];
  await prismaBase.auditLog.deleteMany({ where: { entityType: { in: entityTypes }, createdAt: { gte: startedAt } } }).catch(() => {});
  if (createdAssignmentIds.length) await prismaBase.auditLog.deleteMany({ where: { entityType: "role_assignment", entityId: { in: createdAssignmentIds } } }).catch(() => {});
  const ids = [...createdItemIds, ...createdUserIds];
  if (ids.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: ids } } }).catch(() => {});
}

describe.skipIf(!RUN)("Session 16 — Live quizzes & leaderboards (live Postgres)", () => {
  beforeAll(async () => {
    await load();
    for (let i = 1; i <= 12; i++) {
      try { await prismaBase.$queryRaw`SELECT 1`; break; } catch { await new Promise((r) => setTimeout(r, 5000)); }
    }
    dev = await prismaBase.user.findFirst({ where: { isDeveloper: true } });
    actor = { userId: dev.id };
    currentYear = await prismaBase.academicYear.findFirst({ where: { isCurrent: true } });
    clubType = await prismaBase.orgUnitType.findUnique({ where: { key: "club" } });
    expect(clubType, "club org_unit_type must be seeded — run npm run db:seed").toBeTruthy();

    ({ unit: clubA, lineageKey: clubALineage } = await makeClub("ZZ Quiz Club A"));
    ({ unit: clubB, lineageKey: clubBLineage } = await makeClub("ZZ Quiz Club B"));

    coordA = await newMember("coordA");
    await grantScoped(coordA.id, "coordinator", clubALineage);
    coordAActor = { userId: coordA.id };
    coordB = await newMember("coordB");
    await grantScoped(coordB.id, "coordinator", clubBLineage);
    coordBActor = { userId: coordB.id };

    const staff = await newMember("staff");
    await grantScoped(staff.id, "staff", null); // GLOBAL event.manage
    staffActor = { userId: staff.id };

    m1 = await newMember("m1");
    m2 = await newMember("m2");
    m3 = await newMember("m3");
    inactive = await newMember("inactive", { status: "inactive" });

    const { item } = await content.createDraft(
      { contentType: "event", academicYearId: currentYear.id, slug: `zz-quiz-ev-${randomUUID().slice(0, 8)}`, title: "ZZ Quiz Night", payload: { category: "Quiz" } },
      actor
    );
    createdItemIds.push(item.id);
    await content.publish(item.id, {}, actor);
    eventItem = item;
    // Global staff tags club A as the organizer → coordA gains SCOPED event.manage on it.
    await organizers.setEventOrganizers(eventItem.id, [{ orgUnitLineageKey: clubALineage, kind: "organizer", role: "Organizing club" }], staffActor);
  }, 300000);

  afterAll(async () => {
    await teardown();
    if (prismaBase) await prismaBase.$disconnect();
  }, 120000);

  dbit("question authoring is gated by assertEventManage (organizing coordinator + global staff yes; other club 403)", async () => {
    // coordB (scoped to club B, NOT organizing) → 403.
    await expect(questions.createQuestion(eventItem.id, { prompt: "x", options: ["a", "b"], correctOptionIds: ["a"] }, coordBActor)).rejects.toMatchObject({ status: 403 });
    // coordA (organizing) authors two questions.
    q1 = await questions.createQuestion(eventItem.id, { prompt: "Capital of France?", options: ["Rome", "Paris", "Berlin"], correctOptionIds: ["b"], points: 1000, timeLimitSeconds: 20 }, coordAActor);
    q2 = await questions.createQuestion(eventItem.id, { prompt: "2 + 2 = ?", options: ["4", "5"], correctOptionIds: ["a"], points: 1000, timeLimitSeconds: 20 }, coordAActor);
    expect(q1.correctOptionIds).toEqual(["b"]);
    // Global staff can also author (a central op).
    const list = await questions.listQuestionsForHost(eventItem.id, staffActor);
    expect(list.length).toBe(2);
    // A plain member cannot read the host bank.
    await expect(questions.listQuestionsForHost(eventItem.id, { userId: m1.id })).rejects.toMatchObject({ status: 403 });
  });

  dbit("createSession is gated + idempotent (one live session per event)", async () => {
    await expect(sessions.createSession(eventItem.id, coordBActor)).rejects.toMatchObject({ status: 403 });
    const first = await sessions.createSession(eventItem.id, coordAActor);
    expect(first.changed).toBe(true);
    expect(first.session.status).toBe("pending");
    session = first.session;
    const again = await sessions.createSession(eventItem.id, coordAActor); // idempotent
    expect(again.changed).toBe(false);
    expect(again.session.id).toBe(session.id);
  });

  dbit("nextQuestion opens Q1 with a SERVER timestamp; the participant snapshot hides the correct answer", async () => {
    const res = await sessions.nextQuestion(session.id, coordAActor);
    expect(res.session.status).toBe("active");
    expect(res.session.currentQuestionId).toBe(q1.id);
    expect(res.session.questionStartedAt).toBeTruthy(); // server-stamped

    const player = await sessions.getSessionState(session.id, { userId: m1.id, forHost: false });
    expect(player.status).toBe("active");
    expect(player.question.id).toBe(q1.id);
    expect(player.question.correctOptionIds).toBeUndefined(); // NEVER leaked to a player while active
    expect(player.correctOptionIds).toBeNull();

    const host = await sessions.getSessionState(session.id, { userId: coordA.id, forHost: true });
    expect(host.question.correctOptionIds).toEqual(["b"]); // the host sees the answer
  });

  dbit("answers are server-scored + one-shot; inactive is blocked; wrong scores 0", async () => {
    const ok = await answers.submitAnswer({ sessionId: session.id, questionId: q1.id, selectedOptionIds: ["b"] }, m1, { userId: m1.id });
    expect(ok).toMatchObject({ accepted: true, already: false });
    const row = await prismaBase.quizAnswer.findUnique({ where: { sessionId_questionId_userId: { sessionId: session.id, questionId: q1.id, userId: m1.id } } });
    expect(row.isCorrect).toBe(true);
    expect(row.pointsAwarded).toBeGreaterThan(0);

    // one-shot: a repeat submission does not create a second row and reports already.
    const dup = await answers.submitAnswer({ sessionId: session.id, questionId: q1.id, selectedOptionIds: ["a"] }, m1, { userId: m1.id });
    expect(dup).toMatchObject({ accepted: true, already: true });
    const count = await prismaBase.quizAnswer.count({ where: { sessionId: session.id, questionId: q1.id, userId: m1.id } });
    expect(count).toBe(1);

    // inactive member is barred from participating (active-only seam).
    await expect(answers.submitAnswer({ sessionId: session.id, questionId: q1.id, selectedOptionIds: ["b"] }, null, { userId: inactive.id })).rejects.toMatchObject({ status: 403 });

    // m2 answers WRONG → recorded but 0 points.
    await answers.submitAnswer({ sessionId: session.id, questionId: q1.id, selectedOptionIds: ["a"] }, m2, { userId: m2.id });
    const wrong = await prismaBase.quizAnswer.findUnique({ where: { sessionId_questionId_userId: { sessionId: session.id, questionId: q1.id, userId: m2.id } } });
    expect(wrong.isCorrect).toBe(false);
    expect(wrong.pointsAwarded).toBe(0);

    // a player's own snapshot never reveals correctness while the question is active.
    const mine = await sessions.getSessionState(session.id, { userId: m1.id, forHost: false });
    expect(mine.myAnswer).toBeTruthy();
    expect(mine.myAnswer.isCorrect).toBeNull();
  });

  dbit("rejects an answer to a non-current question and after the server time window closes", async () => {
    // wrong question id (q2 is not open) → QUESTION_NOT_ACTIVE.
    await expect(answers.submitAnswer({ sessionId: session.id, questionId: q2.id, selectedOptionIds: ["a"] }, m3, { userId: m3.id })).rejects.toMatchObject({ code: "QUESTION_NOT_ACTIVE" });

    // Backdate the server-stamped start well past the 20s limit → the window is closed.
    await prismaBase.quizSession.update({ where: { id: session.id }, data: { questionStartedAt: new Date(Date.now() - 60_000) } });
    await expect(answers.submitAnswer({ sessionId: session.id, questionId: q1.id, selectedOptionIds: ["b"] }, m3, { userId: m3.id })).rejects.toMatchObject({ code: "ANSWER_WINDOW_CLOSED" });
    expect(await prismaBase.quizAnswer.count({ where: { sessionId: session.id, questionId: q1.id, userId: m3.id } })).toBe(0);
  });

  dbit("reveal exposes the correct answer + my result and the Postgres leaderboard ranks correct over wrong", async () => {
    const res = await sessions.revealQuestion(session.id, coordAActor);
    expect(res.session.status).toBe("reveal");

    const mine = await sessions.getSessionState(session.id, { userId: m1.id, forHost: false });
    expect(mine.correctOptionIds).toEqual(["b"]); // revealed now
    expect(mine.myAnswer.isCorrect).toBe(true);

    const lb = await leaderboard.getLeaderboard(session.id, { top: 10, meUserId: m1.id });
    expect(lb.players).toBe(2); // m1 + m2 have scored rows (m3's were rejected)
    expect(lb.top[0].userId).toBe(m1.id); // correct answer ranks first
    expect(lb.top[0].rank).toBe(1);
    expect(lb.me.rank).toBe(1);
    // A 0-score answerer (m2 answered wrong) IS on the Postgres-authoritative board (review #5).
    expect(lb.top.find((e) => e.userId === m2.id)?.score).toBe(0);

    // Editing the LIVE current question is refused (would move the server answer window /
    // re-decide correctness mid-flight — review #4). q1 is still the reveal question here.
    await expect(questions.editQuestion(q1.id, { points: 5 }, coordAActor)).rejects.toMatchObject({ code: "QUIZ_QUESTION_LIVE" });
  });

  dbit("advances to Q2, and advancing past the last question ends the session", async () => {
    const r2 = await sessions.nextQuestion(session.id, coordAActor);
    expect(r2.session.status).toBe("active");
    expect(r2.session.currentQuestionId).toBe(q2.id);

    await answers.submitAnswer({ sessionId: session.id, questionId: q2.id, selectedOptionIds: ["a"] }, m1, { userId: m1.id }); // correct
    await answers.submitAnswer({ sessionId: session.id, questionId: q2.id, selectedOptionIds: ["a"] }, m2, { userId: m2.id }); // correct
    await sessions.revealQuestion(session.id, coordAActor);

    const lb = await leaderboard.getLeaderboard(session.id, { top: 10 });
    expect(lb.top[0].userId).toBe(m1.id); // m1 won both questions → still #1
    expect(lb.top.find((e) => e.userId === m2.id).score).toBeGreaterThan(0); // m2 scored on Q2

    // No Q3 → the next advance ENDS the session.
    const end = await sessions.nextQuestion(session.id, coordAActor);
    expect(end.session.status).toBe("ended");
    expect(await sessions.getLiveSessionForEvent(eventItem.id)).toBeNull(); // one-live freed

    // A question with recorded answers can't be deleted (cascade would erase its scores —
    // review #2). q1 is no longer any live session's current question now, so this exercises
    // the ANSWERED guard (not the live guard).
    await expect(questions.deleteQuestion(q1.id, coordAActor)).rejects.toMatchObject({ code: "QUIZ_QUESTION_ANSWERED" });
  });

  dbit("endSession is idempotent and the other club's coordinator can never drive the session", async () => {
    // A fresh session can now be created (the partial unique freed on 'ended').
    const fresh = await sessions.createSession(eventItem.id, coordAActor);
    expect(fresh.changed).toBe(true);
    // coordB (not organizing) cannot advance/reveal/end it.
    await expect(sessions.nextQuestion(fresh.session.id, coordBActor)).rejects.toMatchObject({ status: 403 });
    await expect(sessions.endSession(fresh.session.id, coordBActor)).rejects.toMatchObject({ status: 403 });
    // The organizing coordinator ends it; a second end is a no-op.
    const ended = await sessions.endSession(fresh.session.id, coordAActor);
    expect(ended.session.status).toBe("ended");
    const again = await sessions.endSession(fresh.session.id, coordAActor);
    expect(again.changed).toBe(false);
  });

  dbit("joinSession records lobby presence (idempotent) for the live player count", async () => {
    const s = await sessions.createSession(eventItem.id, coordAActor);
    const a = await sessions.joinSession(s.session.id, m1.id);
    const b = await sessions.joinSession(s.session.id, m1.id); // idempotent upsert
    const c = await sessions.joinSession(s.session.id, m2.id);
    expect(a.joined).toBe(true);
    expect(c.players).toBe(2); // m1 + m2, not 3
    await sessions.endSession(s.session.id, coordAActor);
  });
});
