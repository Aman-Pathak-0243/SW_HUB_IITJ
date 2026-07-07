import { describe, it, expect } from "vitest";
import {
  MEMBERSHIP_STATUSES,
  MEMBERSHIP_STATUS_SET,
  normalizeMembershipRole,
  parseMembershipCsv,
} from "../lib/memberships/forms.mjs";
import {
  shapeMembership,
  encodeMembershipCursor,
  decodeMembershipCursor,
} from "../lib/memberships/service.mjs";
import { getContentTypeDef, getContentTypeHandler } from "../lib/cms/content-types.mjs";
import { isCentralAnnouncement } from "../lib/events/public.mjs";
import { shapeDoc } from "../lib/org/docs.mjs";

describe("memberships: forms (pure, client-safe)", () => {
  it("declares the status vocabulary", () => {
    expect(MEMBERSHIP_STATUSES).toEqual(["active", "inactive"]);
    expect(MEMBERSHIP_STATUS_SET.has("active")).toBe(true);
    expect(MEMBERSHIP_STATUS_SET.has("banned")).toBe(false);
  });

  it("normalizeMembershipRole trims, caps length, and nulls empties", () => {
    expect(normalizeMembershipRole("  Volunteer  ")).toBe("Volunteer");
    expect(normalizeMembershipRole("")).toBeNull();
    expect(normalizeMembershipRole(null)).toBeNull();
    expect(normalizeMembershipRole("x".repeat(200)).length).toBe(80);
  });
});

describe("memberships: parseMembershipCsv (idempotent-friendly, DL-075)", () => {
  it("parses email[,role] rows and lowercases the email", () => {
    const { rows, errors } = parseMembershipCsv("2023UME0243@iitjammu.ac.in,Member");
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ email: "2023ume0243@iitjammu.ac.in", role: "Member" }]);
  });

  it("skips a header row whose first cell is exactly 'email'", () => {
    const { rows } = parseMembershipCsv("email,role\na@b.co,Lead");
    expect(rows).toEqual([{ email: "a@b.co", role: "Lead" }]);
  });

  it("reports invalid emails and in-file duplicates (keeps the first)", () => {
    const { rows, errors } = parseMembershipCsv("a@b.co\nnope\na@b.co");
    expect(rows).toEqual([{ email: "a@b.co" }]);
    expect(errors).toHaveLength(2);
    expect(errors[0].reason).toMatch(/Invalid email/);
    expect(errors[1].reason).toMatch(/Duplicate/);
  });

  it("ignores blank lines", () => {
    const { rows } = parseMembershipCsv("\n a@b.co \n\n c@d.co \n");
    expect(rows.map((r) => r.email)).toEqual(["a@b.co", "c@d.co"]);
  });

  it("reports the TRUE file line number for a bad row even after blank/header lines", () => {
    // two blank lines + a header, so the invalid 'nope' row is on file line 5.
    const { rows, errors } = parseMembershipCsv("\n\nemail,role\na@b.co,Member\nnope");
    expect(rows).toEqual([{ email: "a@b.co", role: "Member" }]);
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(5);
  });
});

describe("memberships: shapeMembership (JSON-safe)", () => {
  it("serializes dates to ISO strings and surfaces the user email", () => {
    const shaped = shapeMembership({
      id: "m1",
      userId: "u1",
      user: { email: "s@iitjammu.ac.in", name: "Stu", status: "active" },
      orgUnitLineageKey: "lin-1",
      role: "Member",
      status: "active",
      joinedAt: new Date("2026-01-02T03:04:05.000Z"),
      createdAt: new Date("2026-01-02T03:04:05.000Z"),
    });
    expect(shaped).toMatchObject({
      id: "m1", userId: "u1", userEmail: "s@iitjammu.ac.in", userName: "Stu",
      orgUnitLineageKey: "lin-1", role: "Member", status: "active",
    });
    expect(shaped.joinedAt).toBe("2026-01-02T03:04:05.000Z");
    expect(shapeMembership(null)).toBeNull();
  });
});

describe("memberships: keyset cursor round-trip", () => {
  it("encodes then decodes createdAt+id", () => {
    const row = { id: "abc", createdAt: new Date("2026-02-03T00:00:00.000Z") };
    const cur = encodeMembershipCursor(row);
    const dec = decodeMembershipCursor(cur);
    expect(dec.id).toBe("abc");
    expect(dec.createdAt.toISOString()).toBe("2026-02-03T00:00:00.000Z");
  });
  it("rejects a malformed cursor", () => {
    expect(() => decodeMembershipCursor(Buffer.from("garbage", "utf8").toString("base64url"))).toThrow();
  });
});

describe("M3 content: club_doc content type (reuses page_block_payload, DL-076)", () => {
  it("is a year-scoped, ORG-BOUND type backed by page_block_payload with a handler", () => {
    const def = getContentTypeDef("club_doc");
    expect(def).toBeTruthy();
    expect(def.isYearScoped).toBe(true);
    expect(def.isOrgBound).toBe(true);
    expect(def.payloadTable).toBe("page_block_payload");
    expect(getContentTypeHandler("club_doc")).toBeTruthy();
  });

  it("shapeDoc surfaces the raw markdown body + title (rendered safely at the UI)", () => {
    const doc = shapeDoc({
      item: { id: "d1", slug: "charter", publishedAt: new Date("2026-03-01T00:00:00.000Z") },
      payload: { blockKind: "markdown", body: "# Charter\n\n**rules**" },
      rev: { title: "Charter", summary: null },
    });
    expect(doc).toMatchObject({ id: "d1", slug: "charter", title: "Charter", body: "# Charter\n\n**rules**" });
    expect(doc.updatedAt).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("M3 announcements: isCentralAnnouncement (DL-078)", () => {
  it("a central announcement (no org unit) is always on the central board", () => {
    expect(isCentralAnnouncement({ orgUnitId: null }, { syncToCentral: false })).toBe(true);
  });
  it("a club announcement is central ONLY when it opted into sync", () => {
    expect(isCentralAnnouncement({ orgUnitId: "club-1" }, { syncToCentral: true })).toBe(true);
    expect(isCentralAnnouncement({ orgUnitId: "club-1" }, { syncToCentral: false })).toBe(false);
    expect(isCentralAnnouncement({ orgUnitId: "club-1" }, {})).toBe(false);
  });
});
