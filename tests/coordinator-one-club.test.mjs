// Verifies the "a coordinator maps to one club only" rule + email-based grant, exercised
// through the real grantRole/revokeRole services (what the admin Coordinators UI posts).
// Guarded by RUN_SIM (skipped by the normal suites). Run:
//   RUN_SIM=1 ./node_modules/.bin/dotenv -e .env.local -- ./node_modules/.bin/vitest run tests/coordinator-one-club.test.mjs --pool=forks --poolOptions.forks.singleFork
import { describe, it, expect, afterAll } from "vitest";
import prisma from "../lib/prisma.mjs";
import { getCurrentYearId } from "../lib/year/context.mjs";
import { createUser, grantRole, revokeRole } from "../lib/users/admin.mjs";

const RUN = process.env.RUN_SIM === "1" && !!process.env.DATABASE_URL;
afterAll(async () => { await prisma.$disconnect(); });

describe.skipIf(!RUN)("coordinator one-club rule", () => {
  it("enforces one coordinator club per person, resolves email, and allows move-after-revoke", async () => {
    const yearId = await getCurrentYearId();
    const dev = await prisma.user.findFirst({ where: { isDeveloper: true }, select: { id: true } });
    const actor = { userId: dev.id };
    const clubType = (await prisma.orgUnitType.findFirst({ where: { key: "club" } })) ?? (await prisma.orgUnitType.findFirst());

    async function ensureClub(slug, name) {
      const found = await prisma.orgUnit.findFirst({ where: { slug, academicYearId: yearId }, select: { id: true, lineageKey: true } });
      if (found) return found;
      const lin = await prisma.orgUnitLineage.create({ data: { canonicalName: name, firstSeenYearId: yearId } });
      return prisma.orgUnit.create({ data: { academicYearId: yearId, orgUnitTypeId: clubType.id, lineageKey: lin.lineageKey, slug, name, status: "published" }, select: { id: true, lineageKey: true } });
    }
    const A = await ensureClub("sim-oneclub-a", "Sim OneClub A");
    const B = await ensureClub("sim-oneclub-b", "Sim OneClub B");

    const email = "sim.oneclub@iitjammu.ac.in";
    let u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!u) { const { user } = await createUser({ email, name: "OneClub Tester", password: "SimEvent@2026", mustChangePassword: false, status: "active" }, actor); u = { id: user.id }; }
    // deterministic start
    await prisma.roleAssignment.deleteMany({ where: { userId: u.id, role: { key: "coordinator" }, academicYearId: yearId } });

    // 1) map as coordinator of club A BY EMAIL → created
    const g1 = await grantRole({ email, roleKey: "coordinator", orgUnitLineageKey: A.lineageKey, academicYearId: yearId }, actor);
    expect(g1.created).toBe(true);

    // 2) map the same person to club B → rejected by the one-club rule
    let code = null;
    try { await grantRole({ email, roleKey: "coordinator", orgUnitLineageKey: B.lineageKey, academicYearId: yearId }, actor); }
    catch (e) { code = e.code; }
    expect(code).toBe("COORDINATOR_ONE_CLUB");

    // 3) re-map to club A (same club) → idempotent, not a new grant
    const again = await grantRole({ email, roleKey: "coordinator", orgUnitLineageKey: A.lineageKey, academicYearId: yearId }, actor);
    expect(again.created).toBe(false);

    // 4) revoke A, then map to B → allowed (moved)
    await revokeRole(g1.assignment.id, actor);
    const g2 = await grantRole({ email, roleKey: "coordinator", orgUnitLineageKey: B.lineageKey, academicYearId: yearId }, actor);
    expect(g2.created).toBe(true);

    // cleanup this test's grants
    await prisma.roleAssignment.deleteMany({ where: { userId: u.id, role: { key: "coordinator" }, academicYearId: yearId } });
  }, 60000);
});
