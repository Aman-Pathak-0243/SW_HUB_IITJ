// Live-DB integration tests for Session-11 / M7 — feedback/support tickets +
// the generalized notification queue (label, keyset, generic createNotification).
// Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set. Run isolated:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/m7.db.test.mjs
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const T = 420000;
const dbit = (n, f) => it(n, f, T);

let prismaBase, feedback, notifications;
let actor;
const fbIds = [];
const ntIds = [];

async function load() {
  const p = await import("../lib/prisma.mjs");
  prismaBase = p.prismaBase;
  feedback = await import("../lib/feedback/service.mjs");
  notifications = await import("../lib/notifications/service.mjs");
}

async function teardown() {
  if (!prismaBase) return;
  for (const id of fbIds) await prismaBase.feedback.delete({ where: { id } }).catch(() => {});
  for (const id of ntIds) await prismaBase.notification.delete({ where: { id } }).catch(() => {});
  const ids = [...fbIds, ...ntIds];
  if (ids.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: ids } } }).catch(() => {});
}

describe.skipIf(!RUN)("Member platform M7 — feedback + notifications (live Neon)", () => {
  beforeAll(async () => {
    await load();
    for (let i = 1; i <= 12; i++) { try { await prismaBase.$queryRaw`SELECT 1`; break; } catch { await new Promise((r) => setTimeout(r, 5000)); } }
    const dev = await prismaBase.user.findFirst({ where: { isDeveloper: true } });
    actor = { userId: dev.id };
  }, T);
  afterAll(teardown, T);

  dbit("feedback: public create → ref id → take → resolve, with counts", async () => {
    const { feedback: created } = await feedback.createFeedback({ category: "bug", subject: "ZZ live test", body: "Something broke", component: "/events" });
    fbIds.push(created.id);
    expect(created.referenceId).toMatch(/^FB-\d{5}$/);
    expect(created.status).toBe("open");

    const page = await feedback.listFeedbackPage({ status: "open", take: 50 }, actor);
    expect(page.entries.some((t) => t.id === created.id)).toBe(true);

    const taken = await feedback.assignFeedback(created.id, actor);
    expect(taken.feedback.status).toBe("triaged");
    expect(taken.feedback.assignedToUserId).toBe(actor.userId);

    const resolved = await feedback.setFeedbackStatus(created.id, { status: "resolved", note: "fixed" }, actor);
    expect(resolved.feedback.status).toBe("resolved");
    expect(resolved.feedback.resolvedByUserId).toBe(actor.userId);

    const counts = await feedback.getFeedbackCounts(actor);
    expect(counts.resolved).toBeGreaterThanOrEqual(1);

    // an assign audit row exists for the ticket
    const audits = await prismaBase.auditLog.findMany({ where: { entityType: "feedback", entityId: created.id } });
    expect(audits.length).toBeGreaterThanOrEqual(2); // take + resolve
  });

  dbit("a closed ticket cannot be re-assigned; an invalid status is rejected; reopening clears resolution", async () => {
    const { feedback: t } = await feedback.createFeedback({ category: "query", subject: "ZZ closed", body: "q" });
    fbIds.push(t.id);
    await expect(feedback.setFeedbackStatus(t.id, { status: "bogus" }, actor)).rejects.toMatchObject({ status: 422 });
    const resolved = await feedback.setFeedbackStatus(t.id, { status: "resolved", note: "done" }, actor);
    expect(resolved.feedback.resolvedAt).toBeTruthy();
    // re-open → resolution fields CLEARED (Session-11 review fix)
    const reopened = await feedback.setFeedbackStatus(t.id, { status: "in_progress" }, actor);
    expect(reopened.feedback.resolvedAt).toBeNull();
    expect(reopened.feedback.resolvedByUserId).toBeNull();
    await feedback.setFeedbackStatus(t.id, { status: "dismissed", note: "n/a" }, actor);
    await expect(feedback.assignFeedback(t.id, actor)).rejects.toMatchObject({ status: 409, code: "FEEDBACK_CLOSED" });
  });

  dbit("keyset pagination WALKS across pages with no overlap and full coverage", async () => {
    // create 3 fresh tickets, page through them 2-at-a-time
    const made = [];
    for (let i = 0; i < 3; i++) {
      const { feedback: t } = await feedback.createFeedback({ category: "suggestion", subject: `ZZ page ${i}`, body: "b" });
      fbIds.push(t.id); made.push(t.id);
    }
    const p1 = await feedback.listFeedbackPage({ category: "suggestion", take: 2 }, actor);
    expect(p1.entries.length).toBe(2);
    expect(p1.hasMore).toBe(true);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = await feedback.listFeedbackPage({ category: "suggestion", take: 2, cursor: p1.nextCursor }, actor);
    const seen = new Set([...p1.entries, ...p2.entries].map((e) => e.id));
    // no overlap between pages
    expect(p1.entries.filter((e) => p2.entries.some((x) => x.id === e.id)).length).toBe(0);
    // all 3 freshly-created tickets are reached across the walk
    for (const id of made) expect(seen.has(id)).toBe(true);
  });

  dbit("notification: generic createNotification dedupes on dedupeKey + keyset lists", async () => {
    const key = `storage:zz-${Date.now()}`;
    const a = await notifications.createNotification({ type: notifications.NOTIFICATION_TYPES.THRESHOLD_ALERT, label: "storage", title: "ZZ over threshold", dedupeKey: key });
    ntIds.push(a.notification.id);
    expect(a.created).toBe(true);
    expect(a.notification.referenceId).toMatch(/^TA-\d{5}$/);
    expect(a.notification.label).toBe("storage");

    const b = await notifications.createNotification({ type: notifications.NOTIFICATION_TYPES.THRESHOLD_ALERT, label: "storage", title: "ZZ over threshold (again)", dedupeKey: key });
    expect(b.created).toBe(false); // deduped onto the open one
    expect(b.notification.id).toBe(a.notification.id);

    const page = await notifications.listNotificationsPage({ label: "storage", take: 5 }, actor);
    expect(page.entries.some((n) => n.id === a.notification.id)).toBe(true);
    expect(typeof page.hasMore).toBe("boolean");
  });
});
