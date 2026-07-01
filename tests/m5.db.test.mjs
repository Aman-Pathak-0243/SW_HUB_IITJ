// Live-DB integration tests for Session-11 / M5 — Centralized Event Playground.
// Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set. Run isolated (KNOWN_ISSUES
// #39) with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/m5.db.test.mjs --pool=forks --poolOptions.forks.singleFork
//
// Fixtures (all zz-m5-*, cleaned in afterAll via the audit-bypassing base client): a
// throwaway published EVENT (hybrid blocks + problem statement), two throwaway CLUBs
// (A organizes the event; B does not), a coordinator scoped to each club, a STAFF user
// with global event.manage, a custom entity, and member accounts (one inactive).
// Asserts: hybrid-content playground read; organizer tagging (one-target + CENTRAL);
// the assertEventManage seam (scoped-to-organizer vs 403); rounds; registration +
// capacity→waitlist + auto-promote + dedup + inactive-blocked; scores→ranking;
// attendance; closure submit (scoped) + review (central-only); CSV downloads; the
// Events-Organized change history + export gate.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

let prismaBase, content, users, organizers, rounds, settings, registration, scoring, closure, downloads, organized, playground;
let dev, actor, staffActor, currentYear, clubType;
let clubA, clubALineage, coordA, coordAActor;
let clubB, clubBLineage, coordB, coordBActor;
let entity, eventItem, round1;
let m1, m2, m3, inactive;
const startedAt = new Date();
const createdUserIds = [];
const createdItemIds = [];
const createdUnitIds = [];
const createdLineages = [];
const createdEntityIds = [];
const createdAssignmentIds = [];

const mkEmail = (t) => `zz-m5-${t}-${randomUUID()}@iitjammu.ac.in`;

async function load() {
  const p = await import("../lib/prisma.mjs");
  prismaBase = p.prismaBase;
  content = await import("../lib/cms/content.mjs");
  users = await import("../lib/users/admin.mjs");
  organizers = await import("../lib/events/organizers.mjs");
  rounds = await import("../lib/events/rounds.mjs");
  settings = await import("../lib/events/settings.mjs");
  registration = await import("../lib/events/registration.mjs");
  scoring = await import("../lib/events/scoring.mjs");
  closure = await import("../lib/events/closure.mjs");
  downloads = await import("../lib/events/downloads.mjs");
  organized = await import("../lib/events/organized.mjs");
  playground = await import("../lib/events/playground.mjs");
}

async function makeClub(name) {
  const lineage = await prismaBase.orgUnitLineage.create({ data: { canonicalName: name, firstSeenYearId: currentYear.id } });
  const unit = await prismaBase.orgUnit.create({
    data: { academicYearId: currentYear.id, orgUnitTypeId: clubType.id, lineageKey: lineage.lineageKey, slug: `zz-m5-${randomUUID().slice(0, 8)}`, name, status: "published" },
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

async function makeEvent(payload, { title = "ZZ Event", slug } = {}) {
  const { item } = await content.createDraft(
    { contentType: "event", academicYearId: currentYear.id, slug: slug ?? `zz-m5-ev-${randomUUID().slice(0, 8)}`, title, payload },
    actor
  );
  createdItemIds.push(item.id);
  await content.publish(item.id, {}, actor);
  return item;
}

async function teardown() {
  if (!prismaBase) return;
  for (const id of createdItemIds) await prismaBase.contentItem.delete({ where: { id } }).catch(() => {});
  for (const id of createdEntityIds) await prismaBase.eventEntity.delete({ where: { id } }).catch(() => {});
  for (const id of createdUserIds) await prismaBase.user.delete({ where: { id } }).catch(() => {});
  for (const id of createdUnitIds) await prismaBase.orgUnit.delete({ where: { id } }).catch(() => {});
  for (const key of createdLineages) await prismaBase.orgUnitLineage.delete({ where: { lineageKey: key } }).catch(() => {});
  const entityTypes = ["event_organizer", "event_round", "event_settings", "event_score", "event_attendance", "event_closure_report", "event_entity", "event_registration"];
  await prismaBase.auditLog.deleteMany({ where: { entityType: { in: entityTypes }, createdAt: { gte: startedAt } } }).catch(() => {});
  if (createdAssignmentIds.length) await prismaBase.auditLog.deleteMany({ where: { entityType: "role_assignment", entityId: { in: createdAssignmentIds } } }).catch(() => {});
  const ids = [...createdItemIds, ...createdUserIds];
  if (ids.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: ids } } }).catch(() => {});
}

describe.skipIf(!RUN)("Member platform M5 — Event Playground (live Neon)", () => {
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

    ({ unit: clubA, lineageKey: clubALineage } = await makeClub("ZZ M5 Club A"));
    ({ unit: clubB, lineageKey: clubBLineage } = await makeClub("ZZ M5 Club B"));

    coordA = await newMember("coordA");
    await grantScoped(coordA.id, "coordinator", clubALineage);
    coordAActor = { userId: coordA.id };
    coordB = await newMember("coordB");
    await grantScoped(coordB.id, "coordinator", clubBLineage);
    coordBActor = { userId: coordB.id };

    // A staff user with GLOBAL event.manage (central authority).
    const staff = await newMember("staff");
    await grantScoped(staff.id, "staff", null);
    staffActor = { userId: staff.id };

    m1 = await newMember("m1");
    m2 = await newMember("m2");
    m3 = await newMember("m3");
    inactive = await newMember("inactive", { status: "inactive" });

    const { entity: ent } = await organizers.createEventEntity({ name: `ZZ Syndicate ${randomUUID().slice(0, 6)}`, kind: "syndicate" }, actor);
    entity = ent;
    createdEntityIds.push(entity.id);

    eventItem = await makeEvent(
      {
        category: "Hackathon",
        eventDate: new Date("2026-09-01"),
        problemStatement: "# Build something\nSolve a real problem.",
        eligibility: "Open to all students.",
        blocks: [{ kind: "markdown", body: "## Prizes\n- Cash" }, { kind: "link", url: "https://example.org/rules", label: "Rules" }],
      },
      { title: "ZZ Smart Hack", slug: `zz-m5-hack-${randomUUID().slice(0, 8)}` }
    );
  }, 300000);

  afterAll(async () => {
    await teardown();
    if (prismaBase) await prismaBase.$disconnect();
  }, 120000);

  dbit("hybrid content: the published event surfaces in the playground with blocks + problem statement", async () => {
    const ev = await playground.getPlaygroundEvent({ id: eventItem.id });
    expect(ev, "published event should be in the playground").toBeTruthy();
    expect(ev.category).toBe("Hackathon");
    expect(ev.problemStatement).toContain("Build something");
    expect(ev.blocks.some((b) => b.kind === "markdown" && b.body.includes("Prizes"))).toBe(true);
    expect(ev.blocks.some((b) => b.kind === "link" && b.url === "https://example.org/rules")).toBe(true);
  });

  dbit("organizer tagging is CENTRAL + one-target; a scoped coordinator cannot tag (DL-085/086)", async () => {
    // Global staff tags club A (organizer) + the entity (collaborator) + a member.
    const { organizers: saved } = await organizers.setEventOrganizers(
      eventItem.id,
      [
        { orgUnitLineageKey: clubALineage, kind: "organizer", role: "Organizing club" },
        { entityId: entity.id, kind: "collaborator", role: "Sponsor" },
        { email: m3.email, kind: "collaborator", role: "Volunteer lead" },
      ],
      staffActor
    );
    expect(saved).toHaveLength(3);
    expect(saved.filter((o) => o.kind === "organizer")).toHaveLength(1);

    // One-target rule: a tag with both a club and an entity is rejected (422).
    await expect(
      organizers.setEventOrganizers(eventItem.id, [{ orgUnitLineageKey: clubALineage, entityId: entity.id }], staffActor)
    ).rejects.toMatchObject({ status: 422 });

    // CENTRAL: a coordinator (scoped) cannot set organizers even for their own club.
    await expect(organizers.setEventOrganizers(eventItem.id, [], coordAActor)).rejects.toMatchObject({ status: 403 });

    // The tags survived (the failed attempts did not wipe them).
    const list = await organizers.listEventOrganizers(eventItem.id);
    expect(list).toHaveLength(3);
  });

  dbit("assertEventManage: the ORGANIZING club's coordinator manages the event; others are 403 (DL-086)", async () => {
    // coordA is scoped to club A, which now ORGANIZES the event → may add a round.
    const { round } = await rounds.createRound(eventItem.id, { name: "Prelims" }, coordAActor);
    round1 = round;
    expect(round.roundNo).toBe(1);

    // coordB is scoped to club B (NOT organizing) → 403.
    await expect(rounds.createRound(eventItem.id, { name: "Sneaky" }, coordBActor)).rejects.toMatchObject({ status: 403 });
    // a plain member → 403.
    await expect(rounds.createRound(eventItem.id, { name: "Nope" }, { userId: m1.id })).rejects.toMatchObject({ status: 403 });

    // Staff (global) may add a second round.
    const { round: r2 } = await rounds.createRound(eventItem.id, { name: "Finals" }, staffActor);
    expect(r2.roundNo).toBe(2);
    const list = await rounds.listRounds(eventItem.id);
    expect(list).toHaveLength(2);
  });

  dbit("registration: self-register + idempotent dedup + capacity→waitlist + auto-promote + inactive blocked", async () => {
    // m1 registers → confirmed (no capacity yet).
    const r1 = await registration.registerForEvent({ eventItemId: eventItem.id }, m1, { userId: m1.id });
    expect(r1.registration.status).toBe("confirmed");
    // Idempotent: re-register returns the existing active row unchanged.
    const r1b = await registration.registerForEvent({ eventItemId: eventItem.id }, m1, { userId: m1.id });
    expect(r1b.changed).toBe(false);

    // Cap the event at 1 confirmed → m2's registration lands on the WAITLIST.
    await settings.upsertEventSettings(eventItem.id, { capacity: 1 }, staffActor);
    const r2 = await registration.registerForEvent({ eventItemId: eventItem.id }, m2, { userId: m2.id });
    expect(r2.registration.status).toBe("waitlisted");

    // An INACTIVE account cannot participate (M1 seam).
    await expect(registration.registerForEvent({ eventItemId: eventItem.id }, null, { userId: inactive.id })).rejects.toMatchObject({ status: 403 });

    // m1 cancels its CONFIRMED spot → m2 is auto-promoted from the waitlist.
    await registration.cancelRegistration({ eventItemId: eventItem.id }, m1, { userId: m1.id });
    const m2reg = await registration.getMyRegistration(eventItem.id, m2.id);
    expect(m2reg.status).toBe("confirmed");

    const counts = await registration.getRegistrationCounts(eventItem.id);
    expect(counts.confirmed).toBe(1);
    expect(counts.waitlisted).toBe(0);

    // ORGANIZER-initiated vacating also auto-promotes (review fix): m3 waitlists, then an
    // organizer cancels the confirmed m2 → m3 is promoted (a freed seat is never stranded).
    const r3 = await registration.registerForEvent({ eventItemId: eventItem.id }, m3, { userId: m3.id });
    expect(r3.registration.status).toBe("waitlisted");
    await registration.setRegistrationStatus(m2reg.id, "cancelled", staffActor);
    const m3reg = await registration.getMyRegistration(eventItem.id, m3.id);
    expect(m3reg.status).toBe("confirmed");
  });

  dbit("scores → per-round + overall ranking (standard competition rank); missing emails reported", async () => {
    const res = await scoring.setRoundScores(
      eventItem.id,
      round1.id,
      [{ email: m2.email, points: 30 }, { email: m3.email, points: 20 }, { email: "zz-m5-nobody@iitjammu.ac.in", points: 5 }],
      coordAActor // the organizing coordinator may score
    );
    expect(res.scored).toBe(2);
    expect(res.missing).toHaveLength(1);

    const roundRank = await scoring.getRoundRanking(eventItem.id, round1.id);
    expect(roundRank[0].points).toBe(30);
    expect(roundRank[0].rank).toBe(1);
    expect(roundRank[1].rank).toBe(2);

    const overall = await scoring.getOverallRanking(eventItem.id);
    // Ranking is PII-minimized — NAME only, no userId (review fix); match by display name.
    expect(overall.every((e) => e.userId === undefined)).toBe(true);
    expect(overall.find((e) => e.name === m2.name)?.points).toBe(30);
    expect(overall[0].rank).toBe(1);
  });

  dbit("attendance marking (round-wise, replace-set) — audited by the organizer", async () => {
    const res = await scoring.markAttendance(eventItem.id, round1.id, [{ email: m2.email, present: true }, { email: m3.email, present: false }], coordAActor);
    expect(res.marked).toBe(2);
    expect(res.present).toBe(1);
  });

  dbit("closure: an organizer submits; only a CENTRAL reviewer can review (DL-088)", async () => {
    const { report } = await closure.submitClosureReport(
      { eventItemId: eventItem.id, roleContribution: "We organized the hackathon.", reportedBudget: 5000 },
      coordAActor
    );
    expect(report.status).toBe("submitted");
    expect(report.reportedBudget).toBe(5000);

    // A scoped coordinator cannot REVIEW (central-only, requireGlobal) → 403.
    await expect(closure.reviewClosureReport(report.id, { reviewComment: "ok", correctedBudget: 4800 }, coordAActor)).rejects.toMatchObject({ status: 403 });

    // Staff (global) reviews → comment + corrected budget saved, status reviewed.
    const { report: reviewed } = await closure.reviewClosureReport(report.id, { reviewComment: "Reduced venue cost.", correctedBudget: 4800 }, staffActor);
    expect(reviewed.status).toBe("reviewed");
    expect(reviewed.correctedBudget).toBe(4800);
  });

  dbit("CSV downloads: participants + scores are gated to a manager and well-formed", async () => {
    const participants = await downloads.exportEventCsv(eventItem.id, "participants", staffActor);
    expect(participants.content.split("\n")[0]).toBe("Name,Email,Status,Team,Registered At");
    expect(participants.content).toContain(m2.email); // confirmed participant

    const scores = await downloads.exportEventCsv(eventItem.id, "scores", coordAActor, { roundId: round1.id });
    expect(scores.content).toContain(m2.email);

    // A plain member cannot download (no event.manage) → 403.
    await expect(downloads.exportEventCsv(eventItem.id, "participants", { userId: m1.id })).rejects.toMatchObject({ status: 403 });
  });

  dbit("registration roster (PII) is gated; getPlaygroundEvent minimizes PII to names", async () => {
    // Gated roster (emails) requires event.manage.
    const roster = await registration.listRegistrations({ eventItemId: eventItem.id }, staffActor);
    expect(roster.entries.some((e) => e.userEmail === m2.email)).toBe(true);
    await expect(registration.listRegistrations({ eventItemId: eventItem.id }, { userId: m1.id })).rejects.toMatchObject({ status: 403 });

    // The public playground detail exposes ranking NAMES but NEITHER emails NOR the
    // internal app_user uuids (PII minimization, DL-082 parity — review fix).
    const ev = await playground.getPlaygroundEvent({ id: eventItem.id, userId: m3.id });
    const serialized = JSON.stringify(ev);
    expect(serialized).not.toContain(m2.email);
    expect(serialized).not.toContain(m3.email);
    expect(serialized).not.toContain(m2.id); // no app_user uuid in the ranking shape
    expect(serialized).not.toContain(m3.id);
    expect(ev.rankings.overall.length).toBeGreaterThan(0); // rankings still present (by name)
    expect(ev.registration.mine.status).toBe("confirmed"); // m3 was promoted → own status present
  });

  dbit("Events Organized: a curated doc's edits are audited + downloadable from the dev dashboard (DL-089)", async () => {
    const { item } = await content.createDraft(
      { contentType: "events_organized", academicYearId: currentYear.id, slug: `zz-m5-org-${randomUUID().slice(0, 8)}`, title: "Events Organized 2025-26", payload: { blockKind: "markdown", body: "## Flagship\n- ZZ Smart Hack by Club A" } },
      actor
    );
    createdItemIds.push(item.id);
    await content.publish(item.id, {}, actor);
    // Edit → open a new draft → publish it, so the updated body is the LIVE revision the
    // page renders (and the change history records create + publish + update + publish).
    await content.editDraft(item.id, { payload: { body: "## Flagship\n- ZZ Smart Hack by Club A (updated)" } }, actor);
    await content.publish(item.id, {}, actor);

    const history = await organized.getEventsOrganizedChangeHistory({ yearId: currentYear.id }, actor, { take: 50 });
    const forDoc = history.entries.filter((e) => e.entityId === item.id);
    expect(forDoc.length).toBeGreaterThanOrEqual(3); // create + publish + update (+ publish)
    expect(forDoc.some((e) => e.action === "publish")).toBe(true);
    expect(forDoc.some((e) => e.action === "update")).toBe(true);

    const csv = await organized.exportEventsOrganizedHistory({ yearId: currentYear.id }, actor, { format: "csv" });
    expect(csv.format).toBe("csv");
    expect(csv.content.split("\n")[0]).toContain("action");

    // A plain member cannot read the change history (audit.read) → 403.
    await expect(organized.getEventsOrganizedChangeHistory({ yearId: currentYear.id }, { userId: m1.id })).rejects.toMatchObject({ status: 403 });

    // The doc + index render for the Events-Organized page.
    const docs = await organized.listEventsOrganizedDocs({ yearId: currentYear.id });
    expect(docs.some((d) => d.id === item.id && d.body.includes("updated"))).toBe(true);
    const index = await organized.listOrganizedEventsIndex({ yearId: currentYear.id });
    expect(index.some((e) => e.id === eventItem.id && e.organizers.some((o) => o.name === clubA.name))).toBe(true);
  });
});
