// Static (DB-free) tests for the Session-6 Events + Announcements feature. Cover
// the pure logic: the V1 events import plan, the past/upcoming split (the
// KNOWN_ISSUES #3 contract fix), the base64-image classifier (#5), and the
// event/announcement content-type handlers + windowed-type registration. These
// keep the default `npm test` green without a database; the live-DB behavior
// (publish→visible-in-window, expire, pin ordering, importer idempotency) is in
// tests/events.db.test.mjs.
import { describe, it, expect } from "vitest";
import { V1_EVENTS, buildEventImportPlan, planEvent } from "../lib/events/data.mjs";
import { splitEventsByDate, filterByAudience, AUDIENCE_TYPES, PUBLIC_AUDIENCES } from "../lib/events/public.mjs";
import { classifyMedia, mediaKey, BASE64_PLACEHOLDER_URL, slugify } from "../lib/org/normalize.mjs";
import { getContentTypeHandler, getContentTypeDef } from "../lib/cms/content-types.mjs";
import { WINDOWED_TYPES, isWithinPublishWindow } from "../lib/cms/visibility.mjs";

describe("events data: V1 import plan", () => {
  it("captures exactly the 3 backed-up Mongo events, verbatim", () => {
    expect(V1_EVENTS).toHaveLength(3);
    expect(V1_EVENTS.map((e) => e.title)).toEqual(["Udyamitsav", "Pragyaan", "Anhad"]);
    // every backed-up doc had an empty image (no base64/URL in the real data)
    expect(V1_EVENTS.every((e) => e.image === "")).toBe(true);
  });

  it("normalizes each event to { title, slug, body, eventDate, image:null, audience }", () => {
    const plan = buildEventImportPlan();
    expect(plan).toHaveLength(3);
    const anhad = plan.find((e) => e.title === "Anhad");
    expect(anhad.slug).toBe("anhad");
    expect(anhad.body).toBe("Techno-Cultural Fest");
    expect(anhad.eventDate).toBeInstanceOf(Date);
    expect(anhad.eventDate.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(anhad.image).toBeNull(); // "" → null (no cover)
    expect(anhad.audience).toBe("public");
    expect(anhad.publishFrom).toBeNull();
    expect(anhad.publishUntil).toBeNull();
  });

  it("derives slugs deterministically from the title", () => {
    expect(buildEventImportPlan().map((e) => e.slug)).toEqual(["udyamitsav", "pragyaan", "anhad"]);
  });

  it("planEvent maps an arbitrary V1 doc (date string → Date, description → body)", () => {
    const p = planEvent({ title: "Tech Talk 2026", description: "A talk", date: "2026-09-15T10:00:00.000Z", image: "" });
    expect(p.slug).toBe("tech-talk-2026");
    expect(p.body).toBe("A talk");
    expect(p.eventDate.toISOString()).toBe("2026-09-15T10:00:00.000Z");
  });
});

describe("events: splitEventsByDate (replaces the /past-events #3 contract bug)", () => {
  const NOW = new Date("2026-06-29T00:00:00.000Z");
  const ev = (slug, iso) => ({ id: slug, slug, eventDate: iso ? new Date(iso) : null });

  it("partitions strictly-past vs upcoming by eventDate", () => {
    const events = [ev("a", "2026-02-07"), ev("b", "2026-12-01"), ev("c", "2025-04-01")];
    const { upcoming, past } = splitEventsByDate(events, NOW);
    expect(past.map((e) => e.slug)).toEqual(["a", "c"]); // both before NOW, most-recent-first
    expect(upcoming.map((e) => e.slug)).toEqual(["b"]);
  });

  it("treats an event exactly at `now` as upcoming (half-open), and undated as ongoing/upcoming", () => {
    const events = [ev("at-now", NOW.toISOString()), ev("undated", null), ev("yesterday", "2026-06-28")];
    const { upcoming, past } = splitEventsByDate(events, NOW);
    expect(past.map((e) => e.slug)).toEqual(["yesterday"]);
    expect(upcoming.map((e) => e.slug)).toContain("at-now");
    expect(upcoming.map((e) => e.slug)).toContain("undated");
  });

  it("orders upcoming soonest-first (undated first) and past most-recent-first", () => {
    const events = [
      ev("far", "2026-12-01"),
      ev("soon", "2026-07-01"),
      ev("ongoing", null),
      ev("old", "2025-01-01"),
      ev("recent", "2026-05-01"),
    ];
    const { upcoming, past } = splitEventsByDate(events, NOW);
    expect(upcoming.map((e) => e.slug)).toEqual(["ongoing", "soon", "far"]);
    expect(past.map((e) => e.slug)).toEqual(["recent", "old"]);
  });

  it("is null-safe and empty-safe", () => {
    expect(splitEventsByDate(undefined, NOW)).toEqual({ upcoming: [], past: [] });
    expect(splitEventsByDate([], NOW)).toEqual({ upcoming: [], past: [] });
  });
});

describe("media: base64 (data:) image handling (KNOWN_ISSUES #5)", () => {
  it("records a placeholder for a base64 image and NEVER stores the blob", () => {
    const blob = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const c = classifyMedia(blob);
    expect(c.isBase64).toBe(true);
    expect(c.storageProvider).toBe("local");
    expect(c.kind).toBe("image");
    expect(c.url).toBe(BASE64_PLACEHOLDER_URL);
    expect(c.originalPath).toBeNull();
    // the multi-KB blob must not leak into the stored row
    expect(c.url).not.toContain("iVBOR");
    expect(c.url.length).toBeLessThan(120);
  });

  it("infers kind from the data MIME (pdf)", () => {
    expect(classifyMedia("data:application/pdf;base64,JVBERi0=").kind).toBe("pdf");
  });

  it("still classifies http(s) as external and /public paths as local (unchanged)", () => {
    expect(classifyMedia("https://res.cloudinary.com/x/a.jpg")).toMatchObject({ storageProvider: "external", kind: "image" });
    expect(classifyMedia("/coding.jpg")).toMatchObject({ storageProvider: "local", originalPath: "/coding.jpg" });
    expect(classifyMedia("")).toBeNull();
  });

  it("dedup key falls back to the placeholder url for base64 (deduped per the importer, not here)", () => {
    expect(mediaKey(classifyMedia("data:image/png;base64,AAAA"))).toBe(BASE64_PLACEHOLDER_URL);
  });
});

describe("content types: event + announcement handlers", () => {
  it("event handler carries the payload window + audience + cover columns", () => {
    const h = getContentTypeHandler("event");
    expect(h).toBeTruthy();
    for (const f of ["body", "eventDate", "location", "audience", "publishFrom", "publishUntil", "coverMediaId"]) {
      expect(h.scalarFields).toContain(f);
    }
    expect(getContentTypeDef("event")).toMatchObject({ isYearScoped: true, isOrgBound: false, payloadTable: "event_payload" });
  });

  it("announcement handler requires a body and carries window + audience", () => {
    const h = getContentTypeHandler("announcement");
    expect(h.requiredFields).toContain("body");
    for (const f of ["body", "audience", "publishFrom", "publishUntil", "coverMediaId"]) {
      expect(h.scalarFields).toContain(f);
    }
    // a create with no body is rejected app-side (friendly 422) before the DB
    expect(() => h.validate({}, { isCreate: true })).toThrow(/required field 'body'/);
    expect(() => h.validate({ body: "x" }, { isCreate: true })).not.toThrow();
  });

  it("both event and announcement are windowed public types", () => {
    expect(WINDOWED_TYPES.has("event")).toBe(true);
    expect(WINDOWED_TYPES.has("announcement")).toBe(true);
  });
});

describe("audience gating (anonymous public reads default to 'public')", () => {
  const items = [
    { id: "a", audience: "public" },
    { id: "b", audience: "students" },
    { id: "c", audience: "internal" },
    { id: "d" }, // missing → treated as public
  ];

  it("default keeps only 'public' (and missing) audience — non-public is never surfaced anonymously", () => {
    expect(filterByAudience(items).map((x) => x.id)).toEqual(["a", "d"]);
    expect(filterByAudience(items, PUBLIC_AUDIENCES).map((x) => x.id)).toEqual(["a", "d"]);
  });

  it("widening the allowed set (a future role-aware view) lets more through", () => {
    expect(filterByAudience(items, ["public", "students"]).map((x) => x.id)).toEqual(["a", "b", "d"]);
    expect(filterByAudience(items, AUDIENCE_TYPES).map((x) => x.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("AUDIENCE_TYPES matches the audience_type enum and PUBLIC_AUDIENCES is just 'public'", () => {
    expect(AUDIENCE_TYPES).toEqual(["public", "students", "faculty", "staff", "internal"]);
    expect(PUBLIC_AUDIENCES).toEqual(["public"]);
  });
});

describe("publish window (pure, shared with the DB CHECK)", () => {
  const now = new Date("2026-06-29T12:00:00Z");
  it("is open with no bounds, closed before publishFrom, closed at/after publishUntil", () => {
    expect(isWithinPublishWindow({}, now)).toBe(true);
    expect(isWithinPublishWindow({ publishFrom: new Date("2026-07-01") }, now)).toBe(false);
    expect(isWithinPublishWindow({ publishUntil: new Date("2026-06-01") }, now)).toBe(false);
    expect(isWithinPublishWindow({ publishFrom: new Date("2026-06-01"), publishUntil: new Date("2026-07-01") }, now)).toBe(true);
  });
});
