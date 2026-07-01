// Live-DB integration tests for the scoped-coordinator surface (Session 13, DL-096).
// Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set. Run isolated (KNOWN_ISSUES
// #39) with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/coordinator.db.test.mjs --pool=forks --poolOptions.forks.singleFork
//
// Fixtures (all zz-coord-*, cleaned in afterAll via the audit-bypassing base client): two
// throwaway CLUBs (A, B), each organizing its own throwaway published EVENT; a coordinator
// scoped to each club; a global STAFF (unscoped event.manage); and an INACTIVE coordinator
// scoped to A. Asserts the surface's read layer: listManageableLineages resolves ONLY the
// coordinator's own club (with display name + {events,members} caps, and NOT another's),
// a global holder / an inactive coordinator get NOTHING, listEventsForManager returns only
// the coordinator's organized events, and getManagedEvent gates by assertEventManage (403
// for another club's event / a plain member).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

let prismaBase, content, users, organizers, grants, manage;
let dev, actor, currentYear, clubType;
let clubA, clubALineage, coordA, coordAActor;
let clubB, clubBLineage, coordB, coordBActor;
let staffActor, inactiveCoord, member;
let eventA, eventB;
const startedAt = new Date();
const createdUserIds = [];
const createdItemIds = [];
const createdUnitIds = [];
const createdLineages = [];
const createdAssignmentIds = [];

const mkEmail = (t) => `zz-coord-${t}-${randomUUID()}@iitjammu.ac.in`;

async function load() {
  const p = await import("../lib/prisma.mjs");
  prismaBase = p.prismaBase;
  content = await import("../lib/cms/content.mjs");
  users = await import("../lib/users/admin.mjs");
  organizers = await import("../lib/events/organizers.mjs");
  grants = await import("../lib/rbac/grants.mjs");
  manage = await import("../lib/events/manage.mjs");
}

async function makeClub(name) {
  const lineage = await prismaBase.orgUnitLineage.create({ data: { canonicalName: name, firstSeenYearId: currentYear.id } });
  const unit = await prismaBase.orgUnit.create({
    data: { academicYearId: currentYear.id, orgUnitTypeId: clubType.id, lineageKey: lineage.lineageKey, slug: `zz-coord-${randomUUID().slice(0, 8)}`, name, status: "published" },
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

async function makeEvent(lineageKey, title) {
  const { item } = await content.createDraft(
    { contentType: "event", academicYearId: currentYear.id, slug: `zz-coord-ev-${randomUUID().slice(0, 8)}`, title, payload: { category: "Quiz", eventDate: new Date("2026-10-01") } },
    actor
  );
  createdItemIds.push(item.id);
  await content.publish(item.id, {}, actor);
  await organizers.setEventOrganizers(item.id, [{ orgUnitLineageKey: lineageKey, kind: "organizer", role: "Organizer" }], actor);
  return item;
}

async function teardown() {
  if (!prismaBase) return;
  for (const id of createdItemIds) await prismaBase.contentItem.delete({ where: { id } }).catch(() => {});
  for (const id of createdUserIds) await prismaBase.user.delete({ where: { id } }).catch(() => {});
  for (const id of createdUnitIds) await prismaBase.orgUnit.delete({ where: { id } }).catch(() => {});
  for (const key of createdLineages) await prismaBase.orgUnitLineage.delete({ where: { lineageKey: key } }).catch(() => {});
  const entityTypes = ["event_organizer", "event_round", "event_settings", "event_score", "event_attendance", "event_closure_report", "event_registration"];
  await prismaBase.auditLog.deleteMany({ where: { entityType: { in: entityTypes }, createdAt: { gte: startedAt } } }).catch(() => {});
  if (createdAssignmentIds.length) await prismaBase.auditLog.deleteMany({ where: { entityType: "role_assignment", entityId: { in: createdAssignmentIds } } }).catch(() => {});
  const ids = [...createdItemIds, ...createdUserIds];
  if (ids.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: ids } } }).catch(() => {});
}

describe.skipIf(!RUN)("Scoped-coordinator surface (live Neon)", () => {
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

    ({ unit: clubA, lineageKey: clubALineage } = await makeClub("ZZ Coord Club A"));
    ({ unit: clubB, lineageKey: clubBLineage } = await makeClub("ZZ Coord Club B"));

    coordA = await newMember("coordA");
    await grantScoped(coordA.id, "coordinator", clubALineage);
    coordAActor = { userId: coordA.id };
    coordB = await newMember("coordB");
    await grantScoped(coordB.id, "coordinator", clubBLineage);
    coordBActor = { userId: coordB.id };

    const staff = await newMember("staff");
    await grantScoped(staff.id, "staff", null); // GLOBAL event.manage — uses /admin, not /coordinator
    staffActor = { userId: staff.id };

    inactiveCoord = await newMember("inactiveCoord");
    await grantScoped(inactiveCoord.id, "coordinator", clubALineage);
    await prismaBase.user.update({ where: { id: inactiveCoord.id }, data: { status: "inactive" } });

    member = await newMember("member"); // plain active member, no roles

    eventA = await makeEvent(clubALineage, "ZZ Coord Event A");
    eventB = await makeEvent(clubBLineage, "ZZ Coord Event B");
  }, 300000);

  afterAll(async () => {
    await teardown();
    if (prismaBase) await prismaBase.$disconnect();
  }, 120000);

  dbit("listManageableLineages resolves ONLY the coordinator's own club (with caps + display name)", async () => {
    const a = await grants.listManageableLineages(coordA.id, ["event.manage", "membership.manage"]);
    expect(a).toHaveLength(1);
    expect(a[0].orgUnitLineageKey).toBe(clubALineage);
    expect(a[0].name).toBe(clubA.name);
    expect(a[0].typeKey).toBe("club");
    expect(a[0].publishedThisYear).toBe(true);
    // coordinator role holds BOTH scoped manage perms.
    expect(a[0].permissions).toEqual({ events: true, members: true });
    // NOT another coordinator's club.
    expect(a.some((c) => c.orgUnitLineageKey === clubBLineage)).toBe(false);

    const b = await grants.listManageableLineages(coordB.id, ["event.manage", "membership.manage"]);
    expect(b.map((c) => c.orgUnitLineageKey)).toEqual([clubBLineage]);
  });

  dbit("a GLOBAL holder (staff) and a plain member have NO scoped lineages (they use /admin or nothing)", async () => {
    expect(await grants.listManageableLineages(staffActor.userId, ["event.manage", "membership.manage"])).toEqual([]);
    expect(await grants.listManageableLineages(member.id, ["event.manage", "membership.manage"])).toEqual([]);
  });

  dbit("an INACTIVE coordinator resolves to NOTHING (management is active-only)", async () => {
    expect(await grants.listManageableLineages(inactiveCoord.id, ["event.manage", "membership.manage"])).toEqual([]);
  });

  dbit("listEventsForManager returns only the coordinator's organized events", async () => {
    const forA = await manage.listEventsForManager([clubALineage]);
    expect(forA.some((e) => e.id === eventA.id)).toBe(true);
    expect(forA.some((e) => e.id === eventB.id)).toBe(false);
    expect(forA.find((e) => e.id === eventA.id)?.title).toBe("ZZ Coord Event A");

    const forB = await manage.listEventsForManager([clubBLineage]);
    expect(forB.map((e) => e.id)).toContain(eventB.id);
    expect(forB.some((e) => e.id === eventA.id)).toBe(false);
  });

  dbit("getManagedEvent is GATED by assertEventManage — own event ok, others 403", async () => {
    const ok = await manage.getManagedEvent(eventA.id, coordAActor);
    expect(ok.event.id).toBe(eventA.id);
    expect(ok.event.title).toBe("ZZ Coord Event A");
    expect(Array.isArray(ok.rounds)).toBe(true);
    expect(Array.isArray(ok.registrations)).toBe(true);
    expect(ok.settings).toBeTruthy();

    // coordA cannot open club B's event; coordB cannot open club A's; a member cannot open either.
    await expect(manage.getManagedEvent(eventB.id, coordAActor)).rejects.toMatchObject({ status: 403 });
    await expect(manage.getManagedEvent(eventA.id, coordBActor)).rejects.toMatchObject({ status: 403 });
    await expect(manage.getManagedEvent(eventA.id, { userId: member.id })).rejects.toMatchObject({ status: 403 });

    // A global staff CAN open it (global event.manage passes assertEventManage).
    const staffView = await manage.getManagedEvent(eventA.id, staffActor);
    expect(staffView.event.id).toBe(eventA.id);
  });
});
