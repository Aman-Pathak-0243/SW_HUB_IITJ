// Live-DB integration tests for Session-11 / M8 — hidden usage analytics, per-table
// storage thresholds + export/truncate, and bulk mail (authorized-sender allowlist +
// rate-limited send with an injected fake transport). Self-skips unless RUN_DB_TESTS=1.
// Run isolated:  RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/m8.db.test.mjs
//
// NOTE: this suite TRUNCATES page_visit (the allowlisted analytics table) — run it
// against the dev DB only (it is in the standard live-test set, which targets the
// throwaway dev Neon).
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const T = 420000;
const dbit = (n, f) => it(n, f, T);

let prismaBase, usage, storage, mail, audit;
let actor;
const senderIds = [];
const backupIds = [];

async function load() {
  const p = await import("../lib/prisma.mjs");
  prismaBase = p.prismaBase;
  usage = await import("../lib/devconsole/usage.mjs");
  storage = await import("../lib/devconsole/storage.mjs");
  mail = await import("../lib/mail/service.mjs");
  audit = await import("../lib/devconsole/audit.mjs");
}

async function teardown() {
  if (!prismaBase) return;
  for (const id of senderIds) await prismaBase.authorizedSender.delete({ where: { id } }).catch(() => {});
  for (const id of backupIds) await prismaBase.backupRecord.delete({ where: { id } }).catch(() => {});
  await prismaBase.tableThreshold.delete({ where: { tableName: "page_visit" } }).catch(() => {});
  // threshold-alert notification raised by the storage test
  await prismaBase.notification.deleteMany({ where: { type: "threshold_alert", label: "storage" } }).catch(() => {});
  const ids = [...senderIds, ...backupIds];
  if (ids.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: ids } } }).catch(() => {});
  // table_export audit rows (Session-11 review fix) + the truncate audit row
  await prismaBase.auditLog.deleteMany({ where: { entityType: { in: ["table_export", "page_visit", "table_threshold"] } } }).catch(() => {});
}

describe.skipIf(!RUN)("Member platform M8 — usage / storage / mail (live Neon)", () => {
  beforeAll(async () => {
    await load();
    for (let i = 1; i <= 12; i++) { try { await prismaBase.$queryRaw`SELECT 1`; break; } catch { await new Promise((r) => setTimeout(r, 5000)); } }
    const dev = await prismaBase.user.findFirst({ where: { isDeveloper: true } });
    actor = { userId: dev.id };
  }, T);
  afterAll(teardown, T);

  dbit("usage: recordPageVisit aggregates; storage report flags + export + truncate page_visit", async () => {
    for (let i = 0; i < 4; i++) await usage.recordPageVisit({ path: "/zz-usage", section: "zzusage" });
    const an = await usage.getUsageAnalytics({ windowDays: 1 }, actor);
    expect(an.totalVisits).toBeGreaterThanOrEqual(4);
    expect(an.bySection.some((s) => s.key === "zzusage")).toBe(true);

    // sizes include page_visit; set a 0-byte threshold so it flags (it has rows)
    const sizes = await storage.getTableSizes();
    expect(sizes.some((s) => s.tableName === "page_visit")).toBe(true);
    await storage.setTableThreshold("page_visit", 0, { note: "zz" }, actor);
    const report = await storage.getStorageReport(actor, { raiseAlerts: true });
    expect(report.flagged.some((r) => r.tableName === "page_visit")).toBe(true);
    // raiseAlerts created a deduped threshold_alert notification
    const alert = await prismaBase.notification.findFirst({ where: { type: "threshold_alert", label: "storage" } });
    expect(alert).toBeTruthy();

    // export records a backup_record ledger row AND a guaranteed table_export audit row
    const exp = await storage.exportTable("page_visit", actor, { format: "json" });
    expect(exp.count).toBeGreaterThanOrEqual(4);
    if (exp.backupId) backupIds.push(exp.backupId);
    const exportAudit = await prismaBase.auditLog.findFirst({ where: { entityType: "table_export" }, orderBy: { id: "desc" } });
    expect(exportAudit).toBeTruthy(); // every export leaves a trail regardless of the ledger (review fix)

    // confirm guard + allowlist guard
    await expect(storage.truncateTable("page_visit", actor, {})).rejects.toMatchObject({ code: "CONFIRM_REQUIRED" });
    await expect(storage.truncateTable("feedback", actor, { confirm: true })).rejects.toMatchObject({ code: "NOT_TRUNCATABLE" });

    // truncate the allowlisted analytics table
    const tr = await storage.truncateTable("page_visit", actor, { confirm: true });
    expect(tr.truncated).toBe(true);
    expect(await prismaBase.pageVisit.count()).toBe(0);
  });

  dbit("mail: authorized-sender gate + rate-limited bulk send via an injected transport", async () => {
    const email = `zz-sender-${Date.now()}@iitjammu.ac.in`;
    const { sender } = await mail.addAuthorizedSender({ email, name: "ZZ Sender" }, actor);
    senderIds.push(sender.id);
    expect(await mail.isAuthorizedSender(email)).toBe(true);

    // a non-authorized sender is rejected
    await expect(
      mail.sendBulk({ from: "stranger@iitjammu.ac.in", subject: "x", text: "y", recipients: ["a@b.co"] }, actor, { transport: { sendMail: async () => {} }, sleep: () => {} })
    ).rejects.toMatchObject({ status: 403, code: "SENDER_NOT_AUTHORIZED" });

    // a real bulk send through a fake transport (no network, no real sleep). With
    // ratePerMinute:1 the 2 valid recipients form 2 batches → the batching/pause path
    // executes once (review: the earlier single-batch test never exercised it).
    const calls = [];
    let pauses = 0;
    const transport = { sendMail: async (m) => { calls.push(m.to); return { messageId: "x" }; } };
    const res = await mail.sendBulk(
      { from: email, subject: "Hello", text: "Body", recipients: ["a@b.co", "a@b.co", "c@d.co", "bad-addr"] },
      actor,
      { transport, sleep: () => { pauses++; }, ratePerMinute: 1 }
    );
    expect(res.sent).toBe(2); // a@b.co (deduped) + c@d.co
    expect(res.invalid).toContain("bad-addr");
    expect(res.progress.percent).toBe(100);
    expect(pauses).toBe(1); // 2 batches of 1 → exactly one inter-batch pause
    expect(calls.sort()).toEqual(["a@b.co", "c@d.co"]);
  });

  dbit("audit export returns CSV with a header", async () => {
    const out = await audit.exportAuditLog({ take: 5 }, actor, { format: "csv" });
    expect(out.format).toBe("csv");
    expect(out.content.split("\n")[0]).toContain("action");
    expect(out.count).toBeGreaterThanOrEqual(0);
  });
});
