// Live-DB integration tests for Session-11 / M2 — RBAC categories + per-email
// permission overrides (grant/deny, deny wins) + the email-format smart search.
// Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set. Run with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/m2.db.test.mjs
//
// Throwaway users (zz-m2-* AND a few institute-format 2099* addresses for the
// search), a throwaway "permission.override-only" role, all cleaned in afterAll via
// the audit-bypassing base client. Asserts the OVERRIDE resolves through the REAL
// getEffectivePermissions / userCan (the production authorization path), the
// DL-062 escalation guard, the DB NULLS-NOT-DISTINCT backstop, and the server-side
// smart filter on listUsers.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

let prismaBase, users, authz;
let dev, actor;
let limitedUser, limitedActor, limitedRoleId;
let currentYear;
const createdUserIds = [];
const createdOverrideIds = [];

const mkEmail = () => `zz-m2-${randomUUID()}@iitjammu.ac.in`;

async function load() {
  const p = await import("../lib/prisma.mjs");
  prismaBase = p.prismaBase;
  users = await import("../lib/users/admin.mjs");
  authz = await import("../lib/rbac/authorize.mjs");
}

async function teardown() {
  if (!prismaBase) return;
  const allUserIds = [...createdUserIds, ...(limitedUser ? [limitedUser.id] : [])];
  for (const id of allUserIds) await prismaBase.user.delete({ where: { id } }).catch(() => {}); // cascades overrides + assignments
  if (limitedRoleId) await prismaBase.role.delete({ where: { id: limitedRoleId } }).catch(() => {});
  const auditIds = [...allUserIds, ...createdOverrideIds];
  if (auditIds.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: auditIds } } }).catch(() => {});
}

// track + return a created override id
async function setOverride(input, who) {
  const res = await users.setUserOverride(input, who);
  if (res?.override?.id) createdOverrideIds.push(res.override.id);
  return res;
}

describe.skipIf(!RUN)("Member platform M2 — RBAC overrides + smart search (live Neon)", () => {
  beforeAll(async () => {
    await load();
    for (let i = 1; i <= 12; i++) {
      try { await prismaBase.$queryRaw`SELECT 1`; break; } catch { await new Promise((r) => setTimeout(r, 5000)); }
    }
    dev = await prismaBase.user.findFirst({ where: { isDeveloper: true } });
    actor = { userId: dev.id };
    currentYear = await prismaBase.academicYear.findFirst({ where: { isCurrent: true } });

    // A throwaway role that holds ONLY `permission.override`, granted to a throwaway
    // user → the "limited actor" used to prove the escalation guard.
    const overridePerm = await prismaBase.permission.findUnique({ where: { key: "permission.override" } });
    expect(overridePerm, "permission.override must be seeded — run npm run db:seed").toBeTruthy();
    const role = await prismaBase.role.create({
      data: { key: `zz_m2_limited_${randomUUID().slice(0, 8)}`, name: "ZZ M2 Limited", isSystem: false, grantsAll: false, status: "active" },
    });
    limitedRoleId = role.id;
    await prismaBase.rolePermission.create({ data: { roleId: role.id, permissionId: overridePerm.id } });
    const lu = await users.createUser({ email: mkEmail(), name: "ZZ M2 Limited Actor" }, actor);
    limitedUser = lu.user;
    await prismaBase.roleAssignment.create({ data: { userId: limitedUser.id, roleId: role.id } });
    limitedActor = { userId: limitedUser.id };
  }, 120000);

  afterAll(async () => {
    await teardown();
    if (prismaBase) await prismaBase.$disconnect();
  }, 120000);

  dbit("a GRANT override adds a permission no role gave (resolves via userCan)", async () => {
    const { user } = await users.createUser({ email: mkEmail() }, actor); // no roles
    createdUserIds.push(user.id);
    expect(await authz.userCan(user.id, "media.upload")).toBe(false);
    const res = await setOverride({ userId: user.id, permissionKey: "media.upload", mode: "grant" }, actor);
    expect(res.changed).toBe(true);
    expect(res.override.mode).toBe("grant");
    expect(await authz.userCan(user.id, "media.upload")).toBe(true);
  });

  dbit("a DENY override removes a role-granted permission; remove restores it (deny wins)", async () => {
    const { user } = await users.createUser({ email: mkEmail() }, actor);
    createdUserIds.push(user.id);
    const coordinator = await prismaBase.role.findUnique({ where: { key: "coordinator" } });
    expect(coordinator, "coordinator category must be seeded").toBeTruthy();
    await users.grantRole({ userId: user.id, roleId: coordinator.id }, actor);
    expect(await authz.userCan(user.id, "content.publish")).toBe(true);

    const res = await setOverride({ userId: user.id, permissionKey: "content.publish", mode: "deny" }, actor);
    expect(await authz.userCan(user.id, "content.publish")).toBe(false); // deny wins over the role grant
    expect(await authz.userCan(user.id, "content.read")).toBe(true); // unaffected

    const removed = await users.removeUserOverride(res.override.id, actor);
    expect(removed.removed).toBe(true);
    expect(await authz.userCan(user.id, "content.publish")).toBe(true); // back to the role default
  });

  dbit("a scoped deny applies only in scope; a global request is unaffected", async () => {
    const { user } = await users.createUser({ email: mkEmail() }, actor);
    createdUserIds.push(user.id);
    const coordinator = await prismaBase.role.findUnique({ where: { key: "coordinator" } });
    await users.grantRole({ userId: user.id, roleId: coordinator.id }, actor); // global content.publish
    await setOverride({ userId: user.id, permissionKey: "content.publish", mode: "deny", academicYearId: currentYear.id }, actor);

    expect(await authz.userCan(user.id, "content.publish", { academicYearId: currentYear.id })).toBe(false); // denied in-year
    expect(await authz.userCan(user.id, "content.publish")).toBe(true); // global request not denied by a year-scoped deny
  });

  dbit("escalation guard: a GRANT needs the actor to hold the permission; DENY does not", async () => {
    const { user } = await users.createUser({ email: mkEmail() }, actor);
    createdUserIds.push(user.id);
    // the limited actor holds ONLY permission.override → cannot GRANT content.read
    await expect(
      users.setUserOverride({ userId: user.id, permissionKey: "content.read", mode: "grant" }, limitedActor)
    ).rejects.toMatchObject({ status: 403, code: "OVERRIDE_ESCALATION" });
    // but DENY (a de-escalation) is allowed
    const res = await setOverride({ userId: user.id, permissionKey: "content.read", mode: "deny" }, limitedActor);
    expect(res.override.mode).toBe("deny");
    // a developer can grant anything (grantsAll short-circuit in userCan)
    const g = await setOverride({ userId: user.id, permissionKey: "content.read", mode: "grant" }, actor);
    expect(g.override.mode).toBe("grant"); // flips the same scope's override in place (one row)
  });

  dbit("set is idempotent at a scope; the DB NULLS-NOT-DISTINCT unique backstops it", async () => {
    const { user } = await users.createUser({ email: mkEmail() }, actor);
    createdUserIds.push(user.id);
    const r1 = await setOverride({ userId: user.id, permissionKey: "media.upload", mode: "grant" }, actor);
    const r2 = await users.setUserOverride({ userId: user.id, permissionKey: "media.upload", mode: "grant" }, actor);
    expect(r2.changed).toBe(false); // same mode → no-op
    expect(r2.override.id).toBe(r1.override.id);
    // only ONE row exists, and a raw second institute-wide row is rejected
    const list = await users.listUserOverrides(user.id, actor);
    expect(list.length).toBe(1);
    const perm = await prismaBase.permission.findUnique({ where: { key: "media.upload" } });
    await expect(
      prismaBase.userPermissionOverride.create({ data: { userId: user.id, permissionId: perm.id, mode: "deny" } })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  dbit("override actions require the permission.override gate (401 unauth / 403 limited-without-it)", async () => {
    const { user } = await users.createUser({ email: mkEmail() }, actor);
    createdUserIds.push(user.id);
    await expect(users.setUserOverride({ userId: user.id, permissionKey: "content.read", mode: "deny" }, {})).rejects.toMatchObject({ status: 401 });
    await expect(users.listUserOverrides(user.id, {})).rejects.toMatchObject({ status: 401 });
  });

  dbit("email-format smart search filters listUsers by year / level / branch / category", async () => {
    // institute-format throwaway users (future year 2099 so they don't collide)
    const a = await users.createUser({ email: "2099ume0001@iitjammu.ac.in" }, actor);
    const b = await users.createUser({ email: "2099ucs0002@iitjammu.ac.in" }, actor);
    const c = await users.createUser({ email: "2099pme0003@iitjammu.ac.in" }, actor);
    [a, b, c].forEach((x) => createdUserIds.push(x.user.id));
    const coordinator = await prismaBase.role.findUnique({ where: { key: "coordinator" } });
    await users.grantRole({ userId: a.user.id, roleId: coordinator.id }, actor);

    const emailsOf = (rows) => rows.map((r) => r.email).sort();

    const byYear = await users.listUsers({ year: 2099 }, actor);
    expect(emailsOf(byYear)).toEqual(["2099pme0003@iitjammu.ac.in", "2099ucs0002@iitjammu.ac.in", "2099ume0001@iitjammu.ac.in"]);
    // the coarse DB prefix + precise filter agree: every returned row truly is year 2099
    expect(byYear.every((r) => r.email.startsWith("2099"))).toBe(true);

    expect(emailsOf(await users.listUsers({ year: 2099, branch: "me" }, actor))).toEqual(["2099pme0003@iitjammu.ac.in", "2099ume0001@iitjammu.ac.in"]);
    expect(emailsOf(await users.listUsers({ year: 2099, level: "pg" }, actor))).toEqual(["2099pme0003@iitjammu.ac.in"]);
    expect(emailsOf(await users.listUsers({ year: 2099, level: "ug", branch: "cs" }, actor))).toEqual(["2099ucs0002@iitjammu.ac.in"]);

    // category facet (role key) — narrowed AND precise
    const byCat = await users.listUsers({ year: 2099, category: "coordinator" }, actor);
    expect(emailsOf(byCat)).toEqual(["2099ume0001@iitjammu.ac.in"]);

    // the shaped rows carry overrides[] (M2) — grant one and see it surface
    await setOverride({ userId: b.user.id, permissionKey: "media.upload", mode: "grant" }, actor);
    const refetched = await users.listUsers({ search: "2099ucs0002" }, actor);
    expect(refetched[0].overrides.map((o) => o.permissionKey)).toContain("media.upload");
  });
});
