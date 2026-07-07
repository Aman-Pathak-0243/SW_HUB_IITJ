// ─────────────────────────────────────────────────────────────────────────────
// FULL EVENT SIMULATION (Event Playground, M5) — end-to-end, service-layer.
//
// Drives the SAME service functions the Admin/Coordinator UI and the /api routes
// call, so this is a faithful dry-run of running a real event on the portal:
//   create event → 2 rounds → registration (capacity + waitlist + auto-promote) →
//   50 members created + logged in + registered → rounds conducted (scoring) →
//   live leaderboard observed as scores come in → attendance → CSV exports →
//   closure report → every member's profile re-read to confirm it reflects
//   their result (points / rank / attendance).
//
// Run against the local Docker Postgres (or any seeded DB):
//   npm run db:local:up && npm run db:seed        # once: schema + seed
//   RUN_SIM=1 ./node_modules/.bin/dotenv -e .env.local -- \
//     ./node_modules/.bin/vitest run tests/event-simulation.test.mjs
//
// Runs under vitest (not plain node) because the service layer transitively imports
// the NextAuth provider config, which only builds under the app/vitest bundler.
// Guarded by RUN_SIM so the normal `npm test` / `npm run test:db` suites skip it.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.mjs";
import { getCurrentYearId } from "../lib/year/context.mjs";
import { createDraft, publish } from "../lib/cms/content.mjs";
import { createRound, listRounds } from "../lib/events/rounds.mjs";
import { upsertEventSettings, getEventSettings } from "../lib/events/settings.mjs";
import {
  registerForEvent, getRegistrationCounts, listRegistrations,
} from "../lib/events/registration.mjs";
import {
  setRoundScores, markAttendance, getRoundRanking, getOverallRanking, listAttendance,
} from "../lib/events/scoring.mjs";
import { exportEventCsv } from "../lib/events/downloads.mjs";
import { submitClosureReport, reviewClosureReport } from "../lib/events/closure.mjs";
import { createUser } from "../lib/users/admin.mjs";
import { hashPassword, verifyPassword } from "../lib/auth/password.mjs";
import { canLogin } from "../lib/auth/access.mjs";
import { getMemberProfile } from "../lib/member/profile.mjs";

const RUN = process.env.RUN_SIM === "1" && !!process.env.DATABASE_URL;

// ── config ──
const N_USERS = 50;
const INITIAL_CAPACITY = 48;        // < 50 so we exercise the waitlist
const FINAL_CAPACITY = 50;          // raise → auto-promote the waitlist
const PASSWORD = "SimEvent@2026";   // meets the password policy (upper/lower/digit/symbol)
const EVENT_SLUG = "sim-hackathon-2026";
const OUT_DIR = process.env.SIM_OUT || process.cwd();

// deterministic per-participant scoring (i = 0..49). Non-linear on purpose so the
// ROUND-1 leader is NOT the OVERALL leader → proves the board re-ranks on performance.
const r1Points = (i) => 100 - i;                 // round 1: 100 down to 51
const r2Points = (i) => 60 + ((i * 13) % 50);    // round 2: scrambled 60..109

// Mirrors lib/auth/options.mjs#authorizeCredentials EXACTLY (unknown email / OAuth-only /
// revoked / wrong password → null) — the check the login form performs.
async function authorizeCredentials({ email, password } = {}) {
  if (!email || !password) return null;
  const user = await prisma.user.findUnique({ where: { email: String(email).trim() } });
  if (!user || !user.passwordHash) return null;
  if (!canLogin(user.status)) return null;
  const ok = await verifyPassword(user.passwordHash, String(password));
  if (!ok) return null;
  return { id: user.id, email: user.email, name: user.name };
}

// ── logging ──
const lines = [];
const log = (s = "") => { lines.push(s); console.log(s); };
const hr = () => log("─".repeat(78));
const section = (t) => { log(""); hr(); log(`  ${t}`); hr(); };
const features = [];
const feature = (name, ok, detail = "") => { features.push({ name, ok, detail }); log(`   [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`); };
const results = { startedAt: new Date().toISOString(), phases: {}, features };
const topTable = (rows, n = 5) => rows.slice(0, n).map((r) => `      #${r.rank}  ${(r.name || "?").padEnd(24)} ${r.points} pts`).join("\n");

afterAll(async () => { await prisma.$disconnect(); });

describe.skipIf(!RUN)("full event simulation (50 members, 2 rounds)", () => {
  it("runs end-to-end and every feature passes", async () => {
    section("PHASE 0 · ENVIRONMENT");
    const dbHost = (process.env.DATABASE_URL || "").split("@")[1] || "(configured DB)";
    log(`   Database        : ${dbHost}`);
    const yearId = await getCurrentYearId();
    if (!yearId) throw new Error("No current academic year — run `npm run db:seed` first.");
    const year = await prisma.academicYear.findUnique({ where: { id: yearId }, select: { label: true } });
    const dev = await prisma.user.findFirst({ where: { isDeveloper: true }, select: { id: true, email: true } });
    if (!dev) throw new Error("No developer account — run `npm run db:seed` first.");
    const actor = { userId: dev.id };   // ORGANIZER actor (developer → global event.manage)
    log(`   Academic year   : ${year?.label} (${yearId})`);
    log(`   Organizer actor : ${dev.email}`);
    results.phases.environment = { dbHost, yearId, yearLabel: year?.label, organizer: dev.email };

    // ── PHASE 1: create + publish the event ────────────────────────────────
    section("PHASE 1 · CREATE THE EVENT");
    // Reproducibility: start from a FRESH event each run so the capacity → waitlist →
    // auto-promote sequence is always valid (deleting the event cascades its
    // registrations/scores/attendance/rounds/settings). Fixes re-run drift (Finding F-2).
    await prisma.contentItem.deleteMany({ where: { slug: EVENT_SLUG, contentType: "event" } });
    let event = await prisma.contentItem.findFirst({ where: { slug: EVENT_SLUG, contentType: "event" }, select: { id: true, status: true } });
    if (!event) {
      const eventDate = new Date(Date.now() + 14 * 86400000).toISOString();
      const { item } = await createDraft({
        contentType: "event",
        title: "SIM · Inter-Hostel Hackathon 2026",
        academicYearId: yearId,
        slug: EVENT_SLUG,
        summary: "A simulated two-round hackathon used to validate the events subsystem.",
        payload: { eventDate, category: "technical", audience: "public", location: "Central Computing Lab", body: "Two rounds: prelims then finals. Top scorers ranked live." },
      }, actor);
      event = item;
      log(`   Created event draft: ${item.id}`);
    } else {
      log(`   Reusing existing event: ${event.id}`);
    }
    if (event.status !== "published") { await publish(event.id, {}, actor); log("   Published event."); }
    const eventId = event.id;
    feature("Create + publish event (CMS content_type=event)", true, `slug=${EVENT_SLUG}`);
    results.phases.event = { id: eventId, slug: EVENT_SLUG };

    // ── PHASE 2: two rounds ─────────────────────────────────────────────────
    section("PHASE 2 · CONFIGURE 2 ROUNDS");
    let rounds = await listRounds(eventId);
    if (rounds.length < 2) {
      await createRound(eventId, { name: "Round 1 — Prelims", description: "Qualifying round." }, actor);
      await createRound(eventId, { name: "Round 2 — Finals", description: "Championship round." }, actor);
      rounds = await listRounds(eventId);
    }
    const [round1, round2] = rounds;
    rounds.forEach((r) => log(`   Round ${r.roundNo}: ${r.name} (${r.id})`));
    feature("Add event rounds", rounds.length >= 2, `${rounds.length} rounds`);
    results.phases.rounds = rounds.map((r) => ({ id: r.id, roundNo: r.roundNo, name: r.name }));

    // ── PHASE 3: registration settings (open window, capacity 48) ──────────
    section(`PHASE 3 · OPEN REGISTRATION (capacity ${INITIAL_CAPACITY})`);
    await upsertEventSettings(eventId, {
      capacity: INITIAL_CAPACITY,
      registrationOpensAt: new Date(Date.now() - 86400000).toISOString(),
      registrationClosesAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      registrationClosed: false,
      allowedRegistrantRoles: [],
    }, actor);
    const settings = await getEventSettings(eventId);
    log(`   capacity=${settings.capacity}  opens=${settings.registrationOpensAt}  closes=${settings.registrationClosesAt}`);
    feature("Configure registration window + capacity", settings.capacity === INITIAL_CAPACITY);

    // ── PHASE 4: create 50 members ──────────────────────────────────────────
    section(`PHASE 4 · CREATE ${N_USERS} MEMBER ACCOUNTS`);
    const users = [];
    let created = 0, reused = 0;
    for (let i = 1; i <= N_USERS; i++) {
      const email = `sim.user.${String(i).padStart(2, "0")}@iitjammu.ac.in`;
      const name = `Sim Participant ${String(i).padStart(2, "0")}`;
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) {
        await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: await hashPassword(PASSWORD), status: "active", mustChangePassword: false, allowNormalView: true, name } });
        users.push({ i: i - 1, id: existing.id, email, name }); reused++;
      } else {
        const { user } = await createUser({ email, name, password: PASSWORD, mustChangePassword: false, status: "active" }, actor);
        users.push({ i: i - 1, id: user.id, email, name }); created++;
      }
    }
    log(`   ${created} created, ${reused} reused → ${users.length} active member accounts.`);
    feature("Create 50 member accounts", users.length === N_USERS);
    results.phases.users = { total: users.length, created, reused };

    // ── PHASE 5: log every member in ────────────────────────────────────────
    section(`PHASE 5 · LOG IN ALL ${N_USERS} MEMBERS`);
    log("   (mirrors authorizeCredentials — the exact check NextAuth runs on the login form)");
    let loginOk = 0;
    for (const u of users) {
      const authed = await authorizeCredentials({ email: u.email, password: PASSWORD });
      if (authed?.id === u.id) { loginOk++; await prisma.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } }); }
      else log(`   [!] login FAILED for ${u.email}`);
    }
    log(`   ${loginOk}/${users.length} members authenticated; lastLoginAt stamped.`);
    feature("Authenticate all 50 members (credentials login)", loginOk === N_USERS, `${loginOk}/${N_USERS}`);
    const badLogin = await authorizeCredentials({ email: users[0].email, password: "wrong-password" });
    feature("Reject wrong password", badLogin === null);

    // ── PHASE 6: everyone registers (capacity 48 → 2 waitlisted) ────────────
    section("PHASE 6 · MEMBER SELF-REGISTRATION");
    for (const u of users) await registerForEvent({ eventItemId: eventId }, u.id);
    const counts1 = await getRegistrationCounts(eventId);
    log(`   Registered ${users.length}. Live counts → confirmed=${counts1.confirmed}, waitlisted=${counts1.waitlisted}, total=${counts1.total}`);
    feature("Self-registration for all 50", counts1.total === N_USERS);
    feature("Capacity enforced → overflow waitlisted", counts1.confirmed === INITIAL_CAPACITY && counts1.waitlisted === (N_USERS - INITIAL_CAPACITY), `confirmed=${counts1.confirmed}, waitlisted=${counts1.waitlisted}`);
    results.phases.registration = { afterCapacity48: counts1 };

    // ── PHASE 7: raise capacity → auto-promote ──────────────────────────────
    section("PHASE 7 · RAISE CAPACITY → AUTO-PROMOTE WAITLIST");
    const { promoted } = await upsertEventSettings(eventId, { capacity: FINAL_CAPACITY }, actor);
    const counts2 = await getRegistrationCounts(eventId);
    log(`   Capacity ${INITIAL_CAPACITY} → ${FINAL_CAPACITY}. Auto-promoted ${promoted} member(s). confirmed=${counts2.confirmed}, waitlisted=${counts2.waitlisted}`);
    feature("Auto-promote waitlist on capacity raise", counts2.confirmed === N_USERS && counts2.waitlisted === 0, `promoted=${promoted}`);
    results.phases.registration.afterCapacity50 = { ...counts2, promoted };

    // ── PHASE 8: ROUND 1 — score progressively, watch the leaderboard ───────
    section("PHASE 8 · CONDUCT ROUND 1 (live leaderboard as scores come in)");
    const r1Entries = users.map((u) => ({ userId: u.id, points: r1Points(u.i) }));
    const boardSnapshots = [];
    for (const cut of [10, 30, 50]) {
      await setRoundScores(eventId, round1.id, r1Entries.slice(0, cut), actor);
      const board = await getOverallRanking(eventId);
      boardSnapshots.push({ scored: cut, leader: board[0], size: board.length });
      log(`   After ${String(cut).padStart(2)} scores entered → leaderboard has ${board.length} ranked. Top 5:`);
      log(topTable(board, 5));
    }
    const r1Rank = await getRoundRanking(eventId, round1.id);
    feature("Round 1 scoring (replace-set)", r1Rank.length === N_USERS, `${r1Rank.length} ranked`);
    feature("Leaderboard updates continuously as scores are entered", boardSnapshots[0].size === 10 && boardSnapshots[2].size === 50, "grew 10 → 30 → 50");
    const r1Leader = boardSnapshots[2].leader;
    results.phases.round1 = { snapshots: boardSnapshots, ranking: r1Rank.slice(0, 5) };

    // ── PHASE 9: ROUND 2 — standings reshuffle ──────────────────────────────
    section("PHASE 9 · CONDUCT ROUND 2 (standings reshuffle on new performance)");
    const r2Entries = users.map((u) => ({ userId: u.id, points: r2Points(u.i) }));
    await setRoundScores(eventId, round2.id, r2Entries, actor);
    const r2Rank = await getRoundRanking(eventId, round2.id);
    const overall = await getOverallRanking(eventId);
    log("   Round 2 top 5:");
    log(topTable(r2Rank, 5));
    log("   OVERALL leaderboard (Round 1 + Round 2) top 10:");
    log(topTable(overall, 10));
    const leaderChanged = overall[0]?.name !== r1Leader?.name;
    log(`   Round-1 leader was "${r1Leader?.name}" (${r1Leader?.points}); OVERALL leader is now "${overall[0]?.name}" (${overall[0]?.points}).`);
    feature("Round 2 scoring", r2Rank.length === N_USERS);
    feature("Overall leaderboard = cumulative across rounds", overall.length === N_USERS && overall[0].points > r1Leader.points);
    feature("Leaderboard re-ranks on performance (leader changed R1 → overall)", leaderChanged, `${r1Leader?.name} → ${overall[0]?.name}`);
    results.phases.round2 = { ranking: r2Rank.slice(0, 5) };
    results.phases.overall = { top10: overall.slice(0, 10), r1Leader, overallLeader: overall[0], leaderChanged };

    // ── PHASE 10: attendance ────────────────────────────────────────────────
    section("PHASE 10 · TAKE ATTENDANCE");
    const att1 = users.map((u) => ({ userId: u.id, present: u.i < 46 }));   // 46 present in R1
    const att2 = users.map((u) => ({ userId: u.id, present: u.i < 48 }));   // 48 present in R2
    const a1 = await markAttendance(eventId, round1.id, att1, actor);
    const a2 = await markAttendance(eventId, round2.id, att2, actor);
    log(`   Round 1 attendance: ${a1.present}/${a1.marked} present.`);
    log(`   Round 2 attendance: ${a2.present}/${a2.marked} present.`);
    const att1List = await listAttendance(eventId, { roundId: round1.id, actor });
    feature("Mark attendance (round 1)", a1.present === 46 && a1.marked === N_USERS, `${a1.present}/${a1.marked}`);
    feature("Mark attendance (round 2)", a2.present === 48 && a2.marked === N_USERS, `${a2.present}/${a2.marked}`);
    feature("Read attendance sheet (organizer, gated)", att1List.length === N_USERS);
    results.phases.attendance = { round1: { present: a1.present, marked: a1.marked }, round2: { present: a2.present, marked: a2.marked } };

    // ── PHASE 11: exports + roster + closure report ─────────────────────────
    section("PHASE 11 · EXPORTS, ROSTER & CLOSURE REPORT");
    for (const kind of ["participants", "ranking", "scores", "attendance"]) {
      try {
        const csv = await exportEventCsv(eventId, kind, actor);
        feature(`CSV export: ${kind}`, csv.count > 0, `${csv.count} rows → ${csv.filename}`);
      } catch (e) { feature(`CSV export: ${kind}`, false, e.message); }
    }
    try {
      const roster = await listRegistrations({ eventItemId: eventId, take: 1000 }, actor);
      feature("Registration roster (organizer, PII-gated)", roster.entries.length === N_USERS, `${roster.entries.length} entries`);
    } catch (e) { feature("Registration roster", false, e.message); }
    try {
      const { report } = await submitClosureReport({ eventItemId: eventId, roleContribution: "Organized by the simulation harness; 50 participants, 2 rounds.", reportedBudget: 15000 }, actor);
      const { report: reviewed } = await reviewClosureReport(report.id, { reviewComment: "Verified. Budget approved.", correctedBudget: 15000 }, actor);
      feature("Closure report submit + central review", reviewed.status === "reviewed", `status=${reviewed.status}`);
    } catch (e) { feature("Closure report submit + review", false, e.message); }

    // ── PHASE 12: re-read EVERY member's profile ────────────────────────────
    section("PHASE 12 · VERIFY EACH MEMBER PROFILE REFLECTS THEIR RESULT");
    log("   (getMemberProfile per user — the same read the /profile & /member/profile pages use)");
    let withEvent = 0, withPoints = 0, withRank = 0, attendedTrue = 0, loginStamped = 0;
    const sampleRows = [];
    for (const u of users) {
      const p = await getMemberProfile(u.id);
      const ev = p.events.find((e) => e.eventItemId === eventId) || null;
      const row = { email: u.email, reg: ev?.registration?.status ?? null, attended: ev?.attended ?? null, points: ev?.points ?? null, rank: ev?.rank ?? null, lastLogin: !!p.member.lastLoginAt };
      if (ev) withEvent++;
      if (ev?.points != null) withPoints++;
      if (ev?.rank != null) withRank++;
      if (ev?.attended) attendedTrue++;
      if (p.member.lastLoginAt) loginStamped++;
      if (sampleRows.length < 10) sampleRows.push(row);
    }
    log("   Sample (first 10 members):");
    log("      email                                    reg        att   pts  rank  login");
    for (const r of sampleRows) log(`      ${r.email.padEnd(40)} ${String(r.reg).padEnd(10)} ${String(r.attended).padEnd(5)} ${String(r.points).padStart(3)}  ${String(r.rank).padStart(4)}  ${r.lastLogin ? "yes" : "no"}`);
    log(`   Aggregate over ${users.length} members:`);
    log(`      profiles showing the event : ${withEvent}/${users.length}`);
    log(`      showing points             : ${withPoints}/${users.length}`);
    log(`      showing overall rank       : ${withRank}/${users.length}`);
    log(`      marked attended (any round): ${attendedTrue}/${users.length}`);
    log(`      lastLogin stamped          : ${loginStamped}/${users.length}`);
    feature("Every profile shows the event participation", withEvent === N_USERS, `${withEvent}/${N_USERS}`);
    feature("Every profile shows points", withPoints === N_USERS, `${withPoints}/${N_USERS}`);
    feature("Every profile shows an overall rank", withRank === N_USERS, `${withRank}/${N_USERS}`);
    feature("Attendance reflected in profile", attendedTrue === 48, `${attendedTrue}/${N_USERS} attended`);
    feature("Login reflected in profile (lastLoginAt)", loginStamped === N_USERS, `${loginStamped}/${N_USERS}`);
    results.phases.profiles = { withEvent, withPoints, withRank, attendedTrue, loginStamped, sample: sampleRows };

    // ── SUMMARY ──────────────────────────────────────────────────────────────
    section("SUMMARY · FEATURE CHECKLIST");
    const passed = features.filter((f) => f.ok).length;
    for (const f of features) log(`   [${f.ok ? "PASS" : "FAIL"}] ${f.name}`);
    log("");
    log(`   ${passed}/${features.length} feature checks passed.`);
    results.finishedAt = new Date().toISOString();
    results.summary = { passed, total: features.length, allGreen: passed === features.length };

    writeFileSync(path.join(OUT_DIR, "event-simulation-log.txt"), lines.join("\n") + "\n");
    writeFileSync(path.join(OUT_DIR, "event-simulation-results.json"), JSON.stringify(results, null, 2));
    log(`\n   Artifacts written to ${OUT_DIR}`);

    expect(passed).toBe(features.length);
  }, 180000);
});
