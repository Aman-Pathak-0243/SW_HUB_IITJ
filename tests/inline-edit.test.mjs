// Static (no-DB) unit tests for the inline edit-on-public-page PURE helpers
// (lib/cms/inline.mjs, Session 15 / DL-103). These mirror what lib/cms/content.mjs#editDraft
// consumes so the client <InlineEditor> and the server never drift (DL-051). The gated
// service behaviour (editAndPublish / resolveInlineEditCapability) is exercised by the
// live suites; here we lock the field set + patch shaping.
import { describe, it, expect } from "vitest";
import {
  INLINE_FIELD_SPECS,
  getInlineFields,
  isInlineEditable,
  buildEditPatch,
  patchHasChanges,
} from "../lib/cms/inline.mjs";

describe("inline edit — field specs", () => {
  it("exposes the expected editable fields per type; unknown types are not editable", () => {
    expect(getInlineFields("event").map((f) => f.key)).toEqual(["title", "summary", "location", "body"]);
    expect(getInlineFields("achievement").map((f) => f.key)).toEqual(["title", "summary", "category"]);
    // club + council share the club_profile shape
    expect(getInlineFields("club_profile").map((f) => f.key)).toEqual(["vision", "instagramUrl"]);
    expect(getInlineFields("council_profile")).toEqual(INLINE_FIELD_SPECS.club_profile);
    expect(getInlineFields("hostel_profile")).toEqual([]);
    expect(getInlineFields("unknown")).toEqual([]);
    expect(isInlineEditable("event")).toBe(true);
    expect(isInlineEditable("hostel_profile")).toBe(false);
  });
});

describe("inline edit — buildEditPatch", () => {
  it("maps title/summary to revision scalars and payload.* into a payload object; trims; empties → null", () => {
    const patch = buildEditPatch("event", { title: "  Hack Night  ", summary: "", location: "LT-1", body: "Bring a laptop" });
    expect(patch.title).toBe("Hack Night");
    expect(patch.summary).toBe(null); // an emptied optional scalar clears it
    expect(patch.payload).toEqual({ location: "LT-1", body: "Bring a laptop" });
    expect(patch.changeNote).toMatch(/inline/i);
  });

  it("only includes fields present in the values map (partial edit)", () => {
    const patch = buildEditPatch("event", { location: "New venue" });
    expect(patch).not.toHaveProperty("title");
    expect(patch).not.toHaveProperty("summary");
    expect(patch.payload).toEqual({ location: "New venue" });
  });

  it("NEVER blanks a required scalar (title): a blank title is omitted, not written empty", () => {
    const patch = buildEditPatch("event", { title: "   " });
    expect(patch).not.toHaveProperty("title");
    expect(patchHasChanges(patch)).toBe(false); // nothing to save
  });

  it("clears an optional payload field when emptied", () => {
    const patch = buildEditPatch("club_profile", { vision: "Build cool things", instagramUrl: "" });
    expect(patch.payload).toEqual({ vision: "Build cool things", instagramUrl: null });
  });
});

describe("inline edit — patchHasChanges", () => {
  it("is true only when a scalar or a payload field is present", () => {
    expect(patchHasChanges({ changeNote: "x" })).toBe(false);
    expect(patchHasChanges({ changeNote: "x", payload: {} })).toBe(false);
    expect(patchHasChanges({ title: "T", changeNote: "x" })).toBe(true);
    expect(patchHasChanges({ payload: { category: "Sports" }, changeNote: "x" })).toBe(true);
  });
});
