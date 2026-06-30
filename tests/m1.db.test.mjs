// Live-DB integration tests for Session-11 / M1 — user status & access modes
// (active / inactive / revoked), the participation capability, the live RBAC gate on
// status, scoped (per-unit) grants, and the allow-normal-view toggle. Self-skips
// unless RUN_DB_TESTS=1 and DATABASE_URL is set. Run with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/m1.db.test.mjs
//
// Throwaway users (zz-m1-*) + two throwaway org_unit_lineage rows for the scoped
// grant, all cleaned in afterAll via the audit-bypassing base client. Login behavior
// is asserted through the REAL authorizeCredentials; participation through the REAL
// assertCanParticipate; read behavior through the REAL getEffectivePermissions /
// userCan (the production authorization path).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);
const PW = "Member-Pass-1"; // meets the M0 policy (≥10, upper+lower+digit)

let prismaBase, users, authz, options, session;
let dev, actor;
const createdUserIds = [];
const createdLineageKeys = [];

const mkEmail = () => `zz-m1-${randomUUID()}@iitjammu.ac.in`;

async function load() {
  const p = await import("../lib/prisma.mjs");
  prismaBase = p.prismaBase;
  users = await import("../lib/users/admin.mjs");
  authz = await import("../lib/rbac/authorize.mjs");
  options = await import("../lib/auth/options.mjs");
  session = await import("../lib/auth/session.mjs");
}

async function mkUser() {
  const { user } = await users.createUser({ email: mkEmail(), password: PW }, actor);
  createdUserIds.push(user.id);
  return user;
}

async function teardown() {
  if (!prismaBase) return;
  for (const id of createdUserIds) await prismaBase.user.delete({ where: { id } }).catch(() => {}); // cascades assignments
  for (const key of createdLineageKeys) await prismaBase.orgUnitLineage.delete({ where: { lineageKey: key } }).catch(() => {});
  if (createdUserIds.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: createdUserIds } } }).catch(() => {});
}

describe.skipIf(!RUN)("Member platform M1 — status & access modes (live Neon)", () => {
  beforeAll(async () => {
    await load();
    for (let i = 1; i <= 12; i++) {
      try { await prismaBase.$queryRaw`SELECT 1`; break; } catch { await new Promise((r) => setTimeout(r, 5000)); }
    }
    dev = await prismaBase.user.findFirst({ where: { isDeveloper: true } });
    actor = { userId: dev.id };
    for (let i = 0; i < 2; i++) {
      const l = await prismaBase.orgUnitLineage.create({ data: { canonicalName: `zz-m1-lineage-${i}` } });
      createdLineageKeys.push(l.lineageKey);
    }
  }, DB_TEST_TIMEOUT);

  afterAll(teardown, DB_TEST_TIMEOUT);

  dbit("login: active & inactive can authenticate; revoked cannot (DL-065)", async () => {
    const u = await mkUser();
    // active → authenticates
    const a = await options.authorizeCredentials({ email: u.email, password: PW });
    expect(a).toMatchObject({ id: u.id, email: u.email });

    // inactive → still authenticates (browses as a member)
    await users.setUserStatus(u.id, "inactive", actor);
    const i = await options.authorizeCredentials({ email: u.email, password: PW });
    expect(i).toMatchObject({ id: u.id });

    // revoked → rejected at the credentials boundary
    await users.setUserStatus(u.id, "revoked", actor);
    expect(await options.authorizeCredentials({ email: u.email, password: PW })).toBeNull();
  });

  dbit("participation: active may participate; inactive is barred (M5 capability)", async () => {
    // pure object form (the requireMember() result)
    await expect(session.assertCanParticipate({ status: "active" })).resolves.toBeUndefined();
    await expect(session.assertCanParticipate({ status: "inactive" })).rejects.toMatchObject({ status: 403, code: "PARTICIPATION_DISABLED" });

    // live by user-id (reads status fresh — DL-019)
    const u = await mkUser();
    await expect(session.assertCanParticipate(u.id)).resolves.toBeUndefined();
    await users.setUserStatus(u.id, "inactive", actor);
    await expect(session.assertCanParticipate(u.id)).rejects.toMatchObject({ code: "PARTICIPATION_DISABLED" });
  });

  dbit("read/RBAC: a non-active account resolves to NO back-office permissions", async () => {
    const u = await mkUser();
    await users.grantRole({ userId: u.id, roleKey: "coordinator" }, actor); // institute-wide editor set
    expect(await authz.userCan(u.id, "content.create", {})).toBe(true); // active

    await users.setUserStatus(u.id, "inactive", actor);
    expect(await authz.userCan(u.id, "content.create", {})).toBe(false); // inactive → none

    await users.setUserStatus(u.id, "revoked", actor);
    expect(await authz.userCan(u.id, "content.create", {})).toBe(false); // revoked → none
  });

  dbit("scoped grant: coordinator → own club lineage only (DL-066)", async () => {
    const [own, other] = createdLineageKeys;
    const u = await mkUser();
    await users.grantRole({ userId: u.id, roleKey: "coordinator", orgUnitLineageKey: own }, actor);

    expect(await authz.userCan(u.id, "content.create", { orgUnitLineageKey: own })).toBe(true);
    expect(await authz.userCan(u.id, "content.create", { orgUnitLineageKey: other })).toBe(false);
    expect(await authz.userCan(u.id, "content.create", {})).toBe(false); // narrower grant ≠ institute-wide
  });

  dbit("allowNormalView toggle round-trips and is reflected in the shaped user (DL-067)", async () => {
    const u = await mkUser();
    expect(u.allowNormalView).toBe(true); // default

    const off = await users.updateUser(u.id, { allowNormalView: false }, actor);
    expect(off.user.allowNormalView).toBe(false);
    const reread = await prismaBase.user.findUnique({ where: { id: u.id }, select: { allowNormalView: true } });
    expect(reread.allowNormalView).toBe(false);

    const on = await users.updateUser(u.id, { allowNormalView: true }, actor);
    expect(on.user.allowNormalView).toBe(true);
  });

  dbit("self-lockout: an actor cannot set its OWN account non-active", async () => {
    await expect(users.setUserStatus(actor.userId, "inactive", actor)).rejects.toMatchObject({ status: 409, code: "SELF_LOCKOUT" });
    await expect(users.setUserStatus(actor.userId, "revoked", actor)).rejects.toMatchObject({ status: 409, code: "SELF_LOCKOUT" });
  });
});
