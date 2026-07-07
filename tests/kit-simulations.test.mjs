// ─────────────────────────────────────────────────────────────────────────────
// KIT SIMULATIONS — the remaining scenarios described in the /simulations kit,
// run end-to-end against the DB so the client manuals are proven, not just written.
//   A. General event (single manual round)
//   B. Coding contest (quiz round + manual round)  ← probes quiz-vs-event scoring
//   C. Robotics championship (3 manual rounds + capacity/waitlist)
//   D. Collaboration (two clubs co-organize one event; scoped coordinators; shared board)
//
// Run:  RUN_SIM=1 ./node_modules/.bin/dotenv -e .env.local -- \
//         ./node_modules/.bin/vitest run tests/kit-simulations.test.mjs --pool=forks --poolOptions.forks.singleFork
// Guarded by RUN_SIM (skipped by the normal suites).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.mjs";
import { getCurrentYearId } from "../lib/year/context.mjs";
import { createDraft, publish } from "../lib/cms/content.mjs";
import { createRound, listRounds } from "../lib/events/rounds.mjs";
import { upsertEventSettings } from "../lib/events/settings.mjs";
import { registerForEvent, getRegistrationCounts } from "../lib/events/registration.mjs";
import { setRoundScores, getOverallRanking } from "../lib/events/scoring.mjs";
import { setEventOrganizers } from "../lib/events/organizers.mjs";
import { canManageEvent } from "../lib/events/authz.mjs";
import { createQuestion, listQuestionsForHost } from "../lib/quiz/questions.mjs";
import { createSession, nextQuestion, revealQuestion, endSession, joinSession } from "../lib/quiz/sessions.mjs";
import { submitAnswer } from "../lib/quiz/answers.mjs";
import { getLeaderboard } from "../lib/quiz/leaderboard.mjs";
import { createUser, grantRole } from "../lib/users/admin.mjs";
import { getMemberProfile } from "../lib/member/profile.mjs";

const RUN = process.env.RUN_SIM === "1" && !!process.env.DATABASE_URL;
const PASSWORD = "SimEvent@2026";
const OUT_DIR = process.env.SIM_OUT || process.cwd();

const lines = [];
const log = (s = "") => { lines.push(s); console.log(s); };
const section = (t) => { log(""); log("─".repeat(78)); log(`  ${t}`); log("─".repeat(78)); };
const features = [];
const feat = (name, ok, detail = "") => { features.push({ name, ok, detail }); log(`   [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`); };
const findings = [];
const finding = (title, detail) => { findings.push({ title, detail }); log(`   [FINDING] ${title} — ${detail}`); };

let yearId, actor;
async function boot() {
  yearId = await getCurrentYearId();
  const dev = await prisma.user.findFirst({ where: { isDeveloper: true }, select: { id: true } });
  actor = { userId: dev.id };
}
async function ensureUsers(prefix, n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const email = `${prefix}.${String(i).padStart(2, "0")}@iitjammu.ac.in`;
    let u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!u) { const { user } = await createUser({ email, name: `${prefix} ${i}`, password: PASSWORD, mustChangePassword: false, status: "active" }, actor); u = { id: user.id }; }
    out.push({ i: i - 1, id: u.id, email });
  }
  return out;
}
async function ensureEvent(slug, title, category = "technical") {
  let ev = await prisma.contentItem.findFirst({ where: { slug, contentType: "event" }, select: { id: true, status: true } });
  if (!ev) {
    const { item } = await createDraft({ contentType: "event", title, academicYearId: yearId, slug,
      payload: { eventDate: new Date(Date.now() + 10 * 86400000).toISOString(), category, audience: "public", body: `${title} (kit simulation).` } }, actor);
    ev = item;
  }
  if (ev.status !== "published") await publish(ev.id, {}, actor);
  return ev.id;
}
async function openReg(eventId, capacity) {
  await upsertEventSettings(eventId, { capacity, registrationOpensAt: new Date(Date.now() - 86400000).toISOString(), registrationClosesAt: new Date(Date.now() + 30 * 86400000).toISOString(), registrationClosed: false, allowedRegistrantRoles: [] }, actor);
}
async function ensureRounds(eventId, names) {
  let rounds = await listRounds(eventId);
  if (rounds.length < names.length) { for (const n of names) await createRound(eventId, { name: n }, actor); rounds = await listRounds(eventId); }
  return rounds;
}

afterAll(async () => {
  writeFileSync(path.join(OUT_DIR, "kit-simulations-log.txt"), lines.join("\n") + "\n");
  writeFileSync(path.join(OUT_DIR, "kit-simulations-results.json"), JSON.stringify({ features, findings, passed: features.filter(f => f.ok).length, total: features.length }, null, 2));
  await prisma.$disconnect();
});

describe.skipIf(!RUN)("kit simulations", () => {
  it("A · general event — single manual round", async () => {
    await boot();
    section("SCENARIO A · GENERAL EVENT (single round)");
    const eventId = await ensureEvent("sim-general-2026", "SIM · Cultural Night (judged)", "cultural");
    await openReg(eventId, null); // unlimited
    const [round] = await ensureRounds(eventId, ["Final — Judges' Score"]);
    const users = await ensureUsers("sim.user", 20);
    for (const u of users) await registerForEvent({ eventItemId: eventId }, u.id);
    await setRoundScores(eventId, round.id, users.map(u => ({ userId: u.id, points: 100 - u.i * 3 })), actor);
    const board = await getOverallRanking(eventId);
    log(`   Registered ${users.length}; leaderboard top: ${board[0]?.name} ${board[0]?.points} pts (${board.length} ranked).`);
    feat("General event: single-round scoring + leaderboard", board.length === 20 && board[0].rank === 1);
    const prof = await getMemberProfile(users[0].id);
    const ev = prof.events.find(e => e.eventItemId === eventId);
    feat("General event: profile shows points + rank", ev?.points != null && ev?.rank != null, `pts=${ev?.points} rank=${ev?.rank}`);
  }, 120000);

  it("B · coding contest — quiz round + manual round (probe scoring systems)", async () => {
    await boot();
    section("SCENARIO B · CODING CONTEST (quiz + manual round)");
    const eventId = await ensureEvent("sim-coding-2026", "SIM · Coding Club Code Sprint");
    await openReg(eventId, null);
    // Clear any prior eventScore/rounds so the "quiz is separate" probe is valid on re-runs.
    await prisma.eventScore.deleteMany({ where: { eventItemId: eventId } });
    await prisma.eventRound.deleteMany({ where: { eventItemId: eventId } });
    const users = await ensureUsers("sim.user", 20);
    for (const u of users) await registerForEvent({ eventItemId: eventId }, u.id);

    // ── quiz round (auto-scored, separate system) ──
    if ((await listQuestionsForHost(eventId, actor)).length < 3) {
      await createQuestion(eventId, { prompt: "Big-O of binary search?", options: ["O(n)", "O(log n)", "O(n log n)", "O(1)"], correctOptionIds: [1], points: 1000, timeLimitSeconds: 20 }, actor);
      await createQuestion(eventId, { prompt: "Which is a stack operation?", options: ["enqueue", "push", "dequeue", "peekFront"], correctOptionIds: [1], points: 1000, timeLimitSeconds: 20 }, actor);
      await createQuestion(eventId, { prompt: "JS strict equality operator?", options: ["=", "==", "===", "=>"], correctOptionIds: [2], points: 1000, timeLimitSeconds: 20 }, actor);
    }
    const qs = await listQuestionsForHost(eventId, actor);
    const { session } = await createSession(eventId, actor);
    for (const u of users) await joinSession(session.id, u.id);
    for (let q = 0; q < qs.length; q++) {
      await nextQuestion(session.id, actor);
      const s = await prisma.quizSession.findUnique({ where: { id: session.id }, select: { currentQuestionId: true } });
      const question = qs.find(x => x.id === s.currentQuestionId);
      const correct = question.correctOptionIds[0];
      const wrong = question.options.find(o => o.id !== correct).id;
      for (const u of users) await submitAnswer({ sessionId: session.id, questionId: question.id, selectedOptionIds: [(u.i + q) % 3 === 0 ? wrong : correct] }, u.id);
      await revealQuestion(session.id, actor);
    }
    await endSession(session.id, actor).catch(() => {});
    const quizLb = await getLeaderboard(session.id, { top: 1000 });
    feat("Coding: quiz round auto-scored (own leaderboard)", quizLb.players === 20 && quizLb.top[0].score > 0, `winner ${quizLb.top[0].score} pts`);

    // ── PROBE: is the quiz reflected in the EVENT leaderboard / profiles? ──
    const eventBoardBefore = await getOverallRanking(eventId);
    const profBefore = await getMemberProfile(users[0].id);
    const evBefore = profBefore.events.find(e => e.eventItemId === eventId);
    if (eventBoardBefore.length === 0 && (evBefore?.points == null)) {
      finding("Quiz scores are NOT in the event leaderboard or member profiles",
        "A quiz session (quizAnswer) and event rounds (eventScore) are two independent scoring systems. getOverallRanking() and the member profile read eventScore only, so a PURE quiz shows the event as attended/registered but with no points/rank. To put quiz results into the event ranking + profiles, record each player's quiz score as a manual round.");
    }
    feat("Coding: quiz is separate from the event leaderboard (confirmed by probe)", eventBoardBefore.length === 0);

    // ── FIX/WORKAROUND: record the quiz result as a manual round, add a coding round ──
    const rounds = await ensureRounds(eventId, ["Round 1 — Aptitude (recorded from quiz)", "Round 2 — Coding"]);
    const scoreByUser = new Map(quizLb.top.map(r => [r.userId, r.score]));
    await setRoundScores(eventId, rounds[0].id, users.map(u => ({ userId: u.id, points: Math.round((scoreByUser.get(u.id) ?? 0) / 30) })), actor); // scale ~1000s → ~0-100
    await setRoundScores(eventId, rounds[1].id, users.map(u => ({ userId: u.id, points: 100 - ((u.i * 7) % 60) })), actor);
    const eventBoardAfter = await getOverallRanking(eventId);
    const profAfter = await getMemberProfile(users[0].id);
    const evAfter = profAfter.events.find(e => e.eventItemId === eventId);
    feat("Coding: combined leaderboard after recording quiz as a round", eventBoardAfter.length === 20 && eventBoardAfter[0].rank === 1);
    feat("Coding: profile now shows combined points + rank", evAfter?.points != null && evAfter?.rank != null, `pts=${evAfter?.points} rank=${evAfter?.rank}`);
  }, 120000);

  it("C · robotics championship — 3 rounds + capacity/waitlist", async () => {
    await boot();
    section("SCENARIO C · ROBOTICS CHAMPIONSHIP (3 rounds)");
    const eventId = await ensureEvent("sim-robotics-2026", "SIM · Robotics Club RoboWars");
    await openReg(eventId, 24); // 24 arena slots
    const users = await ensureUsers("sim.robo", 30);
    for (const u of users) await registerForEvent({ eventItemId: eventId }, u.id);
    const counts = await getRegistrationCounts(eventId);
    feat("Robotics: capacity + waitlist (24 slots, 30 registered)", counts.confirmed === 24 && counts.waitlisted === 6, `confirmed=${counts.confirmed}, waitlisted=${counts.waitlisted}`);
    const rounds = await ensureRounds(eventId, ["Round 1 — Line Follower", "Round 2 — Robo-Sumo", "Round 3 — Finals"]);
    await setRoundScores(eventId, rounds[0].id, users.map(u => ({ userId: u.id, points: 100 - u.i })), actor);
    await setRoundScores(eventId, rounds[1].id, users.map(u => ({ userId: u.id, points: 60 + ((u.i * 11) % 40) })), actor);
    await setRoundScores(eventId, rounds[2].id, users.map(u => ({ userId: u.id, points: 50 + ((u.i * 17) % 50) })), actor);
    const board = await getOverallRanking(eventId);
    feat("Robotics: 3-round overall leaderboard = sum across rounds", board.length === 30 && board[0].rank === 1, `winner ${board[0].name} ${board[0].points} pts`);
  }, 120000);

  it("D · collaboration — two clubs co-organize one event (scoped coordinators, shared board)", async () => {
    await boot();
    section("SCENARIO D · COLLABORATION (Coding Club × Robotics Club)");
    const clubType = (await prisma.orgUnitType.findFirst({ where: { key: "club" } })) ?? (await prisma.orgUnitType.findFirst());
    async function ensureClub(slug, name) {
      let ou = await prisma.orgUnit.findFirst({ where: { slug, academicYearId: yearId }, select: { id: true, lineageKey: true } });
      if (ou) return ou;
      const lin = await prisma.orgUnitLineage.create({ data: { canonicalName: name, firstSeenYearId: yearId } });
      ou = await prisma.orgUnit.create({ data: { academicYearId: yearId, orgUnitTypeId: clubType.id, lineageKey: lin.lineageKey, slug, name, status: "published" }, select: { id: true, lineageKey: true } });
      return ou;
    }
    async function scopedCoordinator(email, club) {
      let u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!u) { const { user } = await createUser({ email, name: email, password: PASSWORD, mustChangePassword: false, status: "active" }, actor); u = { id: user.id }; }
      try { await grantRole({ userId: u.id, roleKey: "coordinator", orgUnitLineageKey: club.lineageKey, academicYearId: yearId }, actor); } catch (e) { if (!/unique|exist/i.test(e.message)) throw e; }
      return { id: u.id, email };
    }
    const coding = await ensureClub("sim-coding-club", "SIM Coding Club");
    const robotics = await ensureClub("sim-robotics-club", "SIM Robotics Club");
    const other = await ensureClub("sim-other-club", "SIM Other Club");
    const codingCoord = await scopedCoordinator("sim.coord.coding@iitjammu.ac.in", coding);
    const roboticsCoord = await scopedCoordinator("sim.coord.robotics@iitjammu.ac.in", robotics);
    const otherCoord = await scopedCoordinator("sim.coord.other@iitjammu.ac.in", other);
    log(`   Clubs: Coding(${coding.lineageKey.slice(0, 8)}), Robotics(${robotics.lineageKey.slice(0, 8)}), Other(${other.lineageKey.slice(0, 8)})`);

    const eventId = await ensureEvent("sim-collab-2026", "SIM · Coding × Robotics TechFest");
    await openReg(eventId, null);
    // CENTRAL action (dev): tag both clubs as organizers.
    await setEventOrganizers(eventId, [
      { orgUnitLineageKey: coding.lineageKey, kind: "organizer" },
      { orgUnitLineageKey: robotics.lineageKey, kind: "organizer" },
    ], actor);

    const codingCanManage = await canManageEvent({ userId: codingCoord.id }, eventId);
    const roboticsCanManage = await canManageEvent({ userId: roboticsCoord.id }, eventId);
    const otherCanManage = await canManageEvent({ userId: otherCoord.id }, eventId);
    feat("Collaboration: a coordinator of an ORGANIZING club can manage the event", codingCanManage && roboticsCanManage);
    feat("Collaboration: a coordinator of a NON-organizing club CANNOT manage it", otherCanManage === false);

    // register participants and have EACH club's coordinator score one round → shared board
    const users = await ensureUsers("sim.user", 20);
    for (const u of users) await registerForEvent({ eventItemId: eventId }, u.id);
    const rounds = await ensureRounds(eventId, ["Coding Round", "Robotics Round"]);
    await setRoundScores(eventId, rounds[0].id, users.map(u => ({ userId: u.id, points: 100 - u.i * 2 })), { userId: codingCoord.id });     // scored by Coding coord
    await setRoundScores(eventId, rounds[1].id, users.map(u => ({ userId: u.id, points: 40 + ((u.i * 13) % 60) })), { userId: roboticsCoord.id }); // scored by Robotics coord
    const board = await getOverallRanking(eventId);
    feat("Collaboration: both clubs' scores feed ONE shared leaderboard", board.length === 20 && board[0].rank === 1, `winner ${board[0].name} ${board[0].points} pts`);

    section("KIT-SIMULATIONS SUMMARY");
    const passed = features.filter(f => f.ok).length;
    for (const f of features) log(`   [${f.ok ? "PASS" : "FAIL"}] ${f.name}`);
    log(`\n   ${passed}/${features.length} checks passed · ${findings.length} finding(s) noted.`);
    expect(passed).toBe(features.length);
  }, 120000);
});
