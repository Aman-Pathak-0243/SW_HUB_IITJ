// Live-DB integration tests for Session-11 / M6 — Member profiles & performance.
// Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set. Run isolated (KNOWN_ISSUES
// #39) with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/m6.db.test.mjs --pool=forks --poolOptions.forks.singleFork
//
// Fixtures (all zz-m6-*, cleaned in afterAll via the audit-bypassing base client): a
// throwaway published EVENT (category Hackathon, past date) + a round + settings; a
// throwaway CLUB (organizes the event) + a custom ENTITY (also organizes); memberA (an
// institute-format email so identity parses) tagged as an organizer, registered
// (confirmed), scored (rank #1 via SUM of round+overall rows), present, a club member, holding a scoped
// coordinator role, and credited on a published ACHIEVEMENT (which also credits the club).
// Asserts M6 AGGREGATION CORRECTNESS + VISIBILITY: getMemberProfile (identity/roles/
// affiliations/events/rank/achievements), getMemberContribution / getClubContribution /
// getEntityContribution counts, the dispatcher (member-by-email / club / entity), year
// scoping (a different year → 0), listMemberAchievements, and empty-account safety.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

let prismaBase, content, users, profileLib, contributionLib, achievementsPublic;
let dev, actor, currentYear, clubType;
let club, clubLineage, entity;
let memberA, memberB, emptyMember, coordinatorRole;
let eventItem, round1, achItem;

const startedAt = new Date();
const createdUserIds = [];
const createdItemIds = [];
const createdUnitIds = [];
const createdLineages = [];
const createdEntityIds = [];

const mkEmail = (t) => `zz-m6-${t}-${randomUUID()}@iitjammu.ac.in`;
// A valid institute-format email (parseInstituteEmail: <year><u|p|r><branch><serial>).
const mkInstituteEmail = () => `2023ume${String(Date.now()).slice(-4)}@iitjammu.ac.in`;

async function load() {
  const p = await import("../lib/prisma.mjs");
  prismaBase = p.prismaBase;
  content = await import("../lib/cms/content.mjs");
  users = await import("../lib/users/admin.mjs");
  profileLib = await import("../lib/member/profile.mjs");
  contributionLib = await import("../lib/member/contribution.mjs");
  achievementsPublic = await import("../lib/achievements/public.mjs");
}

async function newMember(tag, { email } = {}) {
  const { user } = await users.createUser({ email: email ?? mkEmail(tag), name: `ZZ M6 ${tag}` }, actor);
  createdUserIds.push(user.id);
  return user;
}

async function teardown() {
  if (!prismaBase) return;
  // Deleting the content items cascades their relational children (organizer /
  // registration / score / attendance / round / settings / achievement_credit).
  for (const id of createdItemIds) await prismaBase.contentItem.delete({ where: { id } }).catch(() => {});
  await prismaBase.clubMembership.deleteMany({ where: { orgUnitLineageKey: { in: createdLineages } } }).catch(() => {});
  await prismaBase.roleAssignment.deleteMany({ where: { userId: { in: createdUserIds } } }).catch(() => {});
  for (const id of createdEntityIds) await prismaBase.eventEntity.delete({ where: { id } }).catch(() => {});
  for (const id of createdUserIds) await prismaBase.user.delete({ where: { id } }).catch(() => {});
  for (const id of createdUnitIds) await prismaBase.orgUnit.delete({ where: { id } }).catch(() => {});
  for (const key of createdLineages) await prismaBase.orgUnitLineage.delete({ where: { lineageKey: key } }).catch(() => {});
  const ids = [...createdItemIds, ...createdUserIds];
  if (ids.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: ids } } }).catch(() => {});
  await prismaBase.auditLog.deleteMany({ where: { entityType: { in: ["event_entity"] }, createdAt: { gte: startedAt } } }).catch(() => {});
}

describe.skipIf(!RUN)("Member platform M6 — profiles & performance (live Neon)", () => {
  beforeAll(async () => {
    await load();
    for (let i = 1; i <= 12; i++) {
      try { await prismaBase.$queryRaw`SELECT 1`; break; } catch { await new Promise((r) => setTimeout(r, 5000)); }
    }
    dev = await prismaBase.user.findFirst({ where: { isDeveloper: true } });
    actor = { userId: dev.id };
    currentYear = await prismaBase.academicYear.findFirst({ where: { isCurrent: true } });
    clubType = await prismaBase.orgUnitType.findUnique({ where: { key: "club" } });
    coordinatorRole = await prismaBase.role.findUnique({ where: { key: "coordinator" } });
    expect(clubType && coordinatorRole, "seed must be applied — run npm run db:seed").toBeTruthy();

    // Club (organizes the event) + a custom entity (also organizes).
    const lineage = await prismaBase.orgUnitLineage.create({ data: { canonicalName: "ZZ M6 Club", firstSeenYearId: currentYear.id } });
    clubLineage = lineage.lineageKey;
    createdLineages.push(clubLineage);
    club = await prismaBase.orgUnit.create({
      data: { academicYearId: currentYear.id, orgUnitTypeId: clubType.id, lineageKey: clubLineage, slug: `zz-m6-club-${randomUUID().slice(0, 8)}`, name: "ZZ M6 Club", status: "published" },
    });
    createdUnitIds.push(club.id);
    entity = await prismaBase.eventEntity.create({ data: { name: `ZZ M6 Syndicate ${randomUUID().slice(0, 6)}`, kind: "syndicate" } });
    createdEntityIds.push(entity.id);

    memberA = await newMember("A", { email: mkInstituteEmail() });
    memberB = await newMember("B");
    emptyMember = await newMember("empty");

    // A published event (past date → "participated"), via the CMS spine.
    const { item } = await content.createDraft(
      { contentType: "event", academicYearId: currentYear.id, slug: `zz-m6-ev-${randomUUID().slice(0, 8)}`, title: "ZZ M6 Hack", payload: { category: "Hackathon", eventDate: new Date("2026-05-01") } },
      actor
    );
    eventItem = item;
    createdItemIds.push(eventItem.id);
    await content.publish(eventItem.id, {}, actor);

    // A published achievement crediting memberA + the club.
    const { item: ach } = await content.createDraft(
      { contentType: "achievement", academicYearId: currentYear.id, slug: `zz-m6-ach-${randomUUID().slice(0, 8)}`, title: "ZZ M6 Win", payload: { category: "Sports", achievementDate: new Date("2026-04-01") } },
      actor
    );
    achItem = ach;
    createdItemIds.push(achItem.id);
    await content.publish(achItem.id, {}, actor);

    // Operational relational rows built directly (M6 is a read module — it aggregates
    // durable rows regardless of the write path; direct inserts keep the suite fast and
    // audit-free).
    round1 = await prismaBase.eventRound.create({ data: { eventItemId: eventItem.id, roundNo: 1, name: "Round 1" } });
    await prismaBase.eventSettings.create({ data: { eventItemId: eventItem.id, capacity: 10 } });
    await prismaBase.eventOrganizer.createMany({
      data: [
        { eventItemId: eventItem.id, kind: "organizer", orgUnitLineageKey: clubLineage, role: "Organizing club" },
        { eventItemId: eventItem.id, kind: "collaborator", entityId: entity.id, role: "Partner" },
        { eventItemId: eventItem.id, kind: "organizer", userId: memberA.id, role: "Lead" },
      ],
    });
    await prismaBase.eventRegistration.createMany({
      data: [
        { eventItemId: eventItem.id, userId: memberA.id, status: "confirmed" },
        { eventItemId: eventItem.id, userId: memberB.id, status: "confirmed" },
      ],
    });
    // Scores exercise the OVERALL semantic = SUM across (round rows + the overall row),
    // matching M5 getOverallRanking (review): memberA = 40 (round1) + 60 (overall row,
    // roundId null) = 100; memberB = 90. So memberA OUTRANKS memberB (#1) ONLY when the
    // rows are summed — a regression that ranked by a single row (round1: 40 < 90, or the
    // overall row alone) would rank memberA #2 and fail this assertion.
    await prismaBase.eventScore.createMany({
      data: [
        { eventItemId: eventItem.id, roundId: round1.id, userId: memberA.id, points: 40 },
        { eventItemId: eventItem.id, roundId: null, userId: memberA.id, points: 60 },
        { eventItemId: eventItem.id, roundId: round1.id, userId: memberB.id, points: 90 },
      ],
    });
    await prismaBase.eventAttendance.create({ data: { eventItemId: eventItem.id, roundId: round1.id, userId: memberA.id, present: true } });
    await prismaBase.clubMembership.create({ data: { userId: memberA.id, orgUnitLineageKey: clubLineage, role: "Member", status: "active" } });
    await prismaBase.roleAssignment.create({ data: { userId: memberA.id, roleId: coordinatorRole.id, orgUnitLineageKey: clubLineage, academicYearId: currentYear.id } });
    await prismaBase.achievementCredit.createMany({
      data: [
        { achievementItemId: achItem.id, userId: memberA.id, role: "Winner" },
        { achievementItemId: achItem.id, orgUnitLineageKey: clubLineage, role: "Home club" },
      ],
    });
  }, 300000);

  afterAll(async () => {
    await teardown();
    if (prismaBase) await prismaBase.$disconnect();
  }, 120000);

  dbit("getMemberProfile aggregates identity, roles, affiliations, events (with rank), achievements", async () => {
    const p = await profileLib.getMemberProfile(memberA.id);
    expect(p).toBeTruthy();
    // Identity parses from the institute-format email.
    expect(p.member.identity).toMatchObject({ year: 2023, level: "ug", branch: "me" });
    // Roles: the scoped coordinator role, with the club name resolved.
    const coord = p.roles.find((r) => r.key === "coordinator");
    expect(coord).toBeTruthy();
    expect(coord.scope.orgUnitLineageKey).toBe(clubLineage);
    expect(coord.scope.unitName).toBe("ZZ M6 Club");
    // Affiliation: the club membership.
    const aff = p.affiliations.find((a) => a.orgUnitLineageKey === clubLineage);
    expect(aff).toMatchObject({ name: "ZZ M6 Club", status: "active" });
    // No syndicate affiliation today (derived, empty).
    expect(p.syndicate).toBeNull();
    // Event involvement: category-mapped, confirmed, attended, and scored via the SUM of
    // the member's round + overall rows (40 + 60 = 100), which ranks memberA #1 over
    // memberB (90) — proving the sum-across-rows overall-rank semantic (matches M5).
    const ev = p.events.find((e) => e.eventItemId === eventItem.id);
    expect(ev).toBeTruthy();
    expect(ev.category).toBe("Hackathon");
    expect(ev.registration.status).toBe("confirmed");
    expect(ev.attended).toBe(true);
    expect(ev.points).toBe(100); // 40 (round1) + 60 (overall row)
    expect(ev.rank).toBe(1); // ahead of memberB (90) ONLY when rows are summed
    // Achievement credited to memberA, and its credited-member shape is PII-minimized
    // (display NAME only — no app_user uuid/email leaks into the profile; DL-082 parity).
    const ach = p.achievements.find((a) => a.id === achItem.id);
    expect(ach).toBeTruthy();
    for (const m of ach.credits?.members ?? []) {
      expect(m.userId).toBeUndefined();
      expect(m.email).toBeUndefined();
      expect(typeof m.name === "string" || m.name === null).toBe(true);
    }
  });

  dbit("getMemberContribution counts organized / participated / achievements / roles for the year", async () => {
    const c = await contributionLib.getMemberContribution(memberA.id);
    expect(c.kind).toBe("member");
    expect(c.eventsOrganized.count).toBe(1);
    expect(c.eventsOrganized.items[0].eventItemId).toBe(eventItem.id);
    expect(c.eventsParticipated.count).toBe(1);
    expect(c.achievements.count).toBe(1);
    expect(c.roles.count).toBeGreaterThanOrEqual(1);
    expect(c.subject.email).toBe(memberA.email);
  });

  dbit("getMemberContribution is year-scoped — a different year yields zero", async () => {
    const other = await prismaBase.academicYear.findFirst({ where: { isCurrent: false } });
    const bogusYear = other?.id ?? randomUUID();
    const c = await contributionLib.getMemberContribution(memberA.id, { yearId: bogusYear });
    expect(c.eventsOrganized.count).toBe(0);
    expect(c.eventsParticipated.count).toBe(0);
    expect(c.achievements.count).toBe(0);
  });

  dbit("getClubContribution aggregates the club's organized events, achievements, members, reach", async () => {
    const c = await contributionLib.getClubContribution(clubLineage);
    expect(c.kind).toBe("club");
    expect(c.subject.name).toBe("ZZ M6 Club");
    expect(c.eventsOrganized.count).toBe(1);
    expect(c.achievements.count).toBe(1);
    expect(c.members.count).toBeGreaterThanOrEqual(1);
    expect(c.participantsReached.count).toBeGreaterThanOrEqual(2); // memberA + memberB confirmed
  });

  dbit("getEntityContribution aggregates the custom entity's organized events", async () => {
    const c = await contributionLib.getEntityContribution(entity.id);
    expect(c.kind).toBe("entity");
    expect(c.subject.name).toBe(entity.name);
    expect(c.eventsOrganized.count).toBe(1);
    expect(c.participantsReached.count).toBeGreaterThanOrEqual(2);
  });

  dbit("getStakeholderContribution dispatches by member-email / club / entity", async () => {
    const byEmail = await contributionLib.getStakeholderContribution({ kind: "member", email: memberA.email });
    expect(byEmail?.subject.userId).toBe(memberA.id);
    const byClub = await contributionLib.getStakeholderContribution({ kind: "club", orgUnitLineageKey: clubLineage });
    expect(byClub?.subject.orgUnitLineageKey).toBe(clubLineage);
    const byEntity = await contributionLib.getStakeholderContribution({ kind: "entity", entityId: entity.id });
    expect(byEntity?.subject.entityId).toBe(entity.id);
    // An unknown email resolves to null (not a crash, no leak).
    expect(await contributionLib.getStakeholderContribution({ kind: "member", email: "nobody-zz-m6@iitjammu.ac.in" })).toBeNull();
  });

  dbit("listMemberAchievements returns the member's credited (published, current-year) achievements", async () => {
    const mine = await achievementsPublic.listMemberAchievements(memberA.id);
    expect(mine.some((a) => a.id === achItem.id)).toBe(true);
    // A member with no credits → [].
    expect(await achievementsPublic.listMemberAchievements(emptyMember.id)).toEqual([]);
  });

  dbit("an account with no involvement returns a valid empty profile (not null); an unknown id is null", async () => {
    const p = await profileLib.getMemberProfile(emptyMember.id);
    expect(p).toBeTruthy();
    expect(p.member.id).toBe(emptyMember.id);
    expect(p.events).toEqual([]);
    expect(p.affiliations).toEqual([]);
    expect(p.achievements).toEqual([]);
    expect(p.roles).toEqual([]);
    expect(p.syndicate).toBeNull();
    expect(await profileLib.getMemberProfile(randomUUID())).toBeNull();
  });
});
