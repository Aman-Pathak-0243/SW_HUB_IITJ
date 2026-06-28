import { describe, it, expect } from "vitest";
import {
  isWithinPublishWindow,
  isPubliclyVisible,
  publicItemWhere,
  WINDOWED_TYPES,
  listPublicContent,
  getPublicItemBySlug,
} from "../lib/cms/visibility.mjs";

const YEAR = "11111111-1111-1111-1111-111111111111";
const OTHER_YEAR = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-03-01T12:00:00Z");

// A published, current-year, non-archived item with a live revision pointer.
const visibleItem = (over = {}) => ({
  contentType: "club_profile",
  status: "published",
  academicYearId: YEAR,
  archivedAt: null,
  publishedRevisionId: "rev-1",
  ...over,
});

describe("public visibility rule (the data-access gate)", () => {
  it("a published, current-year, non-archived item with a live revision is visible", () => {
    expect(isPubliclyVisible(visibleItem(), { currentYearId: YEAR, now: NOW })).toBe(true);
  });

  it("a draft / review / archived item is never public", () => {
    expect(isPubliclyVisible(visibleItem({ status: "draft" }), { currentYearId: YEAR, now: NOW })).toBe(false);
    expect(isPubliclyVisible(visibleItem({ status: "review" }), { currentYearId: YEAR, now: NOW })).toBe(false);
    expect(isPubliclyVisible(visibleItem({ status: "archived" }), { currentYearId: YEAR, now: NOW })).toBe(false);
    expect(isPubliclyVisible(visibleItem({ archivedAt: new Date() }), { currentYearId: YEAR, now: NOW })).toBe(false);
  });

  it("a published item from another (non-current) year is structurally hidden", () => {
    expect(isPubliclyVisible(visibleItem({ academicYearId: OTHER_YEAR }), { currentYearId: YEAR, now: NOW })).toBe(false);
  });

  it("an item with no published revision pointer is not public", () => {
    expect(isPubliclyVisible(visibleItem({ publishedRevisionId: null }), { currentYearId: YEAR, now: NOW })).toBe(false);
  });
});

describe("event/announcement publish windows", () => {
  it("event/announcement are the windowed types", () => {
    expect(WINDOWED_TYPES.has("event")).toBe(true);
    expect(WINDOWED_TYPES.has("announcement")).toBe(true);
    expect(WINDOWED_TYPES.has("club_profile")).toBe(false);
  });

  it("no window bounds => always open", () => {
    expect(isWithinPublishWindow({}, NOW)).toBe(true);
    expect(isWithinPublishWindow(null, NOW)).toBe(true);
  });

  it("before publish_from is not yet visible; at/after is", () => {
    const p = { publishFrom: new Date("2026-03-02T00:00:00Z") };
    expect(isWithinPublishWindow(p, NOW)).toBe(false);
    expect(isWithinPublishWindow(p, new Date("2026-03-02T00:00:01Z"))).toBe(true);
  });

  it("at/after publish_until is no longer visible (half-open end)", () => {
    const until = new Date("2026-03-01T12:00:00Z");
    expect(isWithinPublishWindow({ publishUntil: until }, NOW)).toBe(false); // now === until
    expect(isWithinPublishWindow({ publishUntil: new Date("2026-03-01T12:00:01Z") }, NOW)).toBe(true);
  });

  it("accepts ISO strings as well as Date objects", () => {
    expect(isWithinPublishWindow({ publishFrom: "2026-02-01T00:00:00Z", publishUntil: "2026-04-01T00:00:00Z" }, NOW)).toBe(true);
  });

  it("a windowed item outside its window is not public even when published+current", () => {
    const ev = visibleItem({ contentType: "event" });
    const future = { publishFrom: new Date("2026-06-01T00:00:00Z") };
    expect(isPubliclyVisible(ev, { currentYearId: YEAR, now: NOW, payload: future })).toBe(false);
    const open = { publishFrom: new Date("2026-01-01T00:00:00Z"), publishUntil: null };
    expect(isPubliclyVisible(ev, { currentYearId: YEAR, now: NOW, payload: open })).toBe(true);
  });
});

describe("publicItemWhere", () => {
  it("encodes published + current-year + not-archived + has-revision", () => {
    const where = publicItemWhere(YEAR, { contentType: "event" });
    expect(where.status).toBe("published");
    expect(where.academicYearId).toBe(YEAR);
    expect(where.archivedAt).toBeNull();
    expect(where.publishedRevisionId).toEqual({ not: null });
    expect(where.contentType).toBe("event");
  });
});

// A fake client exercising the post-query JS window filter without a DB. The
// spine WHERE is honored by Prisma in production; here we feed already-spine-
// matching items and assert the window filter drops the out-of-window one.
function fakeClient({ items, payloads }) {
  return {
    academicYear: { findFirst: async () => ({ id: YEAR }) },
    contentItem: {
      findMany: async () => items,
      findFirst: async ({ where }) => items.find((i) => i.slug === where.slug) ?? null,
    },
    eventPayload: { findUnique: async ({ where }) => payloads[where.revisionId] ?? null },
  };
}

describe("listPublicContent / getPublicItemBySlug (window filter, fake client)", () => {
  const items = [
    { id: "open", contentType: "event", slug: "open", status: "published", academicYearId: YEAR, archivedAt: null, publishedRevisionId: "r-open", pinned: false },
    { id: "future", contentType: "event", slug: "future", status: "published", academicYearId: YEAR, archivedAt: null, publishedRevisionId: "r-future", pinned: false },
  ];
  const payloads = {
    "r-open": { body: "b", publishFrom: new Date("2026-01-01T00:00:00Z"), publishUntil: new Date("2026-12-01T00:00:00Z") },
    "r-future": { body: "b", publishFrom: new Date("2026-06-01T00:00:00Z"), publishUntil: null },
  };
  const client = fakeClient({ items, payloads });

  it("listPublicContent drops events outside their publish window", async () => {
    const out = await listPublicContent({ contentType: "event", now: NOW, currentYearId: YEAR }, { client });
    const ids = out.map((o) => o.item.id);
    expect(ids).toContain("open");
    expect(ids).not.toContain("future");
    expect(out[0].payload.body).toBe("b"); // payload is attached
  });

  it("getPublicItemBySlug returns the in-window item and null for the out-of-window one", async () => {
    expect((await getPublicItemBySlug("event", "open", { now: NOW, client }))?.item.id).toBe("open");
    expect(await getPublicItemBySlug("event", "future", { now: NOW, client })).toBeNull();
  });

  it("returns [] when there is no current year", async () => {
    const noYear = { ...client, academicYear: { findFirst: async () => null } };
    expect(await listPublicContent({ contentType: "event", now: NOW }, { client: noYear })).toEqual([]);
  });
});
