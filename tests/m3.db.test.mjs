// Live-DB integration tests for Session-11 / M3 — club/council pages expansion +
// memberships. Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set. Run with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/m3.db.test.mjs
//
// Fixtures (all zz-m3-* / created via prismaBase or the real services, cleaned in
// afterAll via the audit-bypassing base client): two throwaway published CLUBS in the
// current year (A + B, distinct lineages), a coordinator SCOPED to club A's lineage,
// and throwaway member accounts. Asserts: membership add/idempotency/remove/status +
// the SCOPED membership.manage gate (coordinator → own club only, DL-066), the
// idempotent CSV importer (missing accounts reported), club_doc CRUD + read, club
// announcement sync-to-central (DL-078), club events read, and getClubPageView.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

let prismaBase, memberships, users, content, eventsPub, docsPub, orgPub;
let dev, actor, currentYear, clubType;
let unitA, unitB, lineageA, lineageB;
let coordUser, coordActor;
const startedAt = new Date();
const createdUserIds = [];
const createdItemIds = [];
const createdUnitIds = [];
const createdLineages = [];
const createdAssignmentIds = [];

const mkEmail = (t) => `zz-m3-${t}-${randomUUID()}@iitjammu.ac.in`;

async function load() {
  const p = await import("../lib/prisma.mjs");
  prismaBase = p.prismaBase;
  memberships = await import("../lib/memberships/service.mjs");
  users = await import("../lib/users/admin.mjs");
  content = await import("../lib/cms/content.mjs");
  eventsPub = await import("../lib/events/public.mjs");
  docsPub = await import("../lib/org/docs.mjs");
  orgPub = await import("../lib/org/public.mjs");
}

async function makeClub(name) {
  const lineage = await prismaBase.orgUnitLineage.create({ data: { canonicalName: name, firstSeenYearId: currentYear.id } });
  const unit = await prismaBase.orgUnit.create({
    data: {
      academicYearId: currentYear.id,
      orgUnitTypeId: clubType.id,
      lineageKey: lineage.lineageKey,
      slug: `zz-m3-${randomUUID().slice(0, 8)}`,
      name,
      status: "published",
    },
  });
  createdUnitIds.push(unit.id);
  createdLineages.push(lineage.lineageKey);
  return { unit, lineageKey: lineage.lineageKey };
}

async function newMember(tag) {
  const { user } = await users.createUser({ email: mkEmail(tag), name: `ZZ ${tag}` }, actor);
  createdUserIds.push(user.id);
  return user;
}

async function teardown() {
  if (!prismaBase) return;
  for (const id of createdItemIds) await prismaBase.contentItem.delete({ where: { id } }).catch(() => {});
  for (const id of createdUserIds) await prismaBase.user.delete({ where: { id } }).catch(() => {}); // cascades memberships + assignments
  for (const id of createdUnitIds) await prismaBase.orgUnit.delete({ where: { id } }).catch(() => {});
  for (const key of createdLineages) await prismaBase.orgUnitLineage.delete({ where: { lineageKey: key } }).catch(() => {});
  await prismaBase.auditLog.deleteMany({ where: { entityType: "club_membership", createdAt: { gte: startedAt } } }).catch(() => {});
  if (createdAssignmentIds.length) await prismaBase.auditLog.deleteMany({ where: { entityType: "role_assignment", entityId: { in: createdAssignmentIds } } }).catch(() => {});
  const ids = [...createdItemIds, ...createdUserIds];
  if (ids.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: ids } } }).catch(() => {});
}

describe.skipIf(!RUN)("Member platform M3 — club pages + memberships (live Neon)", () => {
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

    ({ unit: unitA, lineageKey: lineageA } = await makeClub("ZZ M3 Club A"));
    ({ unit: unitB, lineageKey: lineageB } = await makeClub("ZZ M3 Club B"));

    // A coordinator SCOPED to club A's lineage (current year) — proves DL-066 scoping.
    coordUser = await newMember("coord");
    const coordinator = await prismaBase.role.findUnique({ where: { key: "coordinator" } });
    expect(coordinator, "coordinator category must be seeded").toBeTruthy();
    await users.grantRole({ userId: coordUser.id, roleId: coordinator.id, orgUnitLineageKey: lineageA, academicYearId: currentYear.id }, actor);
    // track the grant's assignment id so its grant_role audit row is cleaned up too.
    const coordGrant = await prismaBase.roleAssignment.findFirst({ where: { userId: coordUser.id, roleId: coordinator.id }, select: { id: true } });
    if (coordGrant) createdAssignmentIds.push(coordGrant.id);
    coordActor = { userId: coordUser.id };
  }, 180000);

  afterAll(async () => {
    await teardown();
    if (prismaBase) await prismaBase.$disconnect();
  }, 120000);

  dbit("addMembership creates then idempotently updates (one row per user+lineage)", async () => {
    const m1 = await newMember("m1");
    const r1 = await memberships.addMembership({ userId: m1.id, orgUnitLineageKey: lineageA, role: "Member" }, actor);
    expect(r1.membership.status).toBe("active");
    expect(r1.membership.role).toBe("Member");
    // re-add updates in place (no duplicate — the unique holds)
    const r2 = await memberships.addMembership({ email: m1.email, orgUnitLineageKey: lineageA, role: "Lead", status: "inactive" }, actor);
    expect(r2.membership.id).toBe(r1.membership.id);
    expect(r2.membership.role).toBe("Lead");
    expect(r2.membership.status).toBe("inactive");
    // a status-only re-add (role OMITTED) must PRESERVE the existing role, not null it.
    const r3 = await memberships.addMembership({ userId: m1.id, orgUnitLineageKey: lineageA, status: "active" }, actor);
    expect(r3.membership.role).toBe("Lead");
    expect(r3.membership.status).toBe("active");
    const count = await prismaBase.clubMembership.count({ where: { userId: m1.id, orgUnitLineageKey: lineageA } });
    expect(count).toBe(1);
  });

  dbit("membership.manage is SCOPED: the club-A coordinator manages A but is 403 on club B (DL-066)", async () => {
    const m = await newMember("scoped");
    // coordinator scoped to A can add to A
    const ok = await memberships.addMembership({ userId: m.id, orgUnitLineageKey: lineageA }, coordActor);
    expect(ok.membership.orgUnitLineageKey).toBe(lineageA);
    // …but NOT to club B (different lineage → out of scope)
    await expect(
      memberships.addMembership({ userId: m.id, orgUnitLineageKey: lineageB }, coordActor)
    ).rejects.toMatchObject({ status: 403 });
    // an unauthenticated actor is 401
    await expect(memberships.addMembership({ userId: m.id, orgUnitLineageKey: lineageA }, {})).rejects.toMatchObject({ status: 401 });
  });

  dbit("addMembership rejects an email with no account (create the account first)", async () => {
    await expect(
      memberships.addMembership({ email: `zz-m3-ghost-${randomUUID()}@iitjammu.ac.in`, orgUnitLineageKey: lineageA }, actor)
    ).rejects.toMatchObject({ status: 422 });
  });

  dbit("remove + setStatus + count + listUserMemberships + listMembershipsForUnit", async () => {
    const m = await newMember("crud");
    const added = await memberships.addMembership({ userId: m.id, orgUnitLineageKey: lineageA }, actor);
    expect(await memberships.getMembershipCountForUnit(lineageA)).toBeGreaterThanOrEqual(1);

    const st = await memberships.setMembershipStatus(added.membership.id, "inactive", actor);
    expect(st.membership.status).toBe("inactive");

    const mine = await memberships.listUserMemberships(m.id);
    expect(mine.find((x) => x.orgUnitLineageKey === lineageA)).toBeTruthy();
    expect(mine[0].unit?.slug).toBe(unitA.slug); // resolved to the current-year club

    const roster = await memberships.listMembershipsForUnit({ orgUnitLineageKey: lineageA }, actor);
    expect(roster.entries.some((e) => e.userId === m.id)).toBe(true);
    // the PII roster read is GATED: unauthenticated → 401; out-of-scope coordinator → 403.
    await expect(memberships.listMembershipsForUnit({ orgUnitLineageKey: lineageA }, {})).rejects.toMatchObject({ status: 401 });
    await expect(memberships.listMembershipsForUnit({ orgUnitLineageKey: lineageB }, coordActor)).rejects.toMatchObject({ status: 403 });

    const removed = await memberships.removeMembership(added.membership.id, actor);
    expect(removed.removed).toBe(true);
    expect(await prismaBase.clubMembership.count({ where: { id: added.membership.id } })).toBe(0);
  });

  dbit("importClubMemberships is idempotent, splits created/updated, and reports missing accounts", async () => {
    const a = await newMember("imp-a");
    const b = await newMember("imp-b");
    const ghost = `zz-m3-missing-${randomUUID()}@iitjammu.ac.in`;
    const csv = `email,role\n${a.email},Member\n${b.email},Volunteer\n${ghost},Member\nnot-an-email`;

    const r1 = await memberships.importClubMemberships({ orgUnitLineageKey: lineageA, csv }, actor);
    expect(r1.summary.created).toBe(2);
    expect(r1.summary.missing).toBe(1);
    expect(r1.missing[0].email).toBe(ghost);
    expect(r1.summary.failed).toBe(1); // the bad-email line

    // re-run → idempotent (now updates, creates nothing new)
    const r2 = await memberships.importClubMemberships({ orgUnitLineageKey: lineageA, csv }, actor);
    expect(r2.summary.created).toBe(0);
    expect(r2.summary.updated).toBe(2);
    // still exactly one row per member
    expect(await prismaBase.clubMembership.count({ where: { userId: a.id, orgUnitLineageKey: lineageA } })).toBe(1);
    // one audit summary row per import run
    const auditRows = await prismaBase.auditLog.count({ where: { entityType: "club_membership", entityId: null, createdAt: { gte: startedAt } } });
    expect(auditRows).toBeGreaterThanOrEqual(2);
  });

  dbit("importClubMemberships re-sync is NON-destructive: keeps a manually-set role + status (B5)", async () => {
    const u = await newMember("imp-nd");
    // seed via the importer as active + role "Member"
    const s1 = await memberships.importClubMemberships({ orgUnitLineageKey: lineageA, csv: `email,role\n${u.email},Member` }, actor);
    expect(s1.summary.created).toBe(1);
    // an admin manually promotes to "Captain" AND deactivates this member
    await memberships.addMembership({ userId: u.id, orgUnitLineageKey: lineageA, role: "Captain", status: "inactive" }, actor);
    // re-import the roster WITHOUT a role for this member (email only) — must NOT clobber
    await memberships.importClubMemberships({ orgUnitLineageKey: lineageA, csv: `email,role\n${u.email}` }, actor);
    const row = await prismaBase.clubMembership.findUnique({
      where: { userId_orgUnitLineageKey: { userId: u.id, orgUnitLineageKey: lineageA } },
      select: { role: true, status: true },
    });
    expect(row.role).toBe("Captain"); // role NOT wiped by the re-import
    expect(row.status).toBe("inactive"); // NOT silently reactivated
  });

  dbit("club_doc: create → publish → appears in listClubDocs; unpublish hides it", async () => {
    const { item } = await content.createDraft(
      { contentType: "club_doc", academicYearId: currentYear.id, orgUnitId: unitA.id, slug: `zz-m3-doc-${randomUUID().slice(0, 8)}`, title: "Club Charter", payload: { blockKind: "markdown", body: "# Charter\n\n- rule one\n- rule two" } },
      actor
    );
    createdItemIds.push(item.id);
    await content.publish(item.id, {}, actor);

    let docs = await docsPub.listClubDocs(unitA.id, { yearId: currentYear.id });
    expect(docs.some((d) => d.title === "Club Charter" && d.body.includes("rule one"))).toBe(true);

    await content.unpublish(item.id, actor);
    docs = await docsPub.listClubDocs(unitA.id, { yearId: currentYear.id });
    expect(docs.some((d) => d.id === item.id)).toBe(false);
  });

  dbit("club_doc create is SCOPED: the club-A coordinator can write A's docs, not club B's", async () => {
    const okDoc = await content.createDraft(
      { contentType: "club_doc", academicYearId: currentYear.id, orgUnitId: unitA.id, slug: `zz-m3-doc-a-${randomUUID().slice(0, 8)}`, title: "A doc", payload: { blockKind: "markdown", body: "hi" } },
      coordActor
    );
    createdItemIds.push(okDoc.item.id);
    expect(okDoc.item.orgUnitId).toBe(unitA.id);
    await expect(
      content.createDraft(
        { contentType: "club_doc", academicYearId: currentYear.id, orgUnitId: unitB.id, slug: `zz-m3-doc-b-${randomUUID().slice(0, 8)}`, title: "B doc", payload: { blockKind: "markdown", body: "no" } },
        coordActor
      )
    ).rejects.toMatchObject({ status: 403 });
  });

  dbit("club announcement: club-only by default; opting into sync surfaces it on the central board (DL-078)", async () => {
    const slug = `zz-m3-ann-${randomUUID().slice(0, 8)}`;
    const { item } = await content.createDraft(
      { contentType: "announcement", academicYearId: currentYear.id, orgUnitId: unitA.id, slug, title: "Club-only notice", payload: { body: "hello club", audience: "public", syncToCentral: false } },
      actor
    );
    createdItemIds.push(item.id);
    await content.publish(item.id, {}, actor);

    const clubList = await eventsPub.listClubAnnouncements(unitA.id, { yearId: currentYear.id });
    expect(clubList.some((a) => a.id === item.id)).toBe(true);
    let central = await eventsPub.listPublicAnnouncements({ currentYearId: currentYear.id });
    expect(central.some((a) => a.id === item.id)).toBe(false); // club-only → NOT central

    // opt into the central sync + republish
    await content.editDraft(item.id, { payload: { syncToCentral: true } }, actor);
    await content.publish(item.id, {}, actor);
    central = await eventsPub.listPublicAnnouncements({ currentYearId: currentYear.id });
    expect(central.some((a) => a.id === item.id)).toBe(true); // now on the central board
  });

  dbit("club events read + getClubPageView aggregates the expanded tabs", async () => {
    const future = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const { item } = await content.createDraft(
      { contentType: "event", academicYearId: currentYear.id, orgUnitId: unitA.id, slug: `zz-m3-ev-${randomUUID().slice(0, 8)}`, title: "Club Hackathon", payload: { body: "come", eventDate: future, audience: "public" } },
      actor
    );
    createdItemIds.push(item.id);
    await content.publish(item.id, {}, actor);

    const evs = await eventsPub.listClubEvents(unitA.id, { yearId: currentYear.id });
    expect(evs.some((e) => e.id === item.id)).toBe(true);

    const view = await orgPub.getClubPageView(unitA.slug, { yearId: currentYear.id });
    expect(view).toBeTruthy();
    expect(view.expanded).toBe(true);
    expect(view.unit.lineageKey).toBe(lineageA);
    expect(view.events.upcoming.some((e) => e.id === item.id)).toBe(true);
    expect(typeof view.memberCount).toBe("number");
  });

  dbit("a hostel/mess (non-expanded) getClubPageView returns the base view with empty tabs", async () => {
    // reuse club A's slug via a mess unit would need a mess fixture; instead assert the
    // shape contract directly on a fresh mess-type unit.
    const messType = await prismaBase.orgUnitType.findUnique({ where: { key: "mess" } });
    const lineage = await prismaBase.orgUnitLineage.create({ data: { canonicalName: "ZZ M3 Mess", firstSeenYearId: currentYear.id } });
    const mess = await prismaBase.orgUnit.create({
      data: { academicYearId: currentYear.id, orgUnitTypeId: messType.id, lineageKey: lineage.lineageKey, slug: `zz-m3-mess-${randomUUID().slice(0, 8)}`, name: "ZZ M3 Mess", status: "published" },
    });
    createdUnitIds.push(mess.id);
    createdLineages.push(lineage.lineageKey);
    const view = await orgPub.getClubPageView(mess.slug, { yearId: currentYear.id });
    expect(view.expanded).toBe(false);
    expect(view.docs).toEqual([]);
    expect(view.events).toEqual({ past: [], upcoming: [] });
  });
});
