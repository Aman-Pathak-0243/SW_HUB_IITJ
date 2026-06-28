// Live DB smoke test against the seeded Neon database. Read-only. Self-skips
// unless RUN_DB_TESTS=1 and DATABASE_URL is set, so the default `npm test`
// (and CI without DB creds) stays green. Run with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/db.smoke.test.mjs
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { PERMISSIONS } from "../lib/rbac/permissions.mjs";
import { CONTENT_TYPE_DEFS } from "../lib/cms/content-types.mjs";
import { ORG_UNIT_TYPES, POSITIONS, ALLOWED_CHILD_EDGES } from "../lib/org/structure.mjs";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;

let prisma;
async function db() {
  if (!prisma) {
    const mod = await import("../lib/prisma.mjs");
    prisma = mod.prisma;
  }
  return prisma;
}

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
});

describe.skipIf(!RUN)("DB smoke (seeded Neon)", () => {
  beforeAll(async () => {
    // Wake the Neon compute (auto-suspend) before assertions.
    const p = await db();
    for (let i = 1; i <= 12; i++) {
      try {
        await p.$queryRaw`SELECT 1`;
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }, 90000);

  it("has the current academic year 2025-26 (active, is_current)", async () => {
    const p = await db();
    const year = await p.academicYear.findUnique({ where: { label: "2025-26" } });
    expect(year).toBeTruthy();
    expect(year.isCurrent).toBe(true);
    expect(year.status).toBe("active");
    const currentCount = await p.academicYear.count({ where: { isCurrent: true } });
    expect(currentCount).toBe(1);
  });

  it("seeded the full permission catalog and roles", async () => {
    const p = await db();
    expect(await p.permission.count()).toBe(PERMISSIONS.length);
    const dev = await p.role.findUnique({ where: { key: "developer" } });
    expect(dev.grantsAll).toBe(true);
    expect(dev.isSystem).toBe(true);
    const superAdmin = await p.role.findUnique({
      where: { key: "super_admin" },
      include: { rolePermissions: true },
    });
    expect(superAdmin.rolePermissions.length).toBe(PERMISSIONS.length);
  });

  it("seeded org types, allowed edges, positions and content types", async () => {
    const p = await db();
    expect(await p.orgUnitType.count()).toBe(ORG_UNIT_TYPES.length);
    expect(await p.orgUnitTypeAllowedChild.count()).toBe(ALLOWED_CHILD_EDGES.length);
    expect(await p.position.count()).toBe(POSITIONS.length);
    expect(await p.contentTypeDef.count()).toBe(CONTENT_TYPE_DEFS.length);
  });

  it("resolves developer permissions as grantsAll (live engine)", async () => {
    const p = await db();
    const { getEffectivePermissions } = await import("../lib/rbac/authorize.mjs");
    const devUser = await p.user.findFirst({ where: { isDeveloper: true } });
    expect(devUser).toBeTruthy();
    const resolved = await getEffectivePermissions(devUser.id);
    expect(resolved.grantsAll).toBe(true);
  });

  it("created the raw-SQL trigger functions in the database", async () => {
    const p = await db();
    const rows = await p.$queryRawUnsafe(
      `SELECT proname FROM pg_proc WHERE proname = ANY($1)`,
      [
        "lock_guard",
        "appointment_type_guard",
        "appointment_cardinality_guard",
        "content_item_pointer_guard",
        "person_email_link_guard",
      ]
    );
    expect(rows.length).toBe(5);
  });

  it("created the partial / NULLS-NOT-DISTINCT unique indexes", async () => {
    const p = await db();
    const expected = [
      "academic_year_one_current_uq",
      "role_assignment_unique_active_grant_uq",
      "content_item_slug_uq",
      "content_revision_one_draft_uq",
      "content_media_one_primary_hero_uq",
    ];
    const rows = await p.$queryRawUnsafe(
      `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname = ANY($1)`,
      expected
    );
    expect(rows.length).toBe(expected.length);
  });

  // Generous tx timeout so the DB CONSTRAINT (not a Prisma tx timeout) is what
  // rejects on a cold Neon compute. Assert the specific constraint to avoid a
  // timeout-driven false positive.
  const TX_OPTS = { timeout: 20000, maxWait: 15000 };

  it("DB-enforces singleton-position cardinality (a second secretary is rejected)", async () => {
    const p = await db();
    const suffix = `${Date.now()}`;
    const run = p.$transaction(async (tx) => {
      const year = await tx.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
      const clubType = await tx.orgUnitType.findUniqueOrThrow({ where: { key: "club" } });
      const secretary = await tx.position.findUniqueOrThrow({ where: { key: "secretary" } });
      const lineage = await tx.orgUnitLineage.create({ data: { canonicalName: "ZZ Test Club" } });
      const unit = await tx.orgUnit.create({
        data: { academicYearId: year.id, orgUnitTypeId: clubType.id, lineageKey: lineage.lineageKey, slug: `zz-card-${suffix}`, name: "ZZ Test Club" },
      });
      const a = await tx.person.create({ data: { fullName: "ZZ A", personType: "student" } });
      const b = await tx.person.create({ data: { fullName: "ZZ B", personType: "student" } });
      await tx.appointment.create({ data: { academicYearId: year.id, orgUnitId: unit.id, positionId: secretary.id, personId: a.id } });
      // second different person in a max_holders=1 position must be rejected
      await tx.appointment.create({ data: { academicYearId: year.id, orgUnitId: unit.id, positionId: secretary.id, personId: b.id } });
    }, TX_OPTS);
    // P2002 unique-constraint failure on appointment_singleton_position_uq
    await expect(run).rejects.toThrow(/singleton|unique constraint/i);
  });

  it("DB-enforces the org_unit allowed-child hierarchy (club-under-club is rejected)", async () => {
    const p = await db();
    const suffix = `${Date.now()}`;
    const run = p.$transaction(async (tx) => {
      const year = await tx.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
      const clubType = await tx.orgUnitType.findUniqueOrThrow({ where: { key: "club" } });
      const l1 = await tx.orgUnitLineage.create({ data: {} });
      const l2 = await tx.orgUnitLineage.create({ data: {} });
      const parent = await tx.orgUnit.create({
        data: { academicYearId: year.id, orgUnitTypeId: clubType.id, lineageKey: l1.lineageKey, slug: `zz-par-${suffix}`, name: "ZZ Parent" },
      });
      // club parented under a club is not an allowed-child edge -> rejected
      await tx.orgUnit.create({
        data: { academicYearId: year.id, orgUnitTypeId: clubType.id, lineageKey: l2.lineageKey, slug: `zz-chi-${suffix}`, name: "ZZ Child", parentId: parent.id },
      });
    }, TX_OPTS);
    await expect(run).rejects.toThrow(/allowed-child|hierarchy/i);
  });
});
