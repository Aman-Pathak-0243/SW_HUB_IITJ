// Live-DB integration tests for the Session-11 / M0 member-platform foundation
// (plugin toggle, account lifecycle, notification/request queue, admin-mediated
// reset). Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set. Run with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/m0.db.test.mjs
//
// Throwaway users (zz-m0-* emails) + throwaway notifications, cleaned in afterAll
// via the audit-bypassing base client. The member_platform flag is read at the
// start and RESTORED at the end so the live portal's plugin state is not changed.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

let prismaBase, users, notifs, flags, reset, pw;
let dev, actor;
let saUser, saActor; // a throwaway super_admin (grants_all but NOT developer)
let createdUserIds = [];
let createdNotifIds = [];
let originalFlagEnabled = false;

const mkEmail = () => `zz-m0-${randomUUID()}@iitjammu.ac.in`;
const GOOD_PW = "Welcome#2026xZ";

async function load() {
  const p = await import("../lib/prisma.mjs");
  prismaBase = p.prismaBase;
  users = await import("../lib/users/admin.mjs");
  notifs = await import("../lib/notifications/service.mjs");
  flags = await import("../lib/platform/flags.mjs");
  reset = await import("../lib/auth/password-reset.mjs");
  pw = await import("../lib/auth/password.mjs");
}

async function teardown() {
  if (!prismaBase) return;
  for (const id of createdUserIds) await prismaBase.user.delete({ where: { id } }).catch(() => {});
  if (saUser) await prismaBase.user.delete({ where: { id: saUser.id } }).catch(() => {});
  for (const id of createdNotifIds) await prismaBase.notification.delete({ where: { id } }).catch(() => {});
  await prismaBase.notification.deleteMany({ where: { subjectEmail: { startsWith: "zz-m0-" } } }).catch(() => {});
  const ids = [...createdUserIds, ...createdNotifIds, ...(saUser ? [saUser.id] : [])];
  if (ids.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: ids } } }).catch(() => {});
  // restore the member_platform flag to its original state
  await prismaBase.featureFlag.update({ where: { key: flags.MEMBER_PLATFORM_FLAG }, data: { enabled: originalFlagEnabled } }).catch(() => {});
  flags.clearFlagCache();
}

describe.skipIf(!RUN)("Member platform M0 (live Neon)", () => {
  beforeAll(async () => {
    await load();
    for (let i = 1; i <= 12; i++) {
      try { await prismaBase.$queryRaw`SELECT 1`; break; } catch { await new Promise((r) => setTimeout(r, 5000)); }
    }
    dev = await prismaBase.user.findFirst({ where: { isDeveloper: true } });
    actor = { userId: dev.id };
    const f = await prismaBase.featureFlag.findUnique({ where: { key: flags.MEMBER_PLATFORM_FLAG } });
    originalFlagEnabled = !!f?.enabled;

    // a throwaway super_admin: grants_all but NOT a developer (for escalation guards)
    const sa = await users.createUser({ email: mkEmail(), name: "ZZ M0 SuperAdmin" }, actor);
    saUser = sa.user;
    const superRole = await prismaBase.role.findUnique({ where: { key: "super_admin" } });
    await users.grantRole({ userId: saUser.id, roleId: superRole.id }, actor);
    saActor = { userId: saUser.id };
  }, 120000);

  afterAll(async () => {
    await teardown();
    if (prismaBase) await prismaBase.$disconnect();
  }, 120000);

  dbit("plugin toggle is developer-only and gates isFeatureEnabled", async () => {
    // a super_admin (grants_all, not developer) cannot toggle the plugin
    await expect(flags.setFeatureFlag(flags.MEMBER_PLATFORM_FLAG, true, saActor)).rejects.toMatchObject({ status: 403, code: "DEVELOPER_ONLY" });

    // a developer can — and the gating read reflects it
    await flags.setFeatureFlag(flags.MEMBER_PLATFORM_FLAG, true, actor);
    expect(await flags.isFeatureEnabled(flags.MEMBER_PLATFORM_FLAG, { useCache: false })).toBe(true);
    await flags.setFeatureFlag(flags.MEMBER_PLATFORM_FLAG, false, actor);
    expect(await flags.isFeatureEnabled(flags.MEMBER_PLATFORM_FLAG, { useCache: false })).toBe(false);

    // unknown flag → 404
    await expect(flags.setFeatureFlag("nope_flag", true, actor)).rejects.toMatchObject({ status: 404 });
  });

  dbit("createUser with an initial password sets must_change_password; no password leaves it false", async () => {
    const a = await users.createUser({ email: mkEmail(), password: GOOD_PW }, actor);
    createdUserIds.push(a.user.id);
    expect(a.user.mustChangePassword).toBe(true);
    expect(a.user.hasPassword).toBe(true);

    const b = await users.createUser({ email: mkEmail() }, actor);
    createdUserIds.push(b.user.id);
    expect(b.user.mustChangePassword).toBe(false);
    expect(b.user.hasPassword).toBe(false);

    // a weak initial password is rejected by the policy
    await expect(users.createUser({ email: mkEmail(), password: "weak" }, actor)).rejects.toMatchObject({ status: 422 });
  });

  dbit("changeOwnPassword verifies current, enforces policy, and clears must_change", async () => {
    const { user } = await users.createUser({ email: mkEmail(), password: GOOD_PW }, actor);
    createdUserIds.push(user.id);
    const self = { userId: user.id };

    // wrong current password → 403
    await expect(users.changeOwnPassword(user.id, { currentPassword: "nope-wrong-1A", newPassword: "Brand#New2027" }, self)).rejects.toMatchObject({ status: 403, code: "BAD_CURRENT_PASSWORD" });
    // reusing the same password → 422
    await expect(users.changeOwnPassword(user.id, { currentPassword: GOOD_PW, newPassword: GOOD_PW }, self)).rejects.toMatchObject({ status: 422 });
    // someone else cannot change it
    await expect(users.changeOwnPassword(user.id, { currentPassword: GOOD_PW, newPassword: "Brand#New2027" }, { userId: dev.id })).rejects.toMatchObject({ status: 403 });

    const res = await users.changeOwnPassword(user.id, { currentPassword: GOOD_PW, newPassword: "Brand#New2027" }, self);
    expect(res.user.mustChangePassword).toBe(false);
    const row = await prismaBase.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    expect(await pw.verifyPassword(row.passwordHash, "Brand#New2027")).toBe(true);
  });

  dbit("forcePasswordReset generates a working temporary password and flags must_change", async () => {
    const { user } = await users.createUser({ email: mkEmail(), password: GOOD_PW }, actor);
    createdUserIds.push(user.id);
    const { generatedPassword, user: shaped } = await users.forcePasswordReset(user.id, actor);
    expect(shaped.mustChangePassword).toBe(true);
    const row = await prismaBase.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
    expect(await pw.verifyPassword(row.passwordHash, generatedPassword)).toBe(true);
  });

  dbit("importUsersCsv creates new accounts and skips existing emails (idempotent)", async () => {
    const email = mkEmail();
    const csv = `email,password\n${email},${GOOD_PW}\n${mkEmail()},${GOOD_PW}\nbad-no-at,${GOOD_PW}`;
    const r1 = await users.importUsersCsv(csv, actor);
    expect(r1.summary.created).toBe(2);
    expect(r1.summary.failed).toBe(1); // the bad email
    r1.created.forEach((u) => createdUserIds.push(u.id));

    // re-import the same → both existing now skipped, none created
    const r2 = await users.importUsersCsv(`${email},${GOOD_PW}`, actor);
    expect(r2.summary.created).toBe(0);
    expect(r2.summary.skipped).toBe(1);
  });

  dbit("deleteUser & password-reset guard self + developer (DL-049 parity)", async () => {
    const { user } = await users.createUser({ email: mkEmail() }, actor);
    // cannot delete yourself
    await expect(users.deleteUser(dev.id, actor)).rejects.toMatchObject({ status: 409, code: "SELF_LOCKOUT" });
    // a super_admin cannot delete a developer (escalation parity)
    await expect(users.deleteUser(dev.id, saActor)).rejects.toMatchObject({ status: 403, code: "DEVELOPER_ONLY" });
    // a super_admin cannot RESET a developer's password either (review CRITICAL fix)
    await expect(users.forcePasswordReset(dev.id, saActor)).rejects.toMatchObject({ status: 403, code: "DEVELOPER_ONLY" });
    await expect(users.setUserPassword(dev.id, "Brand#New2027", saActor)).rejects.toMatchObject({ status: 403, code: "DEVELOPER_ONLY" });
    // delete works
    const res = await users.deleteUser(user.id, actor);
    expect(res.deleted).toBe(true);
    expect(await prismaBase.user.findUnique({ where: { id: user.id } })).toBeNull();
    // a delete audit row was written (attributed to the deleter)
    const rows = await prismaBase.auditLog.findMany({ where: { action: "delete", entityType: "app_user", entityId: user.id } });
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  dbit("account & reset requests mint unique reference ids, dedup open ones, and gate reads", async () => {
    const email = mkEmail();
    const a1 = await notifs.createAccountRequest({ email, name: "ZZ Req" });
    createdNotifIds.push(a1.notification.id);
    expect(a1.created).toBe(true);
    expect(a1.notification.referenceId).toMatch(/^AR-\d{5}$/);
    // a second open request for the same email collapses onto the first
    const a2 = await notifs.createAccountRequest({ email });
    expect(a2.created).toBe(false);
    expect(a2.notification.id).toBe(a1.notification.id);

    // reset request records whether the account exists
    const r = await notifs.createPasswordResetRequest({ email: dev.email });
    createdNotifIds.push(r.notification.id);
    expect(r.notification.referenceId).toMatch(/^PR-\d{5}$/);
    expect(r.notification.data?.accountExists).toBe(true);

    // the DB partial-unique backstops the dedup race: a SECOND open row for the
    // same (type, subject_email) is rejected even if the app check is bypassed
    await expect(
      prismaBase.notification.create({ data: { referenceId: `PR-DUP-${randomUUID().slice(0, 8)}`, type: "password_reset", status: "open", title: "dup", subjectEmail: dev.email } })
    ).rejects.toMatchObject({ code: "P2002" });

    // listing is gated
    await expect(notifs.listNotifications({}, {})).rejects.toMatchObject({ status: 401 });
    await expect(notifs.listNotifications({}, { userId: saUser.id })).resolves.toBeInstanceOf(Array); // super_admin has notification.read via ALL
  });

  dbit("assign (audited) then fulfilReset end-to-end resets the account and resolves the request", async () => {
    const { user } = await users.createUser({ email: mkEmail(), password: GOOD_PW }, actor);
    createdUserIds.push(user.id);
    const req = await notifs.createPasswordResetRequest({ email: user.email });
    createdNotifIds.push(req.notification.id);

    const assigned = await notifs.assignNotification(req.notification.id, actor);
    expect(assigned.notification.status).toBe("assigned");
    expect(assigned.notification.assignedToUserId).toBe(dev.id);
    const auditRows = await prismaBase.auditLog.findMany({ where: { entityType: "notification", entityId: req.notification.id } });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);

    const out = await reset.fulfilResetRequest(req.notification.id, actor);
    expect(out.userEmail).toBe(user.email);
    // the generated password actually works + must_change is set
    const row = await prismaBase.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, mustChangePassword: true } });
    expect(row.mustChangePassword).toBe(true);
    expect(await pw.verifyPassword(row.passwordHash, out.generatedPassword)).toBe(true);
    // the request is now resolved
    const finalN = await notifs.getNotification(req.notification.id, actor);
    expect(finalN.status).toBe("resolved");

    // fulfilling a reset for a non-existent account → 404 (dismiss instead)
    const orphan = await notifs.createPasswordResetRequest({ email: `zz-m0-orphan-${randomUUID()}@iitjammu.ac.in` });
    createdNotifIds.push(orphan.notification.id);
    await expect(reset.fulfilResetRequest(orphan.notification.id, actor)).rejects.toMatchObject({ status: 404 });
  });
});
