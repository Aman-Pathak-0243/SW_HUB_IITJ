// Live-DB integration tests for the Session-8 Developer Console against the seeded
// Neon database. Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set, so the
// default `npm test` stays green. Run with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/devconsole.db.test.mjs
//
// Fixtures live in a throwaway 2093-94 year (removed in afterAll via the audit-
// bypassing base client). A small set of audit_log rows is inserted directly with
// prismaBase (this exercises the READER, not the central writer — that is covered
// elsewhere). Exercises:
//   1. listAuditLog filters (year / action / entity) + keyset pagination;
//   2. getAuditStats counts by action + entity over a window;
//   3. getEntityTimeline + getAuditEntry (full before/after);
//   4. the console gate (a no-permission user → 403; developer passes);
//   5. checkDatabase + getMigrationStatus (init applied) + getSystemStatus shape;
//   6. the backup_record ledger: recordBackup → listBackups → markBackupVerified.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

const YEAR_LABEL = "2093-94";
const ENTITY_A = "zz_devconsole_a";
const ENTITY_B = "zz_devconsole_b";
const BACKUP_SCOPE = "zz-devconsole";

let prisma, prismaBase, audit, status, reports, backups;
let dev, actor, noPermUser, yearId;
let E1, E2, E3, publishRowId;
let backupId;

async function load() {
  const p = await import("../lib/prisma.mjs");
  prisma = p.prisma;
  prismaBase = p.prismaBase;
  audit = await import("../lib/devconsole/audit.mjs");
  status = await import("../lib/devconsole/status.mjs");
  reports = await import("../lib/devconsole/reports.mjs");
  backups = await import("../lib/devconsole/backups.mjs");
}

async function teardown() {
  if (!prismaBase) return;
  if (yearId) {
    await prismaBase.auditLog.deleteMany({ where: { academicYearId: yearId } }).catch(() => {});
    await prismaBase.academicYear.delete({ where: { id: yearId } }).catch(() => {});
  }
  // backup_record + its audit rows (not year-scoped)
  await prismaBase.auditLog.deleteMany({ where: { entityType: "backup_record", summary: { contains: BACKUP_SCOPE } } }).catch(() => {});
  await prismaBase.backupRecord.deleteMany({ where: { scope: BACKUP_SCOPE } }).catch(() => {});
  if (noPermUser) {
    await prismaBase.roleAssignment.deleteMany({ where: { userId: noPermUser } }).catch(() => {});
    await prismaBase.user.delete({ where: { id: noPermUser } }).catch(() => {});
  }
}

describe.skipIf(!RUN)("Developer Console (live Neon)", () => {
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

    // stale cleanup, then a throwaway year
    const stale = await prismaBase.academicYear.findUnique({ where: { label: YEAR_LABEL }, select: { id: true } }).catch(() => null);
    if (stale) {
      await prismaBase.auditLog.deleteMany({ where: { academicYearId: stale.id } }).catch(() => {});
      await prismaBase.academicYear.delete({ where: { id: stale.id } }).catch(() => {});
    }
    const y = await prismaBase.academicYear.create({
      data: { label: YEAR_LABEL, startDate: new Date("2093-07-01"), endDate: new Date("2094-06-30"), status: "active", isCurrent: false },
    });
    yearId = y.id;

    // a no-permission user for the 403 gate test
    const npu = await prismaBase.user.create({
      data: { email: `zz-devconsole-${randomUUID()}@example.com`, name: "ZZ No Perms", status: "active" },
    });
    noPermUser = npu.id;

    // insert audit rows scoped to the throwaway year (READER fixtures), in order so
    // the last inserted has the highest id (newest-first by id).
    E1 = randomUUID();
    E2 = randomUUID();
    E3 = randomUUID();
    const mk = (action, entityType, entityId, summary, before, after) =>
      prismaBase.auditLog.create({
        data: { actorUserId: dev.id, action, entityType, entityId, academicYearId: yearId, summary, before: before ?? null, after: after ?? null },
      });
    await mk("create", ENTITY_A, E1, "zz create a");
    const pubA = await mk("publish", ENTITY_A, E1, "zz publish a", { status: "draft" }, { status: "published" });
    publishRowId = String(pubA.id);
    await mk("update", ENTITY_B, E2, "zz update b");
    await mk("publish", ENTITY_B, E2, "zz publish b");
    await mk("archive", ENTITY_A, E3, "zz archive a");
  }, 120000);

  afterAll(async () => {
    await teardown();
    if (prisma) await prisma.$disconnect();
  }, 120000);

  dbit("listAuditLog filters by year / action / entity (newest-first)", async () => {
    const all = await audit.listAuditLog({ academicYearId: yearId, take: 50 }, actor);
    expect(all.count).toBe(5);
    expect(all.entries[0].summary).toBe("zz archive a"); // last inserted = newest

    const published = await audit.listAuditLog({ academicYearId: yearId, action: "publish" }, actor);
    expect(published.count).toBe(2);
    expect(published.entries.every((e) => e.action === "publish")).toBe(true);

    const aEntity = await audit.listAuditLog({ academicYearId: yearId, entityType: ENTITY_A }, actor);
    expect(aEntity.count).toBe(3);
    expect(aEntity.entries.every((e) => e.entityType === ENTITY_A)).toBe(true);
  });

  dbit("listAuditLog paginates via the keyset cursor", async () => {
    const p1 = await audit.listAuditLog({ academicYearId: yearId, take: 2 }, actor);
    expect(p1.count).toBe(2);
    expect(p1.hasMore).toBe(true);
    expect(p1.nextCursor).toBeTruthy();

    const p2 = await audit.listAuditLog({ academicYearId: yearId, take: 2, cursor: p1.nextCursor }, actor);
    expect(p2.count).toBe(2);
    // pages don't overlap
    const ids1 = new Set(p1.entries.map((e) => e.id));
    expect(p2.entries.some((e) => ids1.has(e.id))).toBe(false);

    const p3 = await audit.listAuditLog({ academicYearId: yearId, take: 2, cursor: p2.nextCursor }, actor);
    expect(p3.count).toBe(1);
    expect(p3.hasMore).toBe(false);
    expect(p3.nextCursor).toBeNull();

    // the full keyset walk yields all 5 rows EXACTLY once (proves no overlap/skip,
    // including the boundary page) — equals the single unpaginated listing
    const walked = new Set([...p1.entries, ...p2.entries, ...p3.entries].map((e) => e.id));
    expect(walked.size).toBe(5);
    const all = await audit.listAuditLog({ academicYearId: yearId, take: 50 }, actor);
    expect(walked).toEqual(new Set(all.entries.map((e) => e.id)));
  });

  dbit("getAuditStats counts by action and entity over the window (sorted desc)", async () => {
    const stats = await audit.getAuditStats({ academicYearId: yearId }, actor);
    expect(stats.total).toBe(5);
    // assert ORDER on the real path (arrays, not order-discarding objects): the
    // production sort is count desc, key asc
    expect(stats.byAction[0]).toEqual({ key: "publish", count: 2 }); // the only count-2 action leads
    expect(Object.fromEntries(stats.byAction.map((g) => [g.key, g.count]))).toMatchObject({ publish: 2, create: 1, update: 1, archive: 1 });
    expect(stats.byEntity[0]).toEqual({ key: ENTITY_A, count: 3 }); // 3 > 2, so ENTITY_A leads
    expect(stats.byEntity[1]).toEqual({ key: ENTITY_B, count: 2 });
  });

  dbit("getEntityTimeline and getAuditEntry (full before/after)", async () => {
    const timeline = await audit.getEntityTimeline(ENTITY_A, E1, actor);
    expect(timeline.length).toBe(2); // create + publish on E1
    expect(timeline.map((e) => e.action).sort()).toEqual(["create", "publish"]);

    const entry = await audit.getAuditEntry(publishRowId, actor);
    expect(entry.action).toBe("publish");
    expect(entry.before).toEqual({ status: "draft" });
    expect(entry.after).toEqual({ status: "published" });
    expect(entry.actor).toMatchObject({ id: dev.id });
  });

  dbit("the console gate forbids a no-permission user and allows the developer", async () => {
    await expect(audit.listAuditLog({ academicYearId: yearId }, { userId: noPermUser })).rejects.toMatchObject({ status: 403 });
    // unauthenticated (no actor) → 401
    await expect(audit.listAuditLog({ academicYearId: yearId }, {})).rejects.toMatchObject({ status: 401 });
    // developer is fine
    const ok = await audit.listAuditLog({ academicYearId: yearId, take: 1 }, actor);
    expect(ok.count).toBe(1);
  });

  dbit("checkDatabase + getMigrationStatus + getSystemStatus report a healthy system", async () => {
    const db = await status.checkDatabase();
    expect(db.ok).toBe(true);
    expect(typeof db.latencyMs).toBe("number");

    const mig = await status.getMigrationStatus();
    expect(mig.applied).toContain("20260628120000_init");
    expect(mig.failed).toEqual([]);

    const sys = await status.getSystemStatus(actor);
    expect(sys.database.ok).toBe(true);
    expect(sys.migrations.applied).toContain("20260628120000_init");
    expect(sys.media.counts).toBeTruthy();
    expect(sys.transitions.summary).toBeTruthy();
  });

  dbit("getInfraUsage + reports return live sizes, a token-usage summary, and a build-cost", async () => {
    const rep = await reports.getDevConsoleReports(actor);
    expect(Number.isInteger(rep.infra.mediaCount)).toBe(true);
    expect(rep.infra.mediaBytes).toBeGreaterThanOrEqual(0);
    // a real DB has a non-zero, finite size
    expect(Number.isFinite(rep.infra.dbSizeBytes)).toBe(true);
    expect(rep.infra.dbSizeBytes).toBeGreaterThan(0);
    // Token_Usage.md parses to at least the prior sessions, and buildCost is derived from it
    expect(rep.tokenUsage.totalWorkflowTokens).toBeGreaterThan(0);
    expect(rep.buildCost.totalWorkflowTokens).toBe(rep.tokenUsage.totalWorkflowTokens);
    expect(rep.buildCost.estimatedUsd).toBeGreaterThan(0);
    expect(rep.infraCost.neon.withinFreeTier).toBe(true);
  });

  dbit("getMediaMigrationStatus is a pure read (no media.migrate needed) returning the bucket plan", async () => {
    // callable with a non-media actor — it must NOT route through the gated mutator
    const plan = await status.getMediaMigrationStatus();
    expect(plan.counts).toMatchObject({
      pendingPublic: expect.any(Number),
      base64Pending: expect.any(Number),
      alreadyMigrated: expect.any(Number),
      external: expect.any(Number),
      skipped: expect.any(Number),
    });
    expect(typeof plan.fullyMigrated).toBe("boolean");
  });

  dbit("recovery delegates enforce the backup.restore gate before touching the underlying service", async () => {
    // a no-permission user is rejected by the console gate (403) — for BOTH delegates,
    // and in dry-run, so nothing is mutated even if the gate regressed
    await expect(backups.rollbackMediaMigration({ dryRun: true }, { userId: noPermUser })).rejects.toMatchObject({ status: 403 });
    await expect(
      backups.forceTransitionResync({ sourceYearId: yearId, targetYearId: yearId }, { userId: noPermUser })
    ).rejects.toMatchObject({ status: 403 });
    // the developer passes the console gate AND the underlying media.migrate gate; a
    // dry-run rollback returns a plan and mutates nothing.
    const rb = await backups.rollbackMediaMigration({ dryRun: true }, actor);
    expect(rb.dryRun).toBe(true);
    expect(Array.isArray(rb.plan)).toBe(true);
  });

  dbit("the backup_record ledger records, lists and verifies (audited)", async () => {
    const { record } = await backups.recordBackup(
      { scope: BACKUP_SCOPE, location: "/tmp/zz-devconsole-backup.zip", format: "zip", checksum: "deadbeef", bytes: 1234 },
      actor
    );
    backupId = record.id;
    expect(record.verified).toBe(false);

    const listed = await backups.listBackups({ scope: BACKUP_SCOPE }, actor);
    expect(listed.map((b) => b.id)).toContain(backupId);
    expect(listed.find((b) => b.id === backupId).bytes).toBe(1234);

    const { record: verified } = await backups.markBackupVerified(backupId, actor);
    expect(verified.verified).toBe(true);
    expect(verified.verifiedAt).not.toBeNull();

    // a semantic audit row was written for the create (central writer, DL-028)
    const auditRows = await prismaBase.auditLog.findMany({ where: { entityType: "backup_record", entityId: backupId } });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);

    // a non-integer / negative byte count is a friendly 422, not an opaque 500
    await expect(
      backups.recordBackup({ scope: BACKUP_SCOPE, location: "/tmp/zz-bad.zip", bytes: 12.5 }, actor)
    ).rejects.toMatchObject({ status: 422 });
  });
});
