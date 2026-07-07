// M6 (DL-090) — static tests for the PURE, client-safe member-profile / contribution
// helpers (lib/member/summary.mjs) + the admin nav registration. No DB: these lock the
// split / category-map / totals / identity logic the Server-Component reads and the
// presentation layer both depend on (DL-051 "one authority, mirrored").
import { describe, it, expect } from "vitest";
import {
  SYNDICATE_TYPE_KEY,
  pickSyndicate,
  classifyEventInvolvement,
  splitMemberEvents,
  categoryBreakdown,
  participationSummary,
  formatIdentity,
  contributionTotals,
} from "../lib/member/summary.mjs";
import { ADMIN_MODULE_BY_KEY } from "../lib/admin/nav.mjs";
import { PERMISSIONS } from "../lib/rbac/permissions.mjs";

const at = (iso) => ({ eventDate: iso });

describe("pickSyndicate", () => {
  it("returns the first syndicate-typed affiliation", () => {
    const affs = [
      { orgUnitLineageKey: "a", typeKey: "club", name: "Robotics" },
      { orgUnitLineageKey: "b", typeKey: SYNDICATE_TYPE_KEY, name: "Alpha Syndicate" },
    ];
    expect(pickSyndicate(affs)?.name).toBe("Alpha Syndicate");
  });
  it("returns null when there is no syndicate affiliation (the default today)", () => {
    expect(pickSyndicate([{ typeKey: "club" }, { typeKey: "council" }])).toBeNull();
    expect(pickSyndicate([])).toBeNull();
    expect(pickSyndicate(undefined)).toBeNull();
  });
});

describe("classifyEventInvolvement", () => {
  const now = new Date("2026-07-01T00:00:00Z");
  it("dated future → upcoming; dated past → past", () => {
    expect(classifyEventInvolvement(at("2026-08-01T00:00:00Z"), now)).toBe("upcoming");
    expect(classifyEventInvolvement(at("2026-06-01T00:00:00Z"), now)).toBe("past");
  });
  it("an event dated exactly now is upcoming (>= now)", () => {
    expect(classifyEventInvolvement(at("2026-07-01T00:00:00Z"), now)).toBe("upcoming");
  });
  it("undated → upcoming only while actively registered, else past", () => {
    expect(classifyEventInvolvement({ eventDate: null, registration: { status: "confirmed" } }, now)).toBe("upcoming");
    expect(classifyEventInvolvement({ eventDate: null, registration: null }, now)).toBe("past");
    expect(classifyEventInvolvement({ eventDate: null }, now)).toBe("past");
  });
  it("null input is treated as past (defensive)", () => {
    expect(classifyEventInvolvement(null, now)).toBe("past");
  });
});

describe("splitMemberEvents", () => {
  const now = new Date("2026-07-01T00:00:00Z");
  it("splits + orders: upcoming soonest-first (undated last), past most-recent-first", () => {
    const events = [
      { eventItemId: "p1", eventDate: "2026-05-01T00:00:00Z" },
      { eventItemId: "u2", eventDate: "2026-09-01T00:00:00Z" },
      { eventItemId: "u1", eventDate: "2026-08-01T00:00:00Z" },
      { eventItemId: "p2", eventDate: "2026-06-15T00:00:00Z" },
      { eventItemId: "uUndated", eventDate: null, registration: { status: "waitlisted" } },
    ];
    const { upcoming, past } = splitMemberEvents(events, now);
    expect(upcoming.map((e) => e.eventItemId)).toEqual(["u1", "u2", "uUndated"]);
    expect(past.map((e) => e.eventItemId)).toEqual(["p2", "p1"]);
  });
  it("handles empty / non-array input", () => {
    expect(splitMemberEvents([], now)).toEqual({ upcoming: [], past: [] });
    expect(splitMemberEvents(undefined, now)).toEqual({ upcoming: [], past: [] });
  });
});

describe("categoryBreakdown", () => {
  it("groups by category, counts, folds blank → Uncategorized, sorts count desc then A→Z", () => {
    const events = [
      { category: "Hackathon" },
      { category: "Quiz" },
      { category: "Hackathon" },
      { category: null },
      { category: "  " },
      { category: "Quiz" },
      { category: "Hackathon" },
    ];
    expect(categoryBreakdown(events)).toEqual([
      { category: "Hackathon", count: 3 },
      { category: "Quiz", count: 2 },
      { category: "Uncategorized", count: 2 },
    ]);
  });
  it("ties break alphabetically", () => {
    expect(categoryBreakdown([{ category: "Beta" }, { category: "Alpha" }])).toEqual([
      { category: "Alpha", count: 1 },
      { category: "Beta", count: 1 },
    ]);
  });
  it("empty input → []", () => {
    expect(categoryBreakdown([])).toEqual([]);
  });
});

describe("participationSummary", () => {
  const now = new Date("2026-07-01T00:00:00Z");
  it("counts total / upcoming / past / attended / scored / registered", () => {
    const events = [
      { eventDate: "2026-08-01T00:00:00Z", registration: { status: "confirmed" }, attended: false, points: null },
      { eventDate: "2026-06-01T00:00:00Z", registration: { status: "confirmed" }, attended: true, points: 42 },
      { eventDate: "2026-05-01T00:00:00Z", registration: null, attended: true, points: 0 },
    ];
    expect(participationSummary(events, now)).toEqual({
      total: 3,
      upcoming: 1,
      past: 2,
      attended: 2,
      scored: 2, // points 42 and 0 both count as scored (0 is a real score, only null is "not scored")
      registered: 2,
    });
  });
});

describe("formatIdentity", () => {
  it("formats a parsed institute identity", () => {
    expect(formatIdentity({ year: 2023, level: "ug", branch: "me", serial: "0243" })).toBe("UG · ME · 2023");
  });
  it("null identity → null", () => {
    expect(formatIdentity(null)).toBeNull();
  });
  it("tolerates partial identity", () => {
    expect(formatIdentity({ year: 2024 })).toBe("2024");
  });
});

describe("contributionTotals", () => {
  it("touchpoints = organized + participated + achievements + roles (reach metrics excluded)", () => {
    const c = {
      eventsOrganized: { count: 2 },
      eventsParticipated: { count: 5 },
      achievements: { count: 3 },
      roles: { count: 1 },
      members: { count: 40 },
      participantsReached: { count: 120 },
    };
    const t = contributionTotals(c);
    expect(t.touchpoints).toBe(11);
    expect(t.members).toBe(40);
    expect(t.participantsReached).toBe(120);
  });
  it("missing sections default to 0", () => {
    const t = contributionTotals({});
    expect(t).toMatchObject({ eventsOrganized: 0, eventsParticipated: 0, achievements: 0, roles: 0, members: 0, participantsReached: 0, touchpoints: 0 });
    expect(contributionTotals(null).touchpoints).toBe(0);
  });
});

describe("M6 admin nav + no new permission", () => {
  it("registers the Contribution module gated on user.read", () => {
    const mod = ADMIN_MODULE_BY_KEY.contribution;
    expect(mod).toBeTruthy();
    expect(mod.href).toBe("/admin/contribution");
    expect(mod.anyOf).toEqual(["user.read"]);
  });
  it("adds NO new permission (self-data + user.read) — the catalog stays at 52", () => {
    expect(PERMISSIONS.length).toBe(52);
  });
});
