// ROLE-BASED ACCESS MATRIX SIMULATION — one user per role, asserting what each CAN and
// CANNOT do across permissions, events, announcements/content, collaboration, participation,
// and admin-panel access. Exercises the real RBAC resolver + authz seams, so a failed
// assertion is a genuine allow/deny defect (or a stale expectation). Guarded by RUN_SIM.
//   RUN_SIM=1 ./node_modules/.bin/dotenv -e .env.local -- ./node_modules/.bin/vitest run tests/role-matrix.test.mjs --pool=forks --poolOptions.forks.singleFork
import { describe, it, expect, afterAll } from "vitest";
import { writeFileSync } from "node:fs";
import path from "node:path";
import prisma from "../lib/prisma.mjs";
import { getCurrentYearId } from "../lib/year/context.mjs";
import { createUser, grantRole } from "../lib/users/admin.mjs";
import { getEffectivePermissions, can } from "../lib/rbac/authorize.mjs";
import { canManageEvent } from "../lib/events/authz.mjs";
import { createDraft, publish } from "../lib/cms/content.mjs";
import { setEventOrganizers } from "../lib/events/organizers.mjs";
import { hasAnyAdminAccess } from "../lib/admin/nav.mjs";
import { canParticipate } from "../lib/auth/access.mjs";

const RUN = process.env.RUN_SIM === "1" && !!process.env.DATABASE_URL;
const OUT_DIR = process.env.SIM_OUT || process.cwd();
const PASSWORD = "SimEvent@2026";

const lines = [];
const log = (s = "") => { lines.push(s); console.log(s); };
const section = (t) => { log(""); log("─".repeat(78)); log(`  ${t}`); log("─".repeat(78)); };
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok }); log(`   [${ok ? "PASS" : "FAIL"}] ${name}${detail ? ` — ${detail}` : ""}`); };

afterAll(async () => {
  writeFileSync(path.join(OUT_DIR, "role-matrix-log.txt"), lines.join("\n") + "\n");
  await prisma.$disconnect();
});

describe.skipIf(!RUN)("role-based access matrix", () => {
  it("each role can do exactly what it should — and nothing it shouldn't", async () => {
    const yearId = await getCurrentYearId();
    const dev = await prisma.user.findFirst({ where: { isDeveloper: true }, select: { id: true } });
    const devActor = { userId: dev.id };
    const clubType = (await prisma.orgUnitType.findFirst({ where: { key: "club" } })) ?? (await prisma.orgUnitType.findFirst());
    const councilType = (await prisma.orgUnitType.findFirst({ where: { key: "council" } })) ?? clubType;

    async function ensureUnit(type, slug, name) {
      const found = await prisma.orgUnit.findFirst({ where: { slug, academicYearId: yearId }, select: { id: true, lineageKey: true } });
      if (found) return found;
      const lin = await prisma.orgUnitLineage.create({ data: { canonicalName: name, firstSeenYearId: yearId } });
      return prisma.orgUnit.create({ data: { academicYearId: yearId, orgUnitTypeId: type.id, lineageKey: lin.lineageKey, slug, name, status: "published" }, select: { id: true, lineageKey: true } });
    }
    const council = await ensureUnit(councilType, "sim-rm-council", "SIM RM Council");
    const clubA = await ensureUnit(clubType, "sim-rm-club-a", "SIM RM Club A");
    const clubB = await ensureUnit(clubType, "sim-rm-club-b", "SIM RM Club B");

    async function roleUser(key, roleKey, scope) {
      const email = `sim.rm.${key}@iitjammu.ac.in`;
      let u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (!u) { const { user } = await createUser({ email, name: `RM ${key}`, password: PASSWORD, mustChangePassword: false, status: "active" }, devActor); u = { id: user.id }; }
      if (roleKey) await grantRole({ userId: u.id, roleKey, orgUnitLineageKey: scope?.lineage ?? null, academicYearId: scope?.year ?? null }, devActor);
      return u.id;
    }

    const YEAR = yearId;
    const U = {
      developer: dev.id,
      super_admin: await roleUser("super", "super_admin", null),
      admin: await roleUser("admin", "admin", null),
      staff: await roleUser("staff", "staff", null),
      secretary: await roleUser("sec", "secretary", { lineage: council.lineageKey, year: YEAR }),
      coordinatorA: await roleUser("coordA", "coordinator", { lineage: clubA.lineageKey, year: YEAR }),
      coordinatorB: await roleUser("coordB", "coordinator", { lineage: clubB.lineageKey, year: YEAR }),
      co_coordinatorA: await roleUser("cocoA", "co_coordinator", { lineage: clubA.lineageKey, year: YEAR }),
      member: await roleUser("member", "normal_user", null),
    };

    const GLOBAL = {};
    const SA = { orgUnitLineageKey: clubA.lineageKey, academicYearId: YEAR };
    const SB = { orgUnitLineageKey: clubB.lineageKey, academicYearId: YEAR };
    const SC = { orgUnitLineageKey: council.lineageKey, academicYearId: YEAR };
    const scopeName = (s) => (s === GLOBAL || !s.orgUnitLineageKey ? "global" : s === SA ? "clubA" : s === SB ? "clubB" : s === SC ? "council" : "scope");

    const cap = async (role, scope, perm, expected) => {
      const resolved = await getEffectivePermissions(U[role], scope);
      const got = can(resolved, perm);
      check(`${role}: ${perm} @ ${scopeName(scope)} = ${expected}`, got === expected, got === expected ? "" : `got ${got}`);
    };

    // ── permissions ───────────────────────────────────────────────────────
    section("PERMISSIONS (RBAC resolver + scope)");
    // developer / super_admin — everything, everywhere
    await cap("developer", GLOBAL, "dev.console", true);
    await cap("developer", GLOBAL, "backup.create", true);
    await cap("super_admin", GLOBAL, "user.create", true);
    await cap("super_admin", GLOBAL, "dev.console", true);
    // admin — everything EXCEPT developer-only ops
    await cap("admin", GLOBAL, "user.create", true);
    await cap("admin", GLOBAL, "content.publish", true);
    await cap("admin", GLOBAL, "event.manage", true);
    await cap("admin", GLOBAL, "dev.console", false);
    await cap("admin", GLOBAL, "backup.create", false);
    await cap("admin", GLOBAL, "storage.manage", false);
    // staff — central content/announcements + event.manage; NOT user/role admin
    await cap("staff", GLOBAL, "content.publish", true);
    await cap("staff", GLOBAL, "event.manage", true);
    await cap("staff", GLOBAL, "feedback.read", true);
    await cap("staff", GLOBAL, "user.create", false);
    await cap("staff", GLOBAL, "appointment.create", false);
    // secretary (council-scoped) — powers only at its council scope
    await cap("secretary", GLOBAL, "content.publish", false);
    await cap("secretary", SC, "content.publish", true);
    await cap("secretary", SC, "event.manage", true);
    await cap("secretary", SC, "appointment.create", true);
    await cap("secretary", SC, "org_unit.update", true);
    await cap("secretary", SA, "content.publish", false); // council scope ≠ a club scope
    // coordinator A (club-scoped) — full lifecycle + event.manage at its club only
    await cap("coordinatorA", GLOBAL, "content.publish", false);
    await cap("coordinatorA", SA, "content.publish", true);
    await cap("coordinatorA", SA, "event.manage", true);
    await cap("coordinatorA", SA, "membership.manage", true);
    await cap("coordinatorA", SA, "appointment.create", false); // structure is secretary+
    await cap("coordinatorA", SB, "content.publish", false);    // not another club
    await cap("coordinatorA", SA, "user.create", false);
    // co-coordinator A — DRAFT only (no publish), no event.manage
    await cap("co_coordinatorA", SA, "content.create", true);
    await cap("co_coordinatorA", SA, "content.update", true);
    await cap("co_coordinatorA", SA, "content.publish", false);
    await cap("co_coordinatorA", SA, "event.manage", false);
    await cap("co_coordinatorA", GLOBAL, "content.create", false);
    // member — no back-office permission anywhere
    await cap("member", GLOBAL, "content.read", false);
    await cap("member", SA, "content.publish", false);
    await cap("member", GLOBAL, "event.manage", false);

    // ── events + collaboration ────────────────────────────────────────────
    section("EVENTS + COLLABORATION (assertEventManage seam)");
    // an event organized by Club A
    let ev = await prisma.contentItem.findFirst({ where: { slug: "sim-rm-event", contentType: "event" }, select: { id: true, status: true } });
    if (!ev) { const { item } = await createDraft({ contentType: "event", title: "SIM RM Event", academicYearId: YEAR, slug: "sim-rm-event", payload: { eventDate: new Date(Date.now() + 5 * 86400000).toISOString(), category: "technical", audience: "public" } }, devActor); ev = item; }
    if (ev.status !== "published") await publish(ev.id, {}, devActor);
    await setEventOrganizers(ev.id, [{ orgUnitLineageKey: clubA.lineageKey, kind: "organizer" }], devActor);

    const evManage = async (role, expected, opts = {}) => {
      const ok = await canManageEvent({ userId: U[role] }, ev.id, opts);
      check(`manage event (organized by Club A)${opts.requireGlobal ? " [central]" : ""}: ${role} = ${expected}`, ok === expected, ok === expected ? "" : `got ${ok}`);
    };
    await evManage("developer", true);
    await evManage("super_admin", true);
    await evManage("admin", true);
    await evManage("staff", true);
    await evManage("coordinatorA", true);   // organizing club
    await evManage("coordinatorB", false);  // different club
    await evManage("co_coordinatorA", false); // no event.manage
    await evManage("member", false);
    // Collaboration / organizer-tagging is a CENTRAL action (requireGlobal): scoped
    // coordinators cannot; only global event.manage holders can.
    await evManage("coordinatorA", false, { requireGlobal: true });
    await evManage("staff", true, { requireGlobal: true });
    await evManage("admin", true, { requireGlobal: true });

    // ── admin-panel access ────────────────────────────────────────────────
    section("ADMIN-PANEL ACCESS (global nav visibility)");
    const adminAccess = async (role, expected) => {
      const resolved = await getEffectivePermissions(U[role], GLOBAL);
      const ok = hasAnyAdminAccess(resolved);
      check(`admin panel visible: ${role} = ${expected}`, ok === expected, ok === expected ? "" : `got ${ok}`);
    };
    await adminAccess("developer", true);
    await adminAccess("super_admin", true);
    await adminAccess("admin", true);
    await adminAccess("staff", true);
    await adminAccess("secretary", false);      // scoped → uses /coordinator, not /admin
    await adminAccess("coordinatorA", false);
    await adminAccess("co_coordinatorA", false);
    await adminAccess("member", false);

    // ── participation (events/announcements are login-only / public) ───────
    section("PARTICIPATION (account-status seam)");
    check("active member can participate", canParticipate("active") === true);
    check("inactive member cannot participate", canParticipate("inactive") === false);
    check("revoked member cannot participate", canParticipate("revoked") === false);

    // ── summary ────────────────────────────────────────────────────────────
    section("SUMMARY");
    const passed = checks.filter((c) => c.ok).length;
    for (const c of checks) if (!c.ok) log(`   [FAIL] ${c.name}`);
    log(`\n   ${passed}/${checks.length} access-matrix checks passed.`);
    expect(passed).toBe(checks.length);
  }, 180000);
});
