// Live-DB integration tests for the Session-5 Organization model against the
// seeded Neon database. Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set,
// so the default `npm test` stays green. Run with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/org.db.test.mjs
//
// Exercises (all in a throwaway 2089-90 year, removed in afterAll via the
// audit-bypassing base client):
//   1. org-unit create happy path + org_unit_hierarchy_guard rejection.
//   2. appointment_type_guard (wrong unit type) + cardinality (singleton vs
//      multi-holder) guards, surfaced as friendly mapped errors.
//   3. the idempotent importer (a small ZZ-named plan) — second run creates 0.
//   4. a public org read (profile payload + roster) through lib/org/public.mjs.
//
// All people/units/lineages created here are ZZ-prefixed so cleanup is bounded
// and never touches real directory rows.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
// Generous ceiling: the importer makes many sequential audited service calls and
// Neon has high per-round-trip latency (each create ≈ an interactive tx +
// post-commit audit ≈ 10-15s on a cold/remote compute). The TINY_PLAN below is
// deliberately minimal so two full import runs fit this budget; the full V1
// dataset (run via `npm run db:import:org`) is exercised by the static plan test.
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

let prisma, prismaBase, units, appts, importMod, pub;
let actor, dev;
let typeIds = {}, posIds = {};
let yearId;

const YEAR_LABEL = "2089-90";
const created = { lineages: [] };

const TINY_PLAN = {
  councils: [
    {
      key: "zz",
      name: "ZZ Import Council",
      slug: "zz-import-council",
      secretary: { name: "ZZ Sec", titleOverride: "ZZ Secretary", photo: null, positionKey: "council_secretary" },
      clubs: [
        {
          name: "ZZ Import Club",
          slug: "zz-import-club",
          instagram: "https://example.com/zz",
          logo: null,
          vision: "ZZ club vision",
          mission: ["Do ZZ things", "Do more ZZ things"],
          pic: { name: "Dr. ZZ Pic", profileUrl: "https://example.com/pic", photo: null, positionKey: "pic" },
          coordinators: [
            { name: "ZZ Coord One", photo: null, role: null, positionKey: "coordinator" },
            { name: "ZZ Coord Two", photo: null, role: null, positionKey: "coordinator" },
          ],
        },
      ],
    },
  ],
  // Hostels omitted from the LIVE fixture for speed (the hostel position mappings
  // are covered by the static plan test); the mess keeps a single committee member
  // so the @db.Time mealTimings round-trip is still exercised end-to-end.
  hostels: [],
  messes: [
    {
      name: "ZZ Import Mess",
      slug: "zz-import-mess",
      location: "ZZ Block",
      capacity: 100,
      image: null,
      mealTimings: [{ meal: "breakfast", startTime: "07:00:00", endTime: "09:00:00", wrapsMidnight: false, sortOrder: 0 }],
    },
  ],
  messCommittee: [{ name: "ZZ Mess Sec", titleOverride: "Mess Secretary", positionKey: "mess_secretary", photo: null }],
  hostelInfraPdf: null,
  messInfraPdf: null,
};

async function load() {
  const p = await import("../lib/prisma.mjs");
  prisma = p.prisma;
  prismaBase = p.prismaBase;
  units = await import("../lib/org/units.mjs");
  appts = await import("../lib/org/appointments.mjs");
  importMod = await import("../lib/org/import.mjs");
  pub = await import("../lib/org/public.mjs");
}

// Fully remove a throwaway year and everything scoped to it (RESTRICT-aware
// order). Used by BOTH afterAll AND beforeAll (to self-heal a year left behind by
// a prior interrupted run, so the suite is re-runnable). Best-effort.
async function teardownYear(yId) {
  if (!yId) return;
  await prismaBase.academicYear.update({ where: { id: yId }, data: { status: "active" } }).catch(() => {});
  const yearAppts = await prismaBase.appointment.findMany({ where: { academicYearId: yId }, select: { personId: true } }).catch(() => []);
  const personIds = [...new Set(yearAppts.map((a) => a.personId))];
  await prismaBase.auditLog.deleteMany({ where: { academicYearId: yId } }).catch(() => {});
  if (personIds.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: personIds } } }).catch(() => {});
  await prismaBase.contentItem.deleteMany({ where: { academicYearId: yId } }).catch(() => {});
  await prismaBase.appointment.deleteMany({ where: { academicYearId: yId } }).catch(() => {});
  await prismaBase.orgUnit.updateMany({ where: { academicYearId: yId }, data: { parentId: null } }).catch(() => {});
  const yearUnits = await prismaBase.orgUnit.findMany({ where: { academicYearId: yId }, select: { lineageKey: true } }).catch(() => []);
  const lineageKeys = [...new Set([...created.lineages, ...yearUnits.map((u) => u.lineageKey)])];
  await prismaBase.orgUnit.deleteMany({ where: { academicYearId: yId } }).catch(() => {});
  if (lineageKeys.length) await prismaBase.orgUnitLineage.deleteMany({ where: { lineageKey: { in: lineageKeys } } }).catch(() => {});
  await prismaBase.academicYear.delete({ where: { id: yId } }).catch(() => {});
}

// Delete every ZZ-prefixed straggler (people + orphaned lineages) so the import
// test's create/reuse counts are exact regardless of prior partial runs.
async function purgeStrays() {
  for (const p of ["ZZ ", "Dr. ZZ", "Mr. ZZ", "Ms. ZZ"]) {
    await prismaBase.person.deleteMany({ where: { fullName: { startsWith: p } } }).catch(() => {});
  }
  await prismaBase.orgUnitLineage.deleteMany({ where: { canonicalName: { startsWith: "ZZ " } } }).catch(() => {});
}

describe.skipIf(!RUN)("Organization model (live Neon)", () => {
  beforeAll(async () => {
    await load();
    for (let i = 1; i <= 12; i++) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    dev = await prisma.user.findFirst({ where: { isDeveloper: true } });
    actor = { userId: dev.id };
    for (const k of ["council", "club", "hostel", "mess"]) {
      typeIds[k] = (await prisma.orgUnitType.findUniqueOrThrow({ where: { key: k } })).id;
    }
    for (const k of ["council_secretary", "pic", "coordinator", "warden"]) {
      posIds[k] = (await prisma.position.findUniqueOrThrow({ where: { key: k } })).id;
    }

    // Self-heal: a prior interrupted run may have left the throwaway year / ZZ
    // rows behind (the year label is UNIQUE), which would otherwise block create.
    const stale = await prismaBase.academicYear.findUnique({ where: { label: YEAR_LABEL }, select: { id: true } }).catch(() => null);
    if (stale) await teardownYear(stale.id);
    await purgeStrays();

    const y = await prismaBase.academicYear.create({
      data: { label: YEAR_LABEL, startDate: new Date("2089-07-01"), endDate: new Date("2090-06-30"), status: "active", isCurrent: false },
    });
    yearId = y.id;
  }, 120000);

  afterAll(async () => {
    if (!prismaBase || !yearId) return;
    await teardownYear(yearId);
    await purgeStrays();
    await prisma.$disconnect();
  }, 120000);

  dbit("creates org units and rejects a disallowed parent (org_unit_hierarchy_guard → ORG_HIERARCHY)", async () => {
    const council = await units.createOrgUnit({ academicYearId: yearId, typeKey: "council", slug: "zz-guard-council", name: "ZZ Guard Council", status: "published" }, actor);
    created.lineages.push(council.unit.lineageKey);
    expect(council.unit.id).toBeTruthy();

    // a club under the council is allowed (council → club edge)
    const club = await units.createOrgUnit({ academicYearId: yearId, typeKey: "club", slug: "zz-guard-club", name: "ZZ Guard Club", parentId: council.unit.id, status: "published" }, actor);
    created.lineages.push(club.unit.lineageKey);
    expect(club.unit.parentId).toBe(council.unit.id);

    // a hostel (root) cannot parent a club (no allowed-child edge) → friendly error
    const hostel = await units.createOrgUnit({ academicYearId: yearId, typeKey: "hostel", slug: "zz-guard-hostel", name: "ZZ Guard Hostel", status: "published" }, actor);
    created.lineages.push(hostel.unit.lineageKey);
    await expect(
      units.createOrgUnit({ academicYearId: yearId, typeKey: "club", slug: "zz-bad-club", name: "ZZ Bad Club", parentId: hostel.unit.id }, actor)
    ).rejects.toMatchObject({ code: "ORG_HIERARCHY", status: 409 });
  });

  dbit("appointment type + cardinality guards (singleton vs multi-holder)", async () => {
    const council = await prisma.orgUnit.findFirstOrThrow({ where: { academicYearId: yearId, slug: "zz-guard-council" } });
    const club = await prisma.orgUnit.findFirstOrThrow({ where: { academicYearId: yearId, slug: "zz-guard-club" } });

    const p1 = await prismaBase.person.create({ data: { fullName: "ZZ Guard P1", personType: "student" } });
    const p2 = await prismaBase.person.create({ data: { fullName: "ZZ Guard P2", personType: "student" } });

    // singleton: one council secretary is fine, a second (different person) is rejected
    const a1 = await appts.createAppointment({ orgUnitId: council.id, positionId: posIds.council_secretary, personId: p1.id, status: "published" }, actor);
    expect(a1.appointment.isSingleton).toBe(true);
    await expect(
      appts.createAppointment({ orgUnitId: council.id, positionId: posIds.council_secretary, personId: p2.id, status: "published" }, actor)
    ).rejects.toMatchObject({ status: 409 });

    // wrong unit type: a warden (hostel position) cannot be appointed to a club
    await expect(
      appts.createAppointment({ orgUnitId: club.id, positionId: posIds.warden, personId: p1.id }, actor)
    ).rejects.toMatchObject({ code: "APPOINTMENT_TYPE", status: 409 });

    // multi-holder: two coordinators on the same club both succeed
    const c1 = await appts.createAppointment({ orgUnitId: club.id, positionId: posIds.coordinator, personId: p1.id, status: "published" }, actor);
    const c2 = await appts.createAppointment({ orgUnitId: club.id, positionId: posIds.coordinator, personId: p2.id, status: "published" }, actor);
    expect(c1.appointment.isSingleton).toBe(false);
    expect(c2.appointment.id).toBeTruthy();
    expect(await prisma.appointment.count({ where: { orgUnitId: club.id, positionId: posIds.coordinator, archivedAt: null } })).toBe(2);
  });

  dbit("importer is idempotent: first run creates, second run creates nothing", async () => {
    const first = await importMod.importOrgData({ academicYearId: yearId, plan: TINY_PLAN, withMedia: false }, actor);
    expect(first.counts.orgUnits.created).toBe(3); // council + club + mess
    expect(first.counts.content.created).toBe(3); // one profile per unit
    expect(first.counts.appointments.created).toBe(5); // 1 sec + 1 pic + 2 coord + 1 mess-sec
    expect(first.counts.people.created).toBe(5);

    const second = await importMod.importOrgData({ academicYearId: yearId, plan: TINY_PLAN, withMedia: false }, actor);
    expect(second.counts.orgUnits.created).toBe(0);
    expect(second.counts.content.created).toBe(0);
    expect(second.counts.appointments.created).toBe(0);
    expect(second.counts.people.created).toBe(0);
    expect(second.counts.orgUnits.skipped).toBe(3);
    expect(second.counts.appointments.skipped).toBe(5);

    // the club sits under its council; the mess committee landed on the mess unit
    const club = await prisma.orgUnit.findFirstOrThrow({ where: { academicYearId: yearId, slug: "zz-import-club" } });
    const council = await prisma.orgUnit.findFirstOrThrow({ where: { academicYearId: yearId, slug: "zz-import-council" } });
    expect(club.parentId).toBe(council.id);
    const mess = await prisma.orgUnit.findFirstOrThrow({ where: { academicYearId: yearId, slug: "zz-import-mess" } });
    expect(await prisma.appointment.count({ where: { orgUnitId: mess.id, academicYearId: yearId } })).toBe(1);
  });

  dbit("public org read returns the published unit with its profile + roster", async () => {
    const view = await pub.getPublicOrgUnit("zz-import-club", { yearId });
    expect(view).toBeTruthy();
    expect(view.unit.typeKey).toBe("club");
    expect(view.profile.payload.vision).toBe("ZZ club vision");
    expect(view.profile.payload.missionPoints).toHaveLength(2);
    expect(view.profile.payload.instagramUrl).toBe("https://example.com/zz");
    // roster: a lead PIC + two coordinators, all published
    expect(view.roster.length).toBe(3);
    expect(view.roster.some((m) => m.positionKey === "pic" && m.isLead)).toBe(true);
    expect(view.roster.filter((m) => m.positionKey === "coordinator")).toHaveLength(2);

    // council view exposes its published child club
    const councilView = await pub.getPublicOrgUnit("zz-import-council", { yearId });
    expect(councilView.children.map((c) => c.unit.slug)).toContain("zz-import-club");

    // structure helper groups clubs under councils for the chosen year
    const structure = await pub.getPublicOrgStructure({ yearId });
    const zz = structure.find((s) => s.council.slug === "zz-import-council");
    expect(zz.clubs.map((c) => c.unit.slug)).toContain("zz-import-club");

    // a draft-only import would be invisible; assert the mess profile is public too
    const messView = await pub.getPublicOrgUnit("zz-import-mess", { yearId });
    expect(messView.profile.payload.capacity).toBe(100);
    expect(messView.profile.payload.mealTimings).toHaveLength(1);
  });
});
