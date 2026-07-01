// Live-DB integration tests for Session-11 / M4 — Wall of Fame (student achievements).
// Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set. Run isolated (KNOWN_ISSUES
// #39) with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/m4.db.test.mjs
//
// Fixtures (all zz-m4-* / created via prismaBase or the real services, cleaned in
// afterAll via the audit-bypassing base client): a throwaway published CLUB in the
// current year, a coordinator SCOPED to that club (proving the achievement is CENTRAL,
// not unit-scoped — DL-082), and throwaway member accounts. Asserts: achievement
// create (hybrid blocks) → publish → appears in listWallOfFame with blocks round-tripped;
// block validation rejects a bad block (422); markdown is stored RAW; setAchievementCredits
// (member + club) + the one-target rule + the club slice + getClubPageView Achievements
// tab; the central-vs-scoped authority; unpublish hides.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

let prismaBase, content, users, credits, wall, orgPub;
let dev, actor, currentYear, clubType;
let club, clubLineage, coordUser, coordActor, member;
const startedAt = new Date();
const createdUserIds = [];
const createdItemIds = [];
const createdUnitIds = [];
const createdLineages = [];
const createdAssignmentIds = [];

const mkEmail = (t) => `zz-m4-${t}-${randomUUID()}@iitjammu.ac.in`;

async function load() {
  const p = await import("../lib/prisma.mjs");
  prismaBase = p.prismaBase;
  content = await import("../lib/cms/content.mjs");
  users = await import("../lib/users/admin.mjs");
  credits = await import("../lib/achievements/credits.mjs");
  wall = await import("../lib/achievements/public.mjs");
  orgPub = await import("../lib/org/public.mjs");
}

async function makeClub(name) {
  const lineage = await prismaBase.orgUnitLineage.create({ data: { canonicalName: name, firstSeenYearId: currentYear.id } });
  const unit = await prismaBase.orgUnit.create({
    data: { academicYearId: currentYear.id, orgUnitTypeId: clubType.id, lineageKey: lineage.lineageKey, slug: `zz-m4-${randomUUID().slice(0, 8)}`, name, status: "published" },
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

// Create + publish an achievement, tracking the item id for cleanup. Returns the item.
async function makeAchievement(payload, { title = "ZZ Achievement", slug } = {}) {
  const { item } = await content.createDraft(
    { contentType: "achievement", academicYearId: currentYear.id, slug: slug ?? `zz-m4-ach-${randomUUID().slice(0, 8)}`, title, payload },
    actor
  );
  createdItemIds.push(item.id);
  await content.publish(item.id, {}, actor);
  return item;
}

async function teardown() {
  if (!prismaBase) return;
  // credits cascade with the content_item; delete items first.
  for (const id of createdItemIds) await prismaBase.contentItem.delete({ where: { id } }).catch(() => {});
  for (const id of createdUserIds) await prismaBase.user.delete({ where: { id } }).catch(() => {});
  for (const id of createdUnitIds) await prismaBase.orgUnit.delete({ where: { id } }).catch(() => {});
  for (const key of createdLineages) await prismaBase.orgUnitLineage.delete({ where: { lineageKey: key } }).catch(() => {});
  await prismaBase.auditLog.deleteMany({ where: { entityType: "achievement_credit", createdAt: { gte: startedAt } } }).catch(() => {});
  if (createdAssignmentIds.length) await prismaBase.auditLog.deleteMany({ where: { entityType: "role_assignment", entityId: { in: createdAssignmentIds } } }).catch(() => {});
  const ids = [...createdItemIds, ...createdUserIds];
  if (ids.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: ids } } }).catch(() => {});
}

describe.skipIf(!RUN)("Member platform M4 — Wall of Fame (live Neon)", () => {
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

    ({ unit: club, lineageKey: clubLineage } = await makeClub("ZZ M4 Club"));

    // A coordinator scoped to the club — proves achievements are CENTRAL (this grant
    // does NOT authorize an institute-level achievement's credits, DL-082).
    coordUser = await newMember("coord");
    const coordinator = await prismaBase.role.findUnique({ where: { key: "coordinator" } });
    await users.grantRole({ userId: coordUser.id, roleId: coordinator.id, orgUnitLineageKey: clubLineage, academicYearId: currentYear.id }, actor);
    const g = await prismaBase.roleAssignment.findFirst({ where: { userId: coordUser.id, roleId: coordinator.id }, select: { id: true } });
    if (g) createdAssignmentIds.push(g.id);
    coordActor = { userId: coordUser.id };

    member = await newMember("m");
  }, 180000);

  afterAll(async () => {
    await teardown();
    if (prismaBase) await prismaBase.$disconnect();
  }, 120000);

  dbit("create (hybrid blocks) → publish → appears in listWallOfFame with blocks round-tripped", async () => {
    const item = await makeAchievement(
      {
        category: "Hackathon",
        achievementDate: new Date("2026-03-15"),
        blocks: [
          { kind: "markdown", body: "# We won!\n\n- first place\n- national level" },
          { kind: "link", url: "https://example.org/results", label: "Results" },
        ],
      },
      { title: "Smart India Hackathon Win", slug: `zz-m4-sih-${randomUUID().slice(0, 8)}` }
    );

    const wallList = await wall.listWallOfFame({ yearId: currentYear.id });
    const found = wallList.find((a) => a.id === item.id);
    expect(found, "published achievement should be on the wall").toBeTruthy();
    expect(found.category).toBe("Hackathon");
    expect(found.title).toBe("Smart India Hackathon Win");
    // blocks resolved for presentation; markdown + link both survive.
    expect(found.blocks.some((b) => b.kind === "markdown" && b.body.includes("We won"))).toBe(true);
    expect(found.blocks.some((b) => b.kind === "link" && b.url === "https://example.org/results")).toBe(true);

    await content.unpublish(item.id, actor);
    const after = await wall.listWallOfFame({ yearId: currentYear.id });
    expect(after.some((a) => a.id === item.id)).toBe(false); // unpublish hides it
  });

  dbit("block validation rejects a malformed block with a 422 (banner without media)", async () => {
    await expect(
      content.createDraft(
        { contentType: "achievement", academicYearId: currentYear.id, slug: `zz-m4-bad-${randomUUID().slice(0, 8)}`, title: "Bad", payload: { blocks: [{ kind: "banner" }] } },
        actor
      )
    ).rejects.toMatchObject({ status: 422 });
    // an unsafe link url is rejected too (reuses isSafeHref, DL-077)
    await expect(
      content.createDraft(
        { contentType: "achievement", academicYearId: currentYear.id, slug: `zz-m4-js-${randomUUID().slice(0, 8)}`, title: "JS", payload: { blocks: [{ kind: "link", url: "javascript:alert(1)" }] } },
        actor
      )
    ).rejects.toMatchObject({ status: 422 });
  });

  dbit("setAchievementCredits maps a member + a club; the one-target rule + unknown targets are rejected", async () => {
    const item = await makeAchievement({ category: "Sports", blocks: [{ kind: "markdown", body: "champions" }] });

    const { credits: saved } = await credits.setAchievementCredits(
      item.id,
      [
        { userId: member.id, role: "Captain" },
        { orgUnitLineageKey: clubLineage, role: "Organizing club" },
      ],
      actor
    );
    expect(saved.length).toBe(2);
    expect(saved.some((c) => c.kind === "user" && c.userId === member.id && c.role === "Captain")).toBe(true);
    expect(saved.some((c) => c.kind === "club" && c.orgUnitLineageKey === clubLineage)).toBe(true);

    // idempotent replace: setting again with just the club leaves ONE credit.
    const { credits: replaced } = await credits.setAchievementCredits(item.id, [{ orgUnitLineageKey: clubLineage }], actor);
    expect(replaced.length).toBe(1);
    const dbCount = await prismaBase.achievementCredit.count({ where: { achievementItemId: item.id } });
    expect(dbCount).toBe(1);

    // a credit targeting BOTH a member and a club → 422 (one-target rule, DL-081).
    await expect(credits.setAchievementCredits(item.id, [{ userId: member.id, orgUnitLineageKey: clubLineage }], actor)).rejects.toMatchObject({ status: 422 });
    // an email with no account → 422 (never auto-created).
    await expect(credits.setAchievementCredits(item.id, [{ email: `zz-m4-ghost-${randomUUID()}@iitjammu.ac.in` }], actor)).rejects.toMatchObject({ status: 422 });
  });

  dbit("credits are CENTRAL: the club coordinator cannot set an institute achievement's credits (DL-082)", async () => {
    const item = await makeAchievement({ blocks: [{ kind: "markdown", body: "x" }] });
    // coordinator has content.* scoped to the club lineage, but the achievement is NOT
    // org-bound → the unscoped content.update is required → 403.
    await expect(credits.setAchievementCredits(item.id, [{ orgUnitLineageKey: clubLineage }], coordActor)).rejects.toMatchObject({ status: 403 });
    // unauthenticated → 401
    await expect(credits.setAchievementCredits(item.id, [{ orgUnitLineageKey: clubLineage }], {})).rejects.toMatchObject({ status: 401 });
  });

  dbit("the per-club slice + getClubPageView Achievements tab surface a club-credited achievement", async () => {
    const item = await makeAchievement({ category: "Cultural", blocks: [{ kind: "markdown", body: "best fest" }] }, { title: "Fest Winner" });
    await credits.setAchievementCredits(item.id, [{ orgUnitLineageKey: clubLineage, role: "Host" }, { userId: member.id, role: "Lead" }], actor);

    const slice = await wall.listClubAchievements(clubLineage, { yearId: currentYear.id });
    expect(slice.some((a) => a.id === item.id && a.title === "Fest Winner")).toBe(true);

    const view = await orgPub.getClubPageView(club.slug, { yearId: currentYear.id });
    expect(view.expanded).toBe(true);
    expect(Array.isArray(view.achievements)).toBe(true);
    const shown = view.achievements.find((a) => a.id === item.id);
    expect(shown).toBeTruthy();
    // PII minimization (DL-082, review-confirmed): the PUBLIC club view is serialized to
    // an anonymous browser (client OrgUnitTabs), so a credited member appears by display
    // NAME only — the internal app_user uuid must NOT be present on the public shape.
    const memberCredit = shown.credits.members.find((m) => m.name === member.name);
    expect(memberCredit, "member credit should surface by name").toBeTruthy();
    expect(memberCredit.userId, "public member credit must NOT expose the app_user id").toBeUndefined();
    expect(shown.credits.clubs.some((c) => c.orgUnitLineageKey === clubLineage)).toBe(true);

    // one semantic audit summary row per setAchievementCredits call (cross-stakeholder).
    const auditRows = await prismaBase.auditLog.count({ where: { entityType: "achievement_credit", entityId: item.id, createdAt: { gte: startedAt } } });
    expect(auditRows).toBeGreaterThanOrEqual(1);
  });

  dbit("setAchievementCredits rejects a non-achievement content item (404/422)", async () => {
    // a plain announcement item is not an achievement → guarded.
    const { item } = await content.createDraft(
      { contentType: "announcement", academicYearId: currentYear.id, slug: `zz-m4-ann-${randomUUID().slice(0, 8)}`, title: "Ann", payload: { body: "hi", audience: "public" } },
      actor
    );
    createdItemIds.push(item.id);
    await expect(credits.setAchievementCredits(item.id, [{ orgUnitLineageKey: clubLineage }], actor)).rejects.toMatchObject({ status: 422 });
  });
});
