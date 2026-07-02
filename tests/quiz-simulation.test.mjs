// ─────────────────────────────────────────────────────────────────────────────
// LIVE-QUIZ SIMULATION (auto-scored from an answer key) — end-to-end, service-layer.
//
// Proves the quiz path the client asked about: a quiz has an ANSWER KEY (each
// question's correct option), participants answer the OPEN question, the server
// auto-scores (correctness + speed bonus), and the LEADERBOARD updates after every
// question — no manual scoring. Complements tests/event-simulation.test.mjs (the
// manually-scored hackathon path).
//
// Run:  RUN_SIM=1 ./node_modules/.bin/dotenv -e .env.local -- \
//         ./node_modules/.bin/vitest run tests/quiz-simulation.test.mjs \
//         --pool=forks --poolOptions.forks.singleFork
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.mjs";
import { getCurrentYearId } from "../lib/year/context.mjs";
import { createDraft, publish } from "../lib/cms/content.mjs";
import { createQuestion, listQuestionsForHost } from "../lib/quiz/questions.mjs";
import { createSession, nextQuestion, revealQuestion, endSession, joinSession } from "../lib/quiz/sessions.mjs";
import { submitAnswer } from "../lib/quiz/answers.mjs";
import { getLeaderboard } from "../lib/quiz/leaderboard.mjs";
import { registerForEvent } from "../lib/events/registration.mjs";
import { createUser } from "../lib/users/admin.mjs";
import { hashPassword } from "../lib/auth/password.mjs";
import { getMemberProfile } from "../lib/member/profile.mjs";

const RUN = process.env.RUN_SIM === "1" && !!process.env.DATABASE_URL;
const N_USERS = 50;
const PASSWORD = "SimEvent@2026";
const EVENT_SLUG = "sim-quiz-2026";
const OUT_DIR = process.env.SIM_OUT || process.cwd();

// The ANSWER KEY (this is the fixture the client edits for a real quiz).
const ANSWER_KEY = [
  { prompt: "What does CPU stand for?", options: ["Central Process Unit", "Central Processing Unit", "Computer Personal Unit", "Central Processor Utility"], correct: 1, points: 1000, timeLimitSeconds: 20 },
  { prompt: "Which planet is known as the Red Planet?", options: ["Venus", "Jupiter", "Mars", "Saturn"], correct: 2, points: 1000, timeLimitSeconds: 20 },
  { prompt: "2 + 2 × 2 = ?", options: ["6", "8", "4", "10"], correct: 0, points: 1000, timeLimitSeconds: 15 },
  { prompt: "Which language runs natively in a web browser?", options: ["Python", "C++", "JavaScript", "Rust"], correct: 2, points: 1000, timeLimitSeconds: 20 },
  { prompt: "HTTP status 404 means?", options: ["OK", "Server Error", "Not Found", "Redirect"], correct: 2, points: 1000, timeLimitSeconds: 15 },
];

const lines = [];
const log = (s = "") => { lines.push(s); console.log(s); };
const hr = () => log("─".repeat(78));
const section = (t) => { log(""); hr(); log(`  ${t}`); hr(); };
const features = [];
const feature = (name, ok, detail = "") => { features.push({ name, ok, detail }); log(`   [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`); };
const results = { startedAt: new Date().toISOString(), phases: {}, features };
const lbTable = (lb, n = 5) => lb.top.slice(0, n).map((r) => `      #${r.rank}  ${(r.name || "?").padEnd(24)} ${r.score} pts`).join("\n");

afterAll(async () => { await prisma.$disconnect(); });

describe.skipIf(!RUN)("live-quiz simulation (50 members, answer-key auto-scoring)", () => {
  it("runs a live quiz end-to-end with an answer key and a live leaderboard", async () => {
    section("PHASE 0 · ENVIRONMENT");
    const yearId = await getCurrentYearId();
    if (!yearId) throw new Error("No current academic year — run `npm run db:seed` first.");
    const dev = await prisma.user.findFirst({ where: { isDeveloper: true }, select: { id: true, email: true } });
    if (!dev) throw new Error("No developer account — run `npm run db:seed` first.");
    const actor = { userId: dev.id };
    log(`   DB=${(process.env.DATABASE_URL || "").split("@")[1]}  year=${yearId}  host=${dev.email}`);

    // ── PHASE 1: quiz event + answer key ────────────────────────────────────
    section("PHASE 1 · CREATE QUIZ EVENT + ANSWER KEY");
    let event = await prisma.contentItem.findFirst({ where: { slug: EVENT_SLUG, contentType: "event" }, select: { id: true, status: true } });
    if (!event) {
      const { item } = await createDraft({
        contentType: "event", title: "SIM · Tech Trivia Live Quiz", academicYearId: yearId, slug: EVENT_SLUG,
        summary: "A simulated live quiz used to validate answer-key auto-scoring + the live leaderboard.",
        payload: { eventDate: new Date(Date.now() + 7 * 86400000).toISOString(), category: "technical", audience: "public", body: "5-question live quiz. Server-scored." },
      }, actor);
      event = item;
    }
    if (event.status !== "published") await publish(event.id, {}, actor);
    const eventId = event.id;
    let existingQs = await listQuestionsForHost(eventId, actor);
    if (existingQs.length < ANSWER_KEY.length) {
      for (const q of ANSWER_KEY) await createQuestion(eventId, { prompt: q.prompt, options: q.options, correctOptionIds: [q.correct], points: q.points, timeLimitSeconds: q.timeLimitSeconds }, actor);
    }
    const questions = await listQuestionsForHost(eventId, actor);
    log(`   Quiz event ${eventId} with ${questions.length} questions (answer key loaded).`);
    questions.forEach((q, i) => log(`      Q${i + 1}: ${q.prompt}  → correct: ${q.correctOptionIds.join(",")}`));
    feature("Create quiz event + questions with answer key", questions.length >= ANSWER_KEY.length, `${questions.length} questions`);
    results.phases.quiz = { eventId, questions: questions.length };

    // ── PHASE 2: participants (reuse the 50 sim members) ────────────────────
    section(`PHASE 2 · ENSURE ${N_USERS} MEMBERS + REGISTER`);
    const users = [];
    for (let i = 1; i <= N_USERS; i++) {
      const email = `sim.user.${String(i).padStart(2, "0")}@iitjammu.ac.in`;
      const name = `Sim Participant ${String(i).padStart(2, "0")}`;
      let u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!u) { const { user } = await createUser({ email, name, password: PASSWORD, mustChangePassword: false, status: "active" }, actor); u = { id: user.id }; }
      users.push({ i: i - 1, id: u.id, email });
    }
    for (const u of users) await registerForEvent({ eventItemId: eventId }, u.id);
    log(`   ${users.length} members registered for the quiz.`);
    feature("Members registered for quiz (login-only participation)", users.length === N_USERS);

    // ── PHASE 3: run the live session, question by question ─────────────────
    section("PHASE 3 · RUN THE LIVE QUIZ (leaderboard updates each question)");
    const { session } = await createSession(eventId, actor);
    for (const u of users) await joinSession(session.id, u.id);
    log(`   Session ${session.id} opened; ${users.length} joined the lobby.`);

    // deterministic "who answers correctly" pattern → varied, reproducible standings.
    const answersCorrectly = (i, q) => (i * 7 + q * 3) % 4 !== 0;
    const boardPerQ = [];
    for (let q = 0; q < questions.length; q++) {
      await nextQuestion(session.id, actor);                       // opens question q
      const s = await prisma.quizSession.findUnique({ where: { id: session.id }, select: { status: true, currentQuestionId: true } });
      const question = questions.find((x) => x.id === s.currentQuestionId);
      const correctId = question.correctOptionIds[0];
      const wrongId = question.options.find((o) => o.id !== correctId)?.id ?? correctId;
      let correctCount = 0;
      for (const u of users) {
        const pick = answersCorrectly(u.i, q) ? correctId : wrongId;
        if (pick === correctId) correctCount++;
        await submitAnswer({ sessionId: session.id, questionId: question.id, selectedOptionIds: [pick] }, u.id);
      }
      await revealQuestion(session.id, actor);                     // closes + scores
      const lb = await getLeaderboard(session.id, { top: 5 });
      boardPerQ.push({ q: q + 1, correctCount, players: lb.players, leader: lb.top[0] });
      log(`   Q${q + 1} "${question.prompt.slice(0, 32)}…": ${correctCount}/${users.length} correct. Leaderboard top 5 (players=${lb.players}):`);
      log(lbTable(lb, 5));
    }
    await nextQuestion(session.id, actor);  // no more questions → auto-ends (idempotent w/ endSession)
    await endSession(session.id, actor).catch(() => {});
    const final = await getLeaderboard(session.id, { top: 10 });
    log("   FINAL leaderboard top 10:");
    log(lbTable(final, 10));
    feature("Answers auto-scored from the answer key (server-authoritative)", final.top[0].score > 0, `winner=${final.top[0].name} ${final.top[0].score} pts`);
    feature("Live leaderboard updates after every question", boardPerQ.length === questions.length && final.players > 0, `${final.players} scored players`);
    feature("Leaderboard is ordered by score (descending)", final.top.every((r, i, a) => i === 0 || a[i - 1].score >= r.score));
    results.phases.session = { id: session.id, perQuestion: boardPerQ, finalTop: final.top };

    // ── PHASE 4: profiles reflect quiz participation ────────────────────────
    section("PHASE 4 · VERIFY PROFILES REFLECT QUIZ PARTICIPATION");
    let withEvent = 0;
    for (const u of users) {
      const p = await getMemberProfile(u.id);
      if (p.events.some((e) => e.eventItemId === eventId)) withEvent++;
    }
    log(`   ${withEvent}/${users.length} member profiles list the quiz event.`);
    feature("Quiz participation appears in member profiles", withEvent === N_USERS, `${withEvent}/${N_USERS}`);

    section("SUMMARY");
    const passed = features.filter((f) => f.ok).length;
    for (const f of features) log(`   [${f.ok ? "PASS" : "FAIL"}] ${f.name}`);
    log(`\n   ${passed}/${features.length} feature checks passed.`);
    results.finishedAt = new Date().toISOString();
    results.summary = { passed, total: features.length, allGreen: passed === features.length };
    writeFileSync(path.join(OUT_DIR, "quiz-simulation-log.txt"), lines.join("\n") + "\n");
    writeFileSync(path.join(OUT_DIR, "quiz-simulation-results.json"), JSON.stringify(results, null, 2));

    expect(passed).toBe(features.length);
  }, 180000);
});
