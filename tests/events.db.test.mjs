// Live-DB integration tests for the Session-6 Events + Announcements feature
// against the seeded Neon database. Self-skips unless RUN_DB_TESTS=1 and
// DATABASE_URL is set, so the default `npm test` stays green. Run with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/events.db.test.mjs
//
// Exercises (all in a throwaway 2087-88 year, removed in afterAll via the
// audit-bypassing base client — mirrors tests/org.db.test.mjs):
//   1. publish→visible-in-window; an expired window hides it; a future window
//      opens it only once `now` reaches publish_from.
//   2. publish_from > publish_until → the real event_publish_window_chk CHECK →
//      friendly PUBLISH_WINDOW (422).
//   3. current-year events split into past / upcoming by event date.
//   4. announcements list PINNED-FIRST (DL-010).
//   5. the events importer is idempotent (second run creates 0; imported event
//      is publicly visible).
//
// The throwaway year is NOT current (isCurrent:false) so it never disturbs the
// real current year; the public reads are pointed at it via `currentYearId`.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BASE64_PLACEHOLDER_URL } from "../lib/org/normalize.mjs";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
// Generous ceiling: each create is an interactive tx + post-commit audit, and
// Neon has high per-round-trip latency on a cold/remote compute.
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

const YEAR_LABEL = "2087-88";
const DAY = 86400000;
const EXT_COVER = "https://res.cloudinary.com/zz-test/zz-cover.jpg"; // allowlisted host (cleaned up in teardown)
const B64_IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

let prisma, prismaBase, content, pub, importMod;
let actor, dev, yearId;

async function load() {
  const p = await import("../lib/prisma.mjs");
  prisma = p.prisma;
  prismaBase = p.prismaBase;
  content = await import("../lib/cms/content.mjs");
  pub = await import("../lib/events/public.mjs");
  importMod = await import("../lib/events/import.mjs");
}

// Remove a throwaway year and everything scoped to it. content_item deletes
// cascade to content_revision → per-type payload (FK onDelete Cascade), so
// deleting the items cleans the whole spine. Best-effort; used by both afterAll
// AND beforeAll (self-heal a year left by an interrupted prior run).
async function teardownYear(yId) {
  if (!yId) return;
  await prismaBase.academicYear.update({ where: { id: yId }, data: { status: "active" } }).catch(() => {});
  await prismaBase.auditLog.deleteMany({ where: { academicYearId: yId } }).catch(() => {});
  // content_item delete cascades to revisions + payloads; do it BEFORE removing the
  // media rows the payloads referenced (event_payload.cover_media_id is SetNull).
  await prismaBase.contentItem.deleteMany({ where: { academicYearId: yId } }).catch(() => {});
  // media inventory rows the importer/route created in this test (not year-scoped).
  await prismaBase.mediaAsset.deleteMany({ where: { url: { in: [EXT_COVER, BASE64_PLACEHOLDER_URL] } } }).catch(() => {});
  await prismaBase.academicYear.delete({ where: { id: yId } }).catch(() => {});
}

async function makeEvent({ slug, title, eventDate = null, publishFrom = null, publishUntil = null, body = "Body" }) {
  const { item } = await content.createDraft(
    { contentType: "event", academicYearId: yearId, slug, title, payload: { body, eventDate, publishFrom, publishUntil } },
    actor
  );
  await content.publish(item.id, {}, actor);
  return item;
}

async function makeAnnouncement({ slug, title, body = "Notice", pinned = false, audience }) {
  const payload = { body };
  if (audience) payload.audience = audience;
  const { item } = await content.createDraft(
    { contentType: "announcement", academicYearId: yearId, slug, title, pinned, payload },
    actor
  );
  await content.publish(item.id, {}, actor);
  return item;
}

describe.skipIf(!RUN)("Events + Announcements (live Neon)", () => {
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

    const stale = await prismaBase.academicYear.findUnique({ where: { label: YEAR_LABEL }, select: { id: true } }).catch(() => null);
    if (stale) await teardownYear(stale.id);
    const y = await prismaBase.academicYear.create({
      data: { label: YEAR_LABEL, startDate: new Date("2087-07-01"), endDate: new Date("2088-06-30"), status: "active", isCurrent: false },
    });
    yearId = y.id;
  }, 120000);

  afterAll(async () => {
    if (!prismaBase || !yearId) return;
    await teardownYear(yearId);
    await prisma.$disconnect();
  }, 120000);

  dbit("publish → visible in-window; expired hidden; future window opens at publish_from", async () => {
    await makeEvent({ slug: "db-in-window", title: "DB In Window", eventDate: new Date("2026-12-01") });
    await makeEvent({ slug: "db-expired", title: "DB Expired", eventDate: new Date("2026-01-01"), publishUntil: new Date(Date.now() - DAY) });
    await makeEvent({ slug: "db-future", title: "DB Future", eventDate: new Date("2027-01-01"), publishFrom: new Date(Date.now() + DAY) });

    const visibleNow = await pub.listPublicEvents({ currentYearId: yearId });
    const slugsNow = visibleNow.map((e) => e.slug);
    expect(slugsNow).toContain("db-in-window");
    expect(slugsNow).not.toContain("db-expired"); // window closed
    expect(slugsNow).not.toContain("db-future"); // window not yet open

    // titles come from the published revision; cover is null (no image)
    const inWindow = visibleNow.find((e) => e.slug === "db-in-window");
    expect(inWindow.title).toBe("DB In Window");
    expect(inWindow.coverUrl).toBeNull();

    const visibleLater = await pub.listPublicEvents({ currentYearId: yearId, now: new Date(Date.now() + 2 * DAY) });
    expect(visibleLater.map((e) => e.slug)).toContain("db-future");
  });

  dbit("rejects publish_from after publish_until with a friendly PUBLISH_WINDOW (real CHECK)", async () => {
    await expect(
      content.createDraft(
        {
          contentType: "event",
          academicYearId: yearId,
          slug: "db-bad-window",
          title: "DB Bad Window",
          payload: { body: "x", publishFrom: new Date("2026-08-01"), publishUntil: new Date("2026-07-01") },
        },
        actor
      )
    ).rejects.toMatchObject({ code: "PUBLISH_WINDOW", status: 422 });

    // the rolled-back transaction left no orphan content_item
    const orphan = await prisma.contentItem.findFirst({ where: { academicYearId: yearId, slug: "db-bad-window" } });
    expect(orphan).toBeNull();

    // the separate announcement_publish_window_chk is mapped the same way
    await expect(
      content.createDraft(
        {
          contentType: "announcement",
          academicYearId: yearId,
          slug: "db-bad-ann-window",
          title: "DB Bad Ann Window",
          payload: { body: "x", publishFrom: new Date("2026-08-01"), publishUntil: new Date("2026-07-01") },
        },
        actor
      )
    ).rejects.toMatchObject({ code: "PUBLISH_WINDOW", status: 422 });
  });

  dbit("splits current-year events into past and upcoming by event date", async () => {
    await makeEvent({ slug: "db-past-dated", title: "DB Past Dated", eventDate: new Date("2020-01-01") });
    await makeEvent({ slug: "db-future-dated", title: "DB Future Dated", eventDate: new Date("2099-01-01") });

    const events = await pub.listPublicEvents({ currentYearId: yearId });
    const { upcoming, past } = pub.splitEventsByDate(events);
    expect(past.map((e) => e.slug)).toContain("db-past-dated");
    expect(upcoming.map((e) => e.slug)).toContain("db-future-dated");
    expect(past.map((e) => e.slug)).not.toContain("db-future-dated");
  });

  dbit("lists announcements pinned-first (DL-010)", async () => {
    await makeAnnouncement({ slug: "db-ann-plain", title: "DB Plain Notice", pinned: false });
    await makeAnnouncement({ slug: "db-ann-pinned", title: "DB Pinned Notice", pinned: true });

    const list = await pub.listPublicAnnouncements({ currentYearId: yearId });
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list[0].slug).toBe("db-ann-pinned");
    expect(list[0].pinned).toBe(true);
    expect(list.map((a) => a.slug)).toContain("db-ann-plain");
  });

  dbit("events importer is idempotent: first run creates, second run creates 0", async () => {
    // Build the importer plan from raw V1-shaped docs via the data module.
    const data = await import("../lib/events/data.mjs");
    const eventPlan = data.buildEventImportPlan([
      { title: "ZZ DB Event One", description: "d1", date: "2026-03-01T00:00:00.000Z", image: "" },
      { title: "ZZ DB Event Two", description: "d2", date: "2099-03-01T00:00:00.000Z", image: "" },
    ]);

    const first = await importMod.importEvents({ academicYearId: yearId, plan: eventPlan, withMedia: false }, actor);
    expect(first.counts.events.created).toBe(2);

    const second = await importMod.importEvents({ academicYearId: yearId, plan: eventPlan, withMedia: false }, actor);
    expect(second.counts.events.created).toBe(0);
    expect(second.counts.events.skipped).toBe(2);

    // the imported (future-dated) event is publicly visible
    const visible = await pub.listPublicEvents({ currentYearId: yearId });
    expect(visible.map((e) => e.slug)).toContain("zz-db-event-two");
  });

  dbit("non-public audience is hidden from anonymous reads but visible to a widened reader (DL-038)", async () => {
    await makeAnnouncement({ slug: "db-aud-public", title: "DB Public Notice", audience: "public" });
    await makeAnnouncement({ slug: "db-aud-students", title: "DB Students Notice", audience: "students" });

    const anon = await pub.listPublicAnnouncements({ currentYearId: yearId });
    const anonSlugs = anon.map((a) => a.slug);
    expect(anonSlugs).toContain("db-aud-public");
    expect(anonSlugs).not.toContain("db-aud-students"); // gated out of the anonymous view

    const widened = await pub.listPublicAnnouncements({ currentYearId: yearId, audiences: ["public", "students"] });
    expect(widened.map((a) => a.slug)).toContain("db-aud-students");
  });

  dbit("importer creates media_asset inventory rows (URL + base64 placeholder), never inline blobs (#5)", async () => {
    const data = await import("../lib/events/data.mjs");
    const plan = data.buildEventImportPlan([
      { title: "ZZ Media Ext", description: "ext", date: "2099-05-01T00:00:00.000Z", image: EXT_COVER },
      { title: "ZZ Media B64", description: "b64", date: "2099-05-02T00:00:00.000Z", image: B64_IMG },
    ]);
    const res = await importMod.importEvents({ academicYearId: yearId, plan, withMedia: true }, actor);
    expect(res.counts.events.created).toBe(2);
    expect(res.counts.media.created).toBe(2);

    const visible = await pub.listPublicEvents({ currentYearId: yearId });
    const ext = visible.find((e) => e.slug === "zz-media-ext");
    const b64 = visible.find((e) => e.slug === "zz-media-b64");
    expect(ext.coverUrl).toBe(EXT_COVER);
    // the base64 blob is replaced by a short placeholder — never stored in the row
    expect(b64.coverUrl).toBe(BASE64_PLACEHOLDER_URL);
    expect(b64.coverUrl).not.toContain("iVBOR");
  });

  dbit("importer resumes a partial run: an unpublished draft is published on the next run", async () => {
    const data = await import("../lib/events/data.mjs");
    const plan = data.buildEventImportPlan([{ title: "ZZ Resume Event", description: "r", date: "2099-06-01T00:00:00.000Z", image: "" }]);

    // first run leaves it as an unpublished draft (simulates a crash before publish)
    const first = await importMod.importEvents({ academicYearId: yearId, plan, publish: false, withMedia: false }, actor);
    expect(first.counts.events.created).toBe(1);
    let visible = await pub.listPublicEvents({ currentYearId: yearId });
    expect(visible.map((e) => e.slug)).not.toContain("zz-resume-event"); // draft → not public

    // resume run: skips creating, re-publishes the stranded draft
    const second = await importMod.importEvents({ academicYearId: yearId, plan, publish: true, withMedia: false }, actor);
    expect(second.counts.events.created).toBe(0);
    expect(second.counts.events.skipped).toBe(1);
    visible = await pub.listPublicEvents({ currentYearId: yearId });
    expect(visible.map((e) => e.slug)).toContain("zz-resume-event"); // now published
  });

  dbit("archive readers ignore the live window for a non-current year; by-slug read works (DL-032)", async () => {
    // an event whose live window has already closed
    await makeEvent({ slug: "db-archive-expired", title: "DB Archive Expired", eventDate: new Date("2026-01-01"), publishUntil: new Date(Date.now() - DAY) });

    // current-year (live) read hides it; archive read (non-current year) shows it
    const live = await pub.listPublicEvents({ currentYearId: yearId });
    expect(live.map((e) => e.slug)).not.toContain("db-archive-expired");
    const archive = await pub.listEventsForYear(yearId); // yearId is NOT the current year
    expect(archive.map((e) => e.slug)).toContain("db-archive-expired");

    // by-slug reader (targeted at this year) finds an in-window event
    const one = await pub.getPublicEventBySlug("db-archive-expired", { currentYearId: yearId, now: new Date("2025-12-01") });
    expect(one?.slug).toBe("db-archive-expired");
    // announcement archive reader also resolves
    await makeAnnouncement({ slug: "db-archive-ann", title: "DB Archive Ann" });
    const annArchive = await pub.listAnnouncementsForYear(yearId);
    expect(annArchive.map((a) => a.slug)).toContain("db-archive-ann");
  });

  dbit("handles concurrent same-slug event creation: exactly one wins (DB-serialized, no corruption)", async () => {
    const slug = "db-concurrent";
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        content.createDraft({ contentType: "event", academicYearId: yearId, slug, title: `DB Concurrent ${i}`, payload: { body: "x" } }, actor)
      )
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok.length).toBe(1); // the unique index serialized the rest
    expect(failed.length).toBe(4);
    // every loser failed with a friendly 409 conflict (slug already taken), not a crash
    expect(failed.every((r) => r.reason?.status === 409)).toBe(true);
    // and the DB holds exactly one event with that slug
    expect(await prisma.contentItem.count({ where: { academicYearId: yearId, contentType: "event", slug } })).toBe(1);
  });
});
