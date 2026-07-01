// Static (no-DB) unit tests for the M5 Centralized Event Playground PURE helpers
// (lib/events/forms.mjs) + the CSV builders (lib/events/csv.mjs). These mirror the
// server rules (DL-051) so the client + server never drift; the live behavior is in
// tests/m5.db.test.mjs.
import { describe, it, expect } from "vitest";
import {
  normalizeEventPayload,
  organizerTargetKind,
  normalizeOrganizerKind,
  normalizeOrganizerRole,
  normalizeEntityInput,
  validateRoundInput,
  normalizeCapacity,
  isRegistrationOpen,
  registrationOutcome,
  normalizeRegistrationStatus,
  normalizePoints,
  normalizeBudget,
  normalizeReportBody,
  rankEntries,
  EVENT_ORGANIZER_KINDS,
} from "../lib/events/forms.mjs";
import { csvCell, toCsv, participantsToCsv, scoresToCsv } from "../lib/events/csv.mjs";

describe("M5 forms — normalizeEventPayload (coercePayload hook)", () => {
  it("normalizes hybrid blocks + trims markdown/text fields, passes other scalars through", () => {
    const out = normalizeEventPayload({
      body: "raw body",
      eventDate: new Date("2026-05-01"),
      category: "  Hackathon  ",
      problemStatement: "# Problem\nsolve it",
      eligibility: "Open to all UG students",
      blocks: [{ kind: "markdown", body: "hi" }, { kind: "link", url: "https://x.org", label: "L" }],
    });
    expect(out.body).toBe("raw body"); // untouched
    expect(out.eventDate).toBeInstanceOf(Date);
    expect(out.category).toBe("Hackathon"); // trimmed
    expect(out.problemStatement).toContain("# Problem");
    expect(out.blocks).toHaveLength(2);
    expect(out.blocks[1]).toEqual({ kind: "link", url: "https://x.org", label: "L" });
  });

  it("omits blocks when not provided (leaves stored value on edit)", () => {
    const out = normalizeEventPayload({ body: "x" });
    expect("blocks" in out).toBe(false);
  });

  it("rejects a malformed block (a banner with no media) with a 422", () => {
    expect(() => normalizeEventPayload({ blocks: [{ kind: "banner" }] })).toThrow(/media/i);
  });

  it("rejects an unsafe link url in a block", () => {
    expect(() => normalizeEventPayload({ blocks: [{ kind: "link", url: "javascript:alert(1)" }] })).toThrow(/unsafe|unsupported/i);
  });
});

describe("M5 forms — organizer tagging (one-target)", () => {
  it("resolves the single target kind", () => {
    expect(organizerTargetKind({ orgUnitLineageKey: "abc" })).toBe("club");
    expect(organizerTargetKind({ entityId: "e1" })).toBe("entity");
    expect(organizerTargetKind({ email: "a@iitjammu.ac.in" })).toBe("user");
    expect(organizerTargetKind({ userId: "u1" })).toBe("user");
  });
  it("throws when more than one target is present", () => {
    expect(() => organizerTargetKind({ orgUnitLineageKey: "a", entityId: "b" })).toThrow(/exactly one/i);
  });
  it("throws when no target is present", () => {
    expect(() => organizerTargetKind({})).toThrow(/needs/i);
  });
  it("normalizes kind (default organizer; rejects unknown)", () => {
    expect(normalizeOrganizerKind()).toBe("organizer");
    expect(normalizeOrganizerKind("collaborator")).toBe("collaborator");
    expect(EVENT_ORGANIZER_KINDS).toContain("collaborator");
    expect(() => normalizeOrganizerKind("sponsor")).toThrow();
  });
  it("normalizes a role label", () => {
    expect(normalizeOrganizerRole("  Lead  ")).toBe("Lead");
    expect(normalizeOrganizerRole("")).toBe(null);
  });
});

describe("M5 forms — entities + rounds", () => {
  it("requires a name for a custom entity", () => {
    expect(() => normalizeEntityInput({})).toThrow(/name/i);
    expect(normalizeEntityInput({ name: " Syndicate X ", kind: "syndicate" })).toEqual({ name: "Syndicate X", kind: "syndicate", description: null });
  });
  it("validates a round (name required on create; roundNo positive int)", () => {
    expect(() => validateRoundInput({}, { isCreate: true })).toThrow(/name/i);
    expect(validateRoundInput({ name: "Prelims" }, { isCreate: true }).name).toBe("Prelims");
    expect(() => validateRoundInput({ name: "x", roundNo: 0 })).toThrow(/positive/i);
    expect(() => validateRoundInput({ name: "x", startsAt: "not-a-date" })).toThrow(/valid date/i);
  });
});

describe("M5 forms — capacity, registration window + outcome", () => {
  it("normalizes capacity (int >= 0, null = unlimited, undefined = leave)", () => {
    expect(normalizeCapacity(undefined)).toBe(undefined);
    expect(normalizeCapacity("")).toBe(null);
    expect(normalizeCapacity(null)).toBe(null);
    expect(normalizeCapacity("50")).toBe(50);
    expect(() => normalizeCapacity(-1)).toThrow();
    expect(() => normalizeCapacity(2.5)).toThrow();
  });

  it("isRegistrationOpen honors the closed flag + the window", () => {
    const now = new Date("2026-05-10T12:00:00Z");
    expect(isRegistrationOpen({}, now)).toBe(true); // no restrictions
    expect(isRegistrationOpen({ registrationClosed: true }, now)).toBe(false);
    expect(isRegistrationOpen({ registrationOpensAt: "2026-05-11T00:00:00Z" }, now)).toBe(false); // not yet
    expect(isRegistrationOpen({ registrationClosesAt: "2026-05-09T00:00:00Z" }, now)).toBe(false); // ended
    expect(isRegistrationOpen({ registrationOpensAt: "2026-05-01T00:00:00Z", registrationClosesAt: "2026-05-20T00:00:00Z" }, now)).toBe(true);
  });

  it("registrationOutcome sends over-capacity registrations to the waitlist", () => {
    expect(registrationOutcome(0, null)).toBe("confirmed"); // unlimited
    expect(registrationOutcome(5, 10)).toBe("confirmed");
    expect(registrationOutcome(10, 10)).toBe("waitlisted"); // full
    expect(registrationOutcome(11, 10)).toBe("waitlisted");
  });

  it("normalizes a registration status (rejects unknown)", () => {
    expect(normalizeRegistrationStatus("confirmed")).toBe("confirmed");
    expect(() => normalizeRegistrationStatus("pending")).toThrow();
  });
});

describe("M5 forms — scores, budget, closure", () => {
  it("normalizePoints requires a finite number", () => {
    expect(normalizePoints("42.5")).toBe(42.5);
    expect(normalizePoints(-3)).toBe(-3);
    expect(() => normalizePoints("abc")).toThrow();
    expect(() => normalizePoints(Infinity)).toThrow();
  });
  it("normalizeBudget: non-negative or null/undefined", () => {
    expect(normalizeBudget(undefined)).toBe(undefined);
    expect(normalizeBudget("")).toBe(null);
    expect(normalizeBudget("1500.50")).toBe(1500.5);
    expect(() => normalizeBudget(-1)).toThrow();
  });
  it("normalizeReportBody requires a non-empty write-up", () => {
    expect(() => normalizeReportBody("  ")).toThrow();
    expect(normalizeReportBody("We ran three rounds.")).toContain("three rounds");
  });
});

describe("M5 forms — rankEntries (standard competition rank)", () => {
  it("sorts by points DESC and assigns 1,2,2,4 with ties (skip after a tie)", () => {
    const ranked = rankEntries([
      { userId: "a", points: 10 },
      { userId: "b", points: 30 },
      { userId: "c", points: 20 },
      { userId: "d", points: 20 },
    ]);
    expect(ranked.map((r) => [r.userId, r.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["d", 2],
      ["a", 4],
    ]);
  });
  it("is deterministic on a full tie (stable by userId)", () => {
    const ranked = rankEntries([{ userId: "y", points: 5 }, { userId: "x", points: 5 }]);
    expect(ranked.map((r) => r.userId)).toEqual(["x", "y"]);
    expect(ranked.every((r) => r.rank === 1)).toBe(true);
  });
});

describe("M5 csv — pure builders (RFC-4180-ish quoting)", () => {
  it("quotes fields with commas / quotes / newlines and doubles quotes", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(true)).toBe("true");
  });
  it("toCsv writes a header + rows", () => {
    const csv = toCsv([{ key: "a", label: "A" }, { key: "b", label: "B" }], [{ a: 1, b: 2 }, { a: 3, b: "x,y" }]);
    expect(csv.split("\n")).toEqual(["A,B", "1,2", '3,"x,y"']);
  });
  it("participantsToCsv + scoresToCsv include the expected headers", () => {
    expect(participantsToCsv([]).split("\n")[0]).toBe("Name,Email,Status,Team,Registered At");
    expect(scoresToCsv([{ userName: "Z", userEmail: "z@x.org", round: "Overall", points: 9, note: "" }]).split("\n")[1]).toBe("Z,z@x.org,Overall,9,");
  });
});
