// Live-DB integration tests for the Session-9 Users & Roles service against the
// seeded Neon database. Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set, so
// the default `npm test` stays green. Run with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/users.db.test.mjs
//
// Fixtures are throwaway users (zz-users-* emails) + a throwaway role (zz_users_role),
// removed in afterAll via the audit-bypassing base client. Exercises the net-new
// service end-to-end: create/list/update/suspend users, role CRUD + system-role
// protection, grant/revoke (idempotent), the RBAC gate (401/403), the developer-only
// privilege guard (DL-049), and that grants are audited (grant_role row).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

const ROLE_KEY = "zz_users_role";

let prismaBase, svc;
let dev, actor; // a seeded developer
let createdUserIds = [];
let createdRoleIds = [];

async function load() {
  const p = await import("../lib/prisma.mjs");
  prismaBase = p.prismaBase;
  svc = await import("../lib/users/admin.mjs");
}

async function teardown() {
  if (!prismaBase) return;
  // delete users first (cascades their role_assignments, freeing the restricted role FK)
  for (const id of createdUserIds) await prismaBase.user.delete({ where: { id } }).catch(() => {});
  await prismaBase.role.deleteMany({ where: { key: ROLE_KEY } }).catch(() => {});
  // tidy the audit rows we generated about the throwaway entities
  const ids = [...createdUserIds, ...createdRoleIds];
  if (ids.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: ids } } }).catch(() => {});
}

const mkEmail = () => `zz-users-${randomUUID()}@example.com`;

describe.skipIf(!RUN)("Users & Roles service (live Neon)", () => {
  beforeAll(async () => {
    await load();
    for (let i = 1; i <= 12; i++) {
      try { await prismaBase.$queryRaw`SELECT 1`; break; } catch { await new Promise((r) => setTimeout(r, 5000)); }
    }
    dev = await prismaBase.user.findFirst({ where: { isDeveloper: true } });
    actor = { userId: dev.id };
    // stale role cleanup
    await prismaBase.role.deleteMany({ where: { key: ROLE_KEY } }).catch(() => {});
  }, 120000);

  afterAll(async () => {
    await teardown();
    if (prismaBase) await prismaBase.$disconnect();
  }, 120000);

  dbit("creates a user, lists it, and rejects a duplicate email (409)", async () => {
    const email = mkEmail();
    const { user } = await svc.createUser({ email, name: "ZZ One" }, actor);
    createdUserIds.push(user.id);
    expect(user.email).toBe(email);
    expect(user.hasPassword).toBe(false);
    expect(user).not.toHaveProperty("passwordHash");

    const listed = await svc.listUsers({ search: "zz-users-" }, actor);
    expect(listed.map((u) => u.id)).toContain(user.id);

    await expect(svc.createUser({ email }, actor)).rejects.toMatchObject({ status: 409, code: "EMAIL_TAKEN" });
  });

  dbit("updates name, sets status, and blocks self-lockout", async () => {
    const { user } = await svc.createUser({ email: mkEmail(), name: "ZZ Two" }, actor);
    createdUserIds.push(user.id);

    const upd = await svc.updateUser(user.id, { name: "ZZ Two Renamed" }, actor);
    expect(upd.user.name).toBe("ZZ Two Renamed");

    const sus = await svc.setUserStatus(user.id, "suspended", actor);
    expect(sus.user.status).toBe("suspended");
    const act = await svc.setUserStatus(user.id, "active", actor);
    expect(act.user.status).toBe("active");

    // cannot suspend your OWN account
    await expect(svc.setUserStatus(actor.userId, "suspended", actor)).rejects.toMatchObject({ status: 409, code: "SELF_LOCKOUT" });
  });

  dbit("creates a role with permissions, replaces them, and protects system roles", async () => {
    const created = await svc.createRole(
      { key: ROLE_KEY, name: "ZZ Users Role", description: "test", permissionKeys: ["content.read", "media.read"] },
      actor
    );
    createdRoleIds.push(created.id);
    expect(created.permissionKeys.sort()).toEqual(["content.read", "media.read"]);
    expect(created.grantsAll).toBe(false);
    expect(created.isSystem).toBe(false);

    const updated = await svc.updateRole(created.id, { permissionKeys: ["content.read"] }, actor);
    expect(updated.permissionKeys).toEqual(["content.read"]);

    // an unknown permission key is a friendly 422
    await expect(svc.createRole({ key: "zz_bad_role", name: "x", permissionKeys: ["nope.fake"] }, actor)).rejects.toMatchObject({ status: 422 });

    // system roles are protected — editing more than the description is a 409
    const superAdmin = await prismaBase.role.findUnique({ where: { key: "super_admin" } });
    await expect(svc.updateRole(superAdmin.id, { name: "Hacked" }, actor)).rejects.toMatchObject({ status: 409, code: "SYSTEM_ROLE_PROTECTED" });
    // ...but its description CAN be edited
    const descOnly = await svc.updateRole(superAdmin.id, { description: superAdmin.description ?? "Full administrative access." }, actor);
    expect(descOnly.key).toBe("super_admin");
  });

  dbit("grants a role (idempotent), revokes it, and re-grants a fresh active grant", async () => {
    const { user } = await svc.createUser({ email: mkEmail(), name: "ZZ Grantee" }, actor);
    createdUserIds.push(user.id);
    const role = await prismaBase.role.findUnique({ where: { key: ROLE_KEY } });

    const g1 = await svc.grantRole({ userId: user.id, roleId: role.id }, actor);
    expect(g1.created).toBe(true);
    const g2 = await svc.grantRole({ userId: user.id, roleId: role.id }, actor); // idempotent
    expect(g2.created).toBe(false);
    expect(g2.assignment.id).toBe(g1.assignment.id);

    // a grant_role audit row was written (central writer, attributed)
    const auditRows = await prismaBase.auditLog.findMany({ where: { action: "grant_role", entityId: g1.assignment.id } });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);

    const rev = await svc.revokeRole(g1.assignment.id, actor);
    expect(rev.assignment.active).toBe(false);
    const revAgain = await svc.revokeRole(g1.assignment.id, actor); // idempotent
    expect(revAgain.changed).toBe(false);

    // after a revoke, re-granting succeeds with a NEW active assignment (partial
    // unique only covers non-revoked rows)
    const g3 = await svc.grantRole({ userId: user.id, roleId: role.id }, actor);
    expect(g3.created).toBe(true);
    expect(g3.assignment.id).not.toBe(g1.assignment.id);
  });

  dbit("enforces the RBAC gate (401 unauthenticated, 403 no-permission)", async () => {
    const { user: noPerm } = await svc.createUser({ email: mkEmail(), name: "ZZ NoPerm" }, actor);
    createdUserIds.push(noPerm.id);
    await expect(svc.listUsers({}, {})).rejects.toMatchObject({ status: 401 });
    await expect(svc.listUsers({}, { userId: noPerm.id })).rejects.toMatchObject({ status: 403 });
  });

  dbit("only a developer can mint a developer (DL-049): a super_admin is rejected", async () => {
    // a throwaway super_admin actor: full grants_all, but NOT a developer
    const { user: sa } = await svc.createUser({ email: mkEmail(), name: "ZZ SuperAdmin" }, actor);
    createdUserIds.push(sa.id);
    const superRole = await prismaBase.role.findUnique({ where: { key: "super_admin" } });
    await svc.grantRole({ userId: sa.id, roleId: superRole.id }, actor);
    const saActor = { userId: sa.id };

    // the super_admin CAN create a normal user (has user.create via grants_all)...
    const { user: normal } = await svc.createUser({ email: mkEmail(), name: "ZZ Normal" }, saActor);
    createdUserIds.push(normal.id);
    // ...but NOT a developer account (privilege escalation guard)
    await expect(svc.createUser({ email: mkEmail(), isDeveloper: true }, saActor)).rejects.toMatchObject({ status: 403, code: "DEVELOPER_ONLY" });
    // ...nor elevate an existing account to developer
    await expect(svc.updateUser(normal.id, { isDeveloper: true }, saActor)).rejects.toMatchObject({ status: 403, code: "DEVELOPER_ONLY" });
    // ...nor GRANT the grants_all developer role (the role-grant escalation guard)
    const devRole = await prismaBase.role.findUnique({ where: { key: "developer" } });
    await expect(svc.grantRole({ userId: normal.id, roleId: devRole.id }, saActor)).rejects.toMatchObject({ status: 403, code: "DEVELOPER_ONLY" });
    // ...nor even grant the (non-grants_all but system) super_admin role
    await expect(svc.grantRole({ userId: normal.id, roleId: superRole.id }, saActor)).rejects.toMatchObject({ status: 403, code: "DEVELOPER_ONLY" });
  });
});
