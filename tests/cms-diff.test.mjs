import { describe, it, expect } from "vitest";
import { diffRevisionViews } from "../lib/cms/content.mjs";

// A minimal revision "view" as produced by getRevision().
const view = (over = {}) => ({
  id: "rev",
  contentItemId: "item-1",
  revisionNo: 1,
  revisionStatus: "published",
  title: "T",
  summary: null,
  payload: {},
  ...over,
});

describe("diffRevisionViews (pure field-level diff)", () => {
  it("identical revisions yield no changes", () => {
    const a = view({ payload: { vision: "v", missionPoints: [{ text: "m1" }] } });
    const b = view({ id: "rev2", payload: { vision: "v", missionPoints: [{ text: "m1" }] } });
    const d = diffRevisionViews(a, b);
    expect(d.changed).toEqual([]);
    expect(d.changes).toEqual({});
  });

  it("reports a scalar change with from/to", () => {
    const a = view({ payload: { vision: "first" } });
    const b = view({ id: "r2", payload: { vision: "second" } });
    const d = diffRevisionViews(a, b);
    expect(d.changed).toContain("vision");
    expect(d.changes.vision).toEqual({ from: "first", to: "second" });
  });

  it("reports a value→null change", () => {
    const d = diffRevisionViews(view({ payload: { vision: "x" } }), view({ id: "r2", payload: { vision: null } }));
    expect(d.changes.vision).toEqual({ from: "x", to: null });
  });

  it("reports a list change with from/to arrays (JSON-compared)", () => {
    const a = view({ payload: { missionPoints: [{ text: "m1" }] } });
    const b = view({ id: "r2", payload: { missionPoints: [{ text: "m1" }, { text: "m2" }] } });
    const d = diffRevisionViews(a, b);
    expect(d.changed).toContain("missionPoints");
    expect(d.changes.missionPoints.from).toEqual([{ text: "m1" }]);
    expect(d.changes.missionPoints.to).toEqual([{ text: "m1" }, { text: "m2" }]);
  });

  it("treats deeply-equal JSONB objects as unchanged (no reference-equality false positive)", () => {
    const a = view({ payload: { data: { hero: "a", n: 1 } } });
    const b = view({ id: "r2", payload: { data: { hero: "a", n: 1 } } }); // distinct reference, equal value
    expect(diffRevisionViews(a, b).changed).not.toContain("data");
  });

  it("reports a genuinely different JSONB object", () => {
    const a = view({ payload: { data: { hero: "a" } } });
    const b = view({ id: "r2", payload: { data: { hero: "b" } } });
    expect(diffRevisionViews(a, b).changed).toContain("data");
  });

  it("compares Date fields by ISO value, not reference", () => {
    const a = view({ payload: { publishFrom: new Date("2026-01-01T00:00:00Z") } });
    const b = view({ id: "r2", payload: { publishFrom: new Date("2026-01-01T00:00:00Z") } });
    expect(diffRevisionViews(a, b).changed).not.toContain("publishFrom");
    const c = view({ id: "r3", payload: { publishFrom: new Date("2026-02-01T00:00:00Z") } });
    expect(diffRevisionViews(a, c).changed).toContain("publishFrom");
  });

  it("detects a title change and carries from/to revision metadata", () => {
    const a = view({ title: "Old" });
    const b = view({ id: "r2", revisionNo: 2, title: "New" });
    const d = diffRevisionViews(a, b);
    expect(d.changes.title).toEqual({ from: "Old", to: "New" });
    expect(d.from).toEqual({ id: "rev", revisionNo: 1, status: "published" });
    expect(d.to).toEqual({ id: "r2", revisionNo: 2, status: "published" });
  });
});
