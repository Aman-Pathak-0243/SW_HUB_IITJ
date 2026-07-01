// Static (no-DB) tests for the M4 Wall of Fame pure helpers — the hybrid-block
// validator/normalizer + the credit-target rule (lib/achievements/forms.mjs, mirrored
// client+server, DL-051) and the public read layer's PURE shaping/ordering/block
// resolution (lib/achievements/public.mjs). The DB round-trips + auth are covered by
// tests/m4.db.test.mjs.
import { describe, it, expect } from "vitest";
import {
  BLOCK_KINDS,
  normalizeBlock,
  normalizeBlocks,
  normalizeAchievementDate,
  normalizeAchievementPayload,
  blockMediaIds,
  normalizeCreditRole,
  creditTargetKind,
} from "../lib/achievements/forms.mjs";
import { sortAchievements, resolveBlock } from "../lib/achievements/public.mjs";
import { renderMarkdown } from "../lib/markdown/render.mjs";
import { getContentTypeHandler, getContentTypeDef } from "../lib/cms/content-types.mjs";

describe("achievement content type is registered on the CMS spine", () => {
  it("has a def + a handler bound to achievement_payload", () => {
    const def = getContentTypeDef("achievement");
    expect(def).toBeTruthy();
    expect(def.isYearScoped).toBe(true);
    expect(def.isOrgBound).toBe(false); // central Wall-of-Fame; club link is via credits
    expect(def.payloadTable).toBe("achievement_payload");
    const handler = getContentTypeHandler("achievement");
    expect(handler).toBeTruthy();
    expect(handler.scalarFields).toContain("blocks");
  });
});

describe("block validation + normalization (DL-080)", () => {
  it("accepts each supported block kind and drops unknown fields", () => {
    expect(normalizeBlock({ kind: "markdown", body: "hi", sneaky: 1 })).toEqual({ kind: "markdown", body: "hi" });
    expect(normalizeBlock({ kind: "banner", mediaId: "m1", caption: "c" })).toEqual({ kind: "banner", mediaId: "m1", caption: "c" });
    expect(normalizeBlock({ kind: "markdown_image", mediaId: "m1", body: "x" })).toEqual({ kind: "markdown_image", mediaId: "m1", imagePosition: "right", body: "x" });
    expect(normalizeBlock({ kind: "markdown_image", mediaId: "m1", imagePosition: "left" })).toEqual({ kind: "markdown_image", mediaId: "m1", imagePosition: "left" });
    expect(normalizeBlock({ kind: "gallery", mediaIds: ["a", "", "b"] })).toEqual({ kind: "gallery", mediaIds: ["a", "b"] });
    expect(normalizeBlock({ kind: "link", url: "https://x.io", label: "X" })).toEqual({ kind: "link", url: "https://x.io", label: "X" });
    expect(BLOCK_KINDS).toContain("gallery");
  });

  it("rejects an unknown kind, a non-object, and each kind's missing required field", () => {
    expect(() => normalizeBlock({ kind: "video", src: "x" })).toThrow();
    expect(() => normalizeBlock("nope")).toThrow();
    expect(() => normalizeBlock({ kind: "markdown", body: "   " })).toThrow(); // empty
    expect(() => normalizeBlock({ kind: "banner" })).toThrow(); // no mediaId
    expect(() => normalizeBlock({ kind: "markdown_image", body: "x" })).toThrow(); // no mediaId
    expect(() => normalizeBlock({ kind: "gallery", mediaIds: [] })).toThrow(); // empty
    expect(() => normalizeBlock({ kind: "link" })).toThrow(); // no url
  });

  it("rejects an unsafe link url via the SAME isSafeHref the markdown renderer uses (DL-077)", () => {
    expect(() => normalizeBlock({ kind: "link", url: "javascript:alert(1)" })).toThrow();
    expect(() => normalizeBlock({ kind: "link", url: "data:text/html,x" })).toThrow();
    // relative + mailto are allowed
    expect(normalizeBlock({ kind: "link", url: "/events" }).url).toBe("/events");
    expect(normalizeBlock({ kind: "link", url: "mailto:x@y.io" }).url).toBe("mailto:x@y.io");
  });

  it("normalizeBlocks: undefined leaves existing (returns undefined); [] clears; caps count", () => {
    expect(normalizeBlocks(undefined)).toBeUndefined();
    expect(normalizeBlocks(null)).toBeNull();
    expect(normalizeBlocks([])).toEqual([]);
    expect(() => normalizeBlocks({})).toThrow(); // not an array
    const many = Array.from({ length: 51 }, () => ({ kind: "markdown", body: "x" }));
    expect(() => normalizeBlocks(many)).toThrow();
  });

  it("markdown block bodies are rendered SAFELY (no raw HTML survives, DL-077)", () => {
    const b = normalizeBlock({ kind: "markdown", body: "<script>alert(1)</script> **bold**" });
    const html = renderMarkdown(b.body);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("blockMediaIds collects mediaId + gallery mediaIds across a list", () => {
    const blocks = [
      { kind: "banner", mediaId: "b1" },
      { kind: "markdown", body: "x" },
      { kind: "markdown_image", mediaId: "mi1" },
      { kind: "gallery", mediaIds: ["g1", "g2"] },
    ];
    expect(blockMediaIds(blocks).sort()).toEqual(["b1", "g1", "g2", "mi1"]);
    expect(blockMediaIds(null)).toEqual([]);
  });
});

describe("achievement date + payload normalization", () => {
  it("coerces valid dates, passes null/undefined, throws on garbage", () => {
    expect(normalizeAchievementDate(undefined)).toBeUndefined();
    expect(normalizeAchievementDate(null)).toBeNull();
    expect(normalizeAchievementDate("")).toBeNull();
    expect(normalizeAchievementDate("2026-05-01")).toBeInstanceOf(Date);
    const d = new Date();
    expect(normalizeAchievementDate(d)).toBe(d);
    expect(() => normalizeAchievementDate("not-a-date")).toThrow();
  });

  it("normalizeAchievementPayload validates blocks + date, drops omitted keys", () => {
    const out = normalizeAchievementPayload({ category: "Sports", blocks: [{ kind: "markdown", body: "hi", x: 1 }], achievementDate: "2026-01-01" });
    expect(out.category).toBe("Sports");
    expect(out.blocks).toEqual([{ kind: "markdown", body: "hi" }]);
    expect(out.achievementDate).toBeInstanceOf(Date);
    // omitted blocks/date keys are removed so the CMS handler leaves existing values
    const partial = normalizeAchievementPayload({ category: "X" });
    expect("blocks" in partial).toBe(false);
    expect("achievementDate" in partial).toBe(false);
    // a bad block still throws through the payload normalizer
    expect(() => normalizeAchievementPayload({ blocks: [{ kind: "banner" }] })).toThrow();
  });
});

describe("credit target rule (DL-081)", () => {
  it("normalizeCreditRole trims/limits, null on empty", () => {
    expect(normalizeCreditRole("  Winner ")).toBe("Winner");
    expect(normalizeCreditRole("")).toBeNull();
    expect(normalizeCreditRole(null)).toBeNull();
  });

  it("creditTargetKind requires EXACTLY one of member | club", () => {
    expect(creditTargetKind({ userId: "u1" })).toBe("user");
    expect(creditTargetKind({ email: "a@b.io" })).toBe("user");
    expect(creditTargetKind({ orgUnitLineageKey: "lin1" })).toBe("club");
    expect(() => creditTargetKind({ userId: "u1", orgUnitLineageKey: "lin1" })).toThrow(); // both
    expect(() => creditTargetKind({})).toThrow(); // neither
    expect(() => creditTargetKind({ email: "   " })).toThrow(); // blank email = no target
  });
});

describe("public read layer pure helpers", () => {
  it("sortAchievements: pinned first, then achievementDate desc, then publishedAt desc", () => {
    const rows = [
      { id: "a", pinned: false, achievementDate: "2026-01-01", publishedAt: "2026-01-02" },
      { id: "b", pinned: true, achievementDate: "2025-01-01", publishedAt: "2025-01-01" },
      { id: "c", pinned: false, achievementDate: "2026-03-01", publishedAt: "2026-03-02" },
      { id: "d", pinned: false, achievementDate: null, publishedAt: "2026-06-01" },
    ];
    expect(sortAchievements(rows).map((r) => r.id)).toEqual(["b", "c", "a", "d"]);
  });

  it("resolveBlock: maps media ids → urls; drops/degrades missing media; passes markdown/link", () => {
    const map = { b1: "http://cdn/b1.jpg", g1: "http://cdn/g1.jpg" };
    expect(resolveBlock({ kind: "markdown", body: "x" }, map)).toEqual({ kind: "markdown", body: "x" });
    expect(resolveBlock({ kind: "banner", mediaId: "b1", caption: "c" }, map)).toEqual({ kind: "banner", caption: "c", imageUrl: "http://cdn/b1.jpg" });
    // missing banner media → dropped
    expect(resolveBlock({ kind: "banner", mediaId: "gone" }, map)).toBeNull();
    // markdown_image with missing image degrades to plain markdown
    expect(resolveBlock({ kind: "markdown_image", mediaId: "gone", body: "hi" }, map)).toEqual({ kind: "markdown", body: "hi" });
    // gallery filters out missing images
    expect(resolveBlock({ kind: "gallery", mediaIds: ["g1", "gone"] }, map)).toEqual({ kind: "gallery", caption: null, images: ["http://cdn/g1.jpg"] });
    // link passes through
    expect(resolveBlock({ kind: "link", url: "/x", label: "L" }, map)).toEqual({ kind: "link", url: "/x", label: "L" });
  });
});
