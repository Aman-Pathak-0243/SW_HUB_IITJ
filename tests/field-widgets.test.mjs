// Session 15 — the editor WIDGET layer and the static image index.
//
// The guarantee worth protecting here is COVERAGE: every payload scalar a content
// type declares must appear in the editor, in primary or advanced. A field dropped
// from lib/cms/field-widgets.mjs would silently become unreachable through the UI
// (editable only by API/CLI), which is exactly the failure mode the "simplify the
// forms" work could have introduced, so it is asserted against the LIVE registry
// rather than a fixture.
import { describe, it, expect } from "vitest";
import { CONTENT_TYPE_DEFS, getContentTypeFieldSpec } from "../lib/cms/content-types.mjs";
import { getEditorSpec, buildPayloadPatch, coerceWidgetValue, labelize, isMediaField, WIDGETS, OMIT } from "../lib/cms/field-widgets.mjs";
import { scoreStaticPath, searchIndex, isStaticImage, toWebPath, STATIC_IMAGE_EXTS } from "../lib/media/static-index.mjs";

describe("editor spec: coverage over the live content-type registry", () => {
  it("places every payload scalar of every content type in exactly one section", () => {
    for (const def of CONTENT_TYPE_DEFS) {
      const fs = getContentTypeFieldSpec(def.contentType);
      const spec = getEditorSpec(def.contentType, fs.scalarFields, fs.requiredFields);
      const placed = [...spec.primary, ...spec.advanced].map((d) => d.field);
      // no field lost
      expect(new Set(placed)).toEqual(new Set(fs.scalarFields));
      // and none duplicated across the two sections
      expect(placed).toHaveLength(fs.scalarFields.length);
    }
  });

  it("only ever emits a known widget", () => {
    for (const def of CONTENT_TYPE_DEFS) {
      const fs = getContentTypeFieldSpec(def.contentType);
      const spec = getEditorSpec(def.contentType, fs.scalarFields, fs.requiredFields);
      for (const d of [...spec.primary, ...spec.advanced]) {
        expect(WIDGETS).toContain(d.widget);
      }
    }
  });

  it("marks a type's required payload fields as required", () => {
    // announcement.body is NOT NULL in announcement_payload.
    const fs = getContentTypeFieldSpec("announcement");
    const spec = getEditorSpec("announcement", fs.scalarFields, fs.requiredFields);
    const body = spec.primary.find((d) => d.field === "body");
    expect(body.required).toBe(true);
    expect(spec.primary.find((d) => d.field === "audience").required).toBe(false);
  });
});

describe("editor spec: the three simplified pages", () => {
  const specFor = (t) => {
    const fs = getContentTypeFieldSpec(t);
    return getEditorSpec(t, fs.scalarFields, fs.requiredFields);
  };

  it("puts the announcement schedule window behind Advanced, not in the main form", () => {
    const spec = specFor("announcement");
    expect(spec.primary.map((d) => d.field)).toEqual(["body", "coverMediaId", "audience", "syncToCentral"]);
    expect(spec.advanced.map((d) => d.field)).toEqual(["publishFrom", "publishUntil"]);
  });

  it("gives the announcement image a picker and the boolean a checkbox", () => {
    const byField = Object.fromEntries(specFor("announcement").primary.map((d) => [d.field, d]));
    expect(byField.coverMediaId.widget).toBe("media");
    expect(byField.syncToCentral.widget).toBe("checkbox");
    expect(byField.audience.widget).toBe("select");
    expect(byField.audience.options).toContain("public");
    expect(byField.body.widget).toBe("textarea");
  });

  it("keeps the flagship event form to three fields with a poster picker", () => {
    const spec = specFor("flagship_event");
    expect(spec.primary.map((d) => d.field)).toEqual(["description", "imageMediaId", "category"]);
    expect(spec.advanced).toHaveLength(0);
    expect(spec.primary.find((d) => d.field === "imageMediaId").widget).toBe("media");
  });

  it("hides the achievement block JSON behind Advanced and dates the rest", () => {
    const spec = specFor("achievement");
    expect(spec.primary.map((d) => d.field)).toEqual(["category", "achievementDate", "heroMediaId"]);
    expect(spec.advanced.map((d) => d.field)).toEqual(["blocks"]);
    expect(spec.primary.find((d) => d.field === "achievementDate").widget).toBe("date");
    expect(spec.advanced[0].widget).toBe("json");
  });

  it("leaves a type with no spec on the flat all-primary form (no behaviour change)", () => {
    const spec = specFor("club_profile");
    expect(spec.hasSpec).toBe(false);
    expect(spec.advanced).toHaveLength(0);
    // ...but a *MediaId still gets a picker rather than a UUID text box.
    expect(spec.primary.find((d) => d.field === "logoMediaId").widget).toBe("media");
    expect(spec.primary.find((d) => d.field === "instagramUrl").widget).toBe("text");
  });
});

describe("widget value coercion", () => {
  const text = { field: "category", widget: "text" };
  const check = { field: "syncToCentral", widget: "checkbox" };
  const json = { field: "blocks", widget: "json" };

  it("omits a field the editor never touched, but NULLS one that was emptied", () => {
    // The old form dropped empty strings from the patch, so a value that had been
    // set could never be cleared through the UI.
    expect(coerceWidgetValue(text, undefined)).toBe(OMIT);
    expect(coerceWidgetValue(text, "")).toBeNull();
    expect(coerceWidgetValue(text, "   ")).toBeNull();
    expect(coerceWidgetValue(text, "Sports")).toBe("Sports");
  });

  it("sends a checkbox as a real boolean, including when unchecked", () => {
    expect(coerceWidgetValue(check, true)).toBe(true);
    // false must survive as false, not be omitted — otherwise un-ticking
    // "show on the central board" would never persist.
    expect(coerceWidgetValue(check, false)).toBe(false);
    expect(coerceWidgetValue(check, undefined)).toBe(false);
  });

  it("parses a json widget and reports the field on a syntax error", () => {
    expect(coerceWidgetValue(json, '[{"kind":"markdown"}]')).toEqual([{ kind: "markdown" }]);
    try {
      coerceWidgetValue(json, "[{nope}");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e.field).toBe("blocks");
      expect(e.message).toMatch(/valid JSON/i);
    }
  });

  it("builds a whole patch, omitting only untouched fields", () => {
    const patch = buildPayloadPatch([text, check, json], { category: "Sports", syncToCentral: false });
    expect(patch).toEqual({ category: "Sports", syncToCentral: false });
    expect("blocks" in patch).toBe(false);
  });
});

// Sending null for a cleared field is right for a nullable column and WRONG for a
// NOT NULL one, where it trades a UI gap for a database constraint error. These
// pin the three cases apart.
describe("widget coercion respects NOT NULL columns", () => {
  const specFor = (t) => {
    const fs = getContentTypeFieldSpec(t);
    return getEditorSpec(t, fs.scalarFields, fs.requiredFields);
  };

  it("omits an emptied NOT NULL-with-default field instead of nulling it", () => {
    // announcement_payload.audience is `AudienceType @default(public)` and NOT NULL.
    const audience = specFor("announcement").primary.find((d) => d.field === "audience");
    expect(audience.notNull).toBe(true);
    expect(coerceWidgetValue(audience, "")).toBe(OMIT);
    expect(coerceWidgetValue(audience, "students")).toBe("students");
  });

  it("refuses to post null for an emptied REQUIRED field, reporting it inline", () => {
    // announcement_payload.body is NOT NULL with no default.
    const body = specFor("announcement").primary.find((d) => d.field === "body");
    expect(body.required).toBe(true);
    try {
      coerceWidgetValue(body, "   ");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e.field).toBe("body");
      expect(e.message).toMatch(/required/i);
    }
  });

  it("still nulls an emptied NULLABLE field so it can be unset", () => {
    const category = specFor("flagship_event").primary.find((d) => d.field === "category");
    expect(category.required).toBe(false);
    expect(category.notNull).toBe(false);
    expect(coerceWidgetValue(category, "")).toBeNull();
  });

  it("marks every NOT NULL payload scalar as required or notNull", () => {
    // The guard for the whole class of bug: a NOT NULL column that is neither
    // `required` nor `notNull` would receive null from a cleared input and blow up
    // at the database. Verified against prisma/schema.prisma.
    const notNullColumns = {
      announcement: ["body", "audience"],
      event: ["audience"],
      resource: ["resourceKind"],
      page_block: ["blockKind"],
      club_doc: ["blockKind"],
      team_page: ["blockKind"],
      events_organized: ["blockKind"],
    };
    for (const [contentType, fields] of Object.entries(notNullColumns)) {
      const spec = specFor(contentType);
      const all = [...spec.primary, ...spec.advanced];
      for (const field of fields) {
        const d = all.find((x) => x.field === field);
        expect(d, `${contentType}.${field} missing from the editor spec`).toBeTruthy();
        expect(d.required || d.notNull, `${contentType}.${field} would send null to a NOT NULL column`).toBe(true);
      }
    }
  });
});

describe("labels and media detection", () => {
  it("humanizes a camelCase field name", () => {
    expect(labelize("publishFrom")).toBe("Publish From");
    expect(labelize("body")).toBe("Body");
  });
  it("recognizes the *MediaId foreign keys", () => {
    expect(isMediaField("coverMediaId")).toBe(true);
    expect(isMediaField("heroMediaId")).toBe(true);
    expect(isMediaField("category")).toBe(false);
    // Deliberately case-sensitive on the suffix: it matches the `*MediaId` naming
    // the payload columns use, not any field that merely mentions media.
    expect(isMediaField("mediaId")).toBe(false);
    expect(isMediaField("mediaIdList")).toBe(false);
  });
});

describe("static image index: ranking", () => {
  it("offers only image extensions", () => {
    expect(isStaticImage("a.JPG")).toBe(true);
    expect(isStaticImage("a.jpeg")).toBe(true);
    expect(isStaticImage("a.svg")).toBe(true);
    expect(isStaticImage("a.webp")).toBe(true);
    expect(isStaticImage("report.pdf")).toBe(false);
    expect(isStaticImage("your_file.xlsx")).toBe(false);
    expect(STATIC_IMAGE_EXTS).toContain(".png");
  });

  it("treats spaces, hyphens, underscores and dots as the same separator", () => {
    // public/ mixes all of these: "PIC coding.JPG" vs "priyanka-ramchandani.jpeg" vs
    // "prasant-singh.jpeg", so a human query must not have to guess which.
    expect(scoreStaticPath("/images/people/prasant-singh.jpeg", "prasant singh")).toBeGreaterThan(0);
    expect(scoreStaticPath("/images/people/priyanka-ramchandani.jpeg", "priyanka ramchandani")).toBeGreaterThan(0);
    expect(scoreStaticPath("/PIC coding.JPG", "pic-coding")).toBeGreaterThan(0);
  });

  it("ranks an exact basename above a prefix, a substring, then a path-only hit", () => {
    const exact = scoreStaticPath("/nitin joshi.jpg", "nitin joshi");
    const prefix = scoreStaticPath("/nitin joshi portrait.jpg", "nitin joshi");
    const substring = scoreStaticPath("/dr nitin joshi ad.jpg", "nitin joshi");
    const pathOnly = scoreStaticPath("/nitin-joshi/photo.jpg", "nitin joshi");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(pathOnly);
    expect(pathOnly).toBeGreaterThan(0);
  });

  it("requires EVERY query term to appear somewhere in the path", () => {
    expect(scoreStaticPath("/coding.jpg", "coding club")).toBe(0);
    expect(scoreStaticPath("/coding club.jpg", "coding club")).toBeGreaterThan(0);
  });

  it("scores nothing for an empty query", () => {
    expect(scoreStaticPath("/a.jpg", "")).toBe(0);
    expect(scoreStaticPath("/a.jpg", "   ")).toBe(0);
  });

  it("searchIndex sorts by score then path, and caps the result count", () => {
    const entries = [
      { path: "/dr nitin joshi ad.jpg" },
      { path: "/nitin joshi.jpg" },
      { path: "/nitin joshi portrait.jpg" },
      { path: "/unrelated.jpg" },
    ];
    const out = searchIndex(entries, "nitin joshi", { limit: 10 });
    expect(out.map((e) => e.path)).toEqual([
      "/nitin joshi.jpg",
      "/nitin joshi portrait.jpg",
      "/dr nitin joshi ad.jpg",
    ]);
    expect(searchIndex(entries, "nitin joshi", { limit: 2 })).toHaveLength(2);
  });

  it("browses (does not return nothing) when the query is empty", () => {
    // The picker opens with no query — it must show something to click.
    const entries = [{ path: "/a.jpg" }, { path: "/b.jpg" }, { path: "/c.jpg" }];
    expect(searchIndex(entries, "", { limit: 2 })).toHaveLength(2);
  });

  it("builds a forward-slash web path regardless of platform separators", () => {
    // The stored originalPath must match the strings in lib/org/data/* on both a
    // Windows dev box and the Linux VM.
    const root = ["", "srv", "app", "public"].join("/");
    expect(toWebPath(`${root}/images-2026-27-v1/a.jpg`, root)).toBe("/images-2026-27-v1/a.jpg");
    expect(toWebPath(`${root}/a.jpg`, root)).toBe("/a.jpg");
  });
});
