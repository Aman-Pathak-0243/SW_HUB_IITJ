// Static unit tests for the Session-8 Developer Console — the PURE filter / format
// / report / cost logic. No DB → default-green. The live audit-reader / status /
// backup behavior is covered by tests/devconsole.db.test.mjs.
import { describe, it, expect } from "vitest";
import {
  AUDIT_ACTIONS,
  clampTake,
  parseDateInput,
  normalizeAuditFilters,
  buildAuditWhere,
  shapeAuditEntry,
  summarizeByKey,
  compareByCountThenKey,
  getAuditStats,
} from "../lib/devconsole/audit.mjs";
import {
  classifyLatency,
  diffMigrations,
  summarizeTransitionRuns,
  shapeTransitionRun,
} from "../lib/devconsole/status.mjs";
import {
  parseTokenUsage,
  summarizeTokenUsage,
  estimateBuildCost,
  estimateInfraCost,
  NEON_FREE_STORAGE_BYTES,
  CLOUDINARY_FREE_CREDITS,
  TEST_SUITES,
} from "../lib/devconsole/reports.mjs";
import { shapeBackup } from "../lib/devconsole/backups.mjs";
import { CmsValidationError } from "../lib/cms/errors.mjs";

// ── audit reader: pure helpers ───────────────────────────────────────────────

describe("audit clampTake", () => {
  it("defaults NaN / absent / non-positive to the default", () => {
    expect(clampTake(undefined)).toBe(50);
    expect(clampTake("abc")).toBe(50);
    expect(clampTake(0)).toBe(50);
    expect(clampTake(-5)).toBe(50);
  });
  it("clamps to the max and floors fractional", () => {
    expect(clampTake(10)).toBe(10);
    expect(clampTake(9999)).toBe(200);
    expect(clampTake(12.9)).toBe(12);
    expect(clampTake(7, 25, 100)).toBe(7);
  });
});

describe("audit parseDateInput", () => {
  it("accepts Date, ISO string, and epoch ms; rejects junk", () => {
    const d = new Date("2026-06-29T00:00:00Z");
    expect(parseDateInput(d)).toBe(d);
    expect(parseDateInput("2026-06-29").toISOString()).toContain("2026-06-29");
    expect(parseDateInput(1750000000000) instanceof Date).toBe(true);
    expect(parseDateInput("not-a-date")).toBeNull();
    expect(parseDateInput("")).toBeNull();
    expect(parseDateInput(null)).toBeNull();
  });
  it("a date-only string parses to UTC midnight by default", () => {
    expect(parseDateInput("2026-12-31").toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
  it("bumps a date-only string to end-of-day with { endOfDay } (inclusive upper bound)", () => {
    expect(parseDateInput("2026-12-31", { endOfDay: true }).toISOString()).toBe("2026-12-31T23:59:59.999Z");
    // a full timestamp is left as-is even with endOfDay
    expect(parseDateInput("2026-12-31T08:00:00Z", { endOfDay: true }).toISOString()).toBe("2026-12-31T08:00:00.000Z");
  });
});

describe("normalizeAuditFilters", () => {
  it("keeps known fields, drops blanks, clamps take", () => {
    const f = normalizeAuditFilters({
      actorUserId: "u1",
      entityType: "content_item",
      action: "publish",
      academicYearId: "y1",
      search: "  hello  ",
      take: 1000,
      bogus: "x",
    });
    expect(f).toMatchObject({ actorUserId: "u1", entityType: "content_item", action: "publish", academicYearId: "y1", search: "hello", take: 200 });
    expect(f.bogus).toBeUndefined();
  });
  it("parses from/to into Dates (to is the inclusive end-of-day) and carries a cursor", () => {
    const f = normalizeAuditFilters({ from: "2026-01-01", to: "2026-12-31", cursor: "42" });
    expect(f.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(f.to.toISOString()).toBe("2026-12-31T23:59:59.999Z"); // end-of-day, not midnight
    expect(f.cursor).toBe("42");
  });
  it("rejects an unknown action with a 422 CmsValidationError", () => {
    expect(() => normalizeAuditFilters({ action: "nope" })).toThrow(CmsValidationError);
    try {
      normalizeAuditFilters({ action: "nope" });
    } catch (e) {
      expect(e.status).toBe(422);
    }
  });
  it("accepts every enum action", () => {
    for (const a of AUDIT_ACTIONS) expect(normalizeAuditFilters({ action: a }).action).toBe(a);
  });
});

describe("buildAuditWhere", () => {
  it("maps simple fields and a time range", () => {
    const from = new Date("2026-01-01");
    const to = new Date("2026-02-01");
    const where = buildAuditWhere({ actorUserId: "u1", entityType: "org_unit", action: "create", academicYearId: "y1", from, to });
    expect(where).toMatchObject({ actorUserId: "u1", entityType: "org_unit", action: "create", academicYearId: "y1" });
    expect(where.createdAt).toEqual({ gte: from, lte: to });
  });
  it("builds a case-insensitive summary search", () => {
    expect(buildAuditWhere({ search: "publish" }).summary).toEqual({ contains: "publish", mode: "insensitive" });
  });
  it("turns a numeric cursor into id < BigInt for keyset pagination", () => {
    const where = buildAuditWhere({ cursor: "100" });
    expect(where.id.lt).toBe(100n);
  });
  it("rejects a non-numeric cursor", () => {
    expect(() => buildAuditWhere({ cursor: "abc" })).toThrow(CmsValidationError);
  });
  it("is empty for no filters (full scan, newest-first by id)", () => {
    expect(buildAuditWhere({})).toEqual({});
  });
});

describe("shapeAuditEntry", () => {
  const row = {
    id: 123n,
    actorUserId: "u1",
    action: "publish",
    entityType: "content_item",
    entityId: "c1",
    academicYearId: "y1",
    summary: "Published",
    ipAddress: "1.2.3.4",
    userAgent: "agent",
    createdAt: new Date("2026-06-29T10:00:00Z"),
    before: { a: 1 },
    after: { a: 2 },
    actor: { id: "u1", email: "dev@x.y", name: "Dev" },
  };
  it("stringifies the BigInt id and ISO-formats the date; data-minimizes by default", () => {
    const out = shapeAuditEntry(row);
    expect(out.id).toBe("123");
    expect(out.createdAt).toBe("2026-06-29T10:00:00.000Z");
    expect(out.actor).toEqual({ id: "u1", email: "dev@x.y", displayName: "Dev" }); // the "who" stays
    // incidental request PII + the large snapshots are hidden on a list row
    expect(out.ipAddress).toBeUndefined();
    expect(out.userAgent).toBeUndefined();
    expect(out.before).toBeUndefined();
    expect(out.after).toBeUndefined();
  });
  it("includes ip / user-agent / before / after only in the single-entry detail view", () => {
    const out = shapeAuditEntry(row, { includeData: true });
    expect(out.ipAddress).toBe("1.2.3.4");
    expect(out.userAgent).toBe("agent");
    expect(out.before).toEqual({ a: 1 });
    expect(out.after).toEqual({ a: 2 });
  });
  it("returns null for a null row", () => {
    expect(shapeAuditEntry(null)).toBeNull();
  });
});

describe("compareByCountThenKey / summarizeByKey", () => {
  it("orders by count desc then key asc (shared comparator)", () => {
    const items = [{ key: "b", count: 2 }, { key: "a", count: 2 }, { key: "c", count: 5 }];
    expect([...items].sort(compareByCountThenKey)).toEqual([
      { key: "c", count: 5 },
      { key: "a", count: 2 }, // tie → key asc
      { key: "b", count: 2 },
    ]);
  });
  it("summarizeByKey counts and sorts via the shared comparator", () => {
    const rows = [{ a: "x" }, { a: "y" }, { a: "x" }, { a: "z" }, { a: "y" }, { a: "x" }];
    expect(summarizeByKey(rows, (r) => r.a)).toEqual([
      { key: "x", count: 3 },
      { key: "y", count: 2 },
      { key: "z", count: 1 },
    ]);
  });
  it("handles an empty/absent list", () => {
    expect(summarizeByKey([], (r) => r.a)).toEqual([]);
    expect(summarizeByKey(undefined, (r) => r.a)).toEqual([]);
  });
});

// getAuditStats is the only stats path used in production (the route + CLI). Cover
// its ordering directly with an injected fake client (no DB), incl. a count tie.
describe("getAuditStats ordering (production path)", () => {
  const fakeClient = {
    auditLog: {
      count: async () => 6,
      groupBy: async ({ by }) =>
        by[0] === "action"
          ? [{ action: "create", _count: { _all: 1 } }, { action: "publish", _count: { _all: 3 } }, { action: "archive", _count: { _all: 1 } }]
          : [{ entityType: "org_unit", _count: { _all: 2 } }, { entityType: "content_item", _count: { _all: 4 } }],
    },
  };
  it("returns counts sorted desc, ties broken by key asc", async () => {
    const stats = await getAuditStats({}, { system: true }, { client: fakeClient });
    expect(stats.total).toBe(6);
    expect(stats.byAction).toEqual([
      { key: "publish", count: 3 },
      { key: "archive", count: 1 }, // tie with create → key asc puts archive first
      { key: "create", count: 1 },
    ]);
    expect(stats.byEntity[0]).toEqual({ key: "content_item", count: 4 });
  });
});

// ── status: pure helpers ──────────────────────────────────────────────────

describe("classifyLatency", () => {
  it("labels latency bands and unknown", () => {
    expect(classifyLatency(50)).toBe("warm");
    expect(classifyLatency(800)).toBe("normal");
    expect(classifyLatency(3000)).toBe("cold");
    expect(classifyLatency(9000)).toBe("very-slow");
    expect(classifyLatency(null)).toBe("unknown");
    expect(classifyLatency(NaN)).toBe("unknown");
  });
});

describe("diffMigrations", () => {
  it("classifies applied / pending / failed / extra and upToDate", () => {
    const local = ["20260628120000_init", "20260628130000_fix", "20260701000000_new"];
    const applied = [
      { migration_name: "20260628120000_init", finished_at: new Date(), rolled_back_at: null },
      { migration_name: "20260628130000_fix", finished_at: new Date(), rolled_back_at: null },
      { migration_name: "20260101000000_gone", finished_at: new Date(), rolled_back_at: null }, // not on disk → extra
    ];
    const out = diffMigrations(local, applied);
    expect(out.applied).toEqual(["20260628120000_init", "20260628130000_fix"]);
    expect(out.pending).toEqual(["20260701000000_new"]);
    expect(out.failed).toEqual([]);
    expect(out.extra).toEqual(["20260101000000_gone"]);
    expect(out.upToDate).toBe(false);
    expect(out.total).toBe(3);
  });
  it("flags unfinished and rolled-back rows as failed (camelCase or snake_case)", () => {
    const local = ["m_unfinished", "m_rolledback"];
    const applied = [
      { migrationName: "m_unfinished", finishedAt: null, rolledBackAt: null },
      { migration_name: "m_rolledback", finished_at: new Date(), rolled_back_at: new Date() },
    ];
    const out = diffMigrations(local, applied);
    expect(out.failed).toEqual([
      { name: "m_unfinished", reason: "unfinished" },
      { name: "m_rolledback", reason: "rolled_back" },
    ]);
    expect(out.applied).toEqual([]);
  });
  it("is upToDate when every local migration is applied and nothing failed", () => {
    const out = diffMigrations(["a"], [{ migration_name: "a", finished_at: new Date() }]);
    expect(out.upToDate).toBe(true);
  });
});

describe("summarizeTransitionRuns / shapeTransitionRun", () => {
  const runs = [
    { id: "r2", status: "completed", sourceYearId: "s", targetYearId: "t", completedAt: new Date("2026-06-29T00:00:00Z"), createdAt: new Date(), startedAt: new Date(), counts: { orgUnits: { copied: 3 } }, copyStructure: true, copyAppointments: false, copyContent: false, copyRoleAssignments: false },
    { id: "r1", status: "failed", sourceYearId: "s", targetYearId: "t", completedAt: null, createdAt: new Date(), startedAt: new Date(), counts: { error: "x" }, copyStructure: true, copyAppointments: false, copyContent: false, copyRoleAssignments: false },
  ];
  it("counts by status, totals, completed, and picks the latest (first) run", () => {
    const s = summarizeTransitionRuns(runs);
    expect(s.total).toBe(2);
    expect(s.byStatus).toEqual({ completed: 1, failed: 1 });
    expect(s.completed).toBe(1);
    expect(s.latest.id).toBe("r2");
  });
  it("shapes a run with ISO dates and preserved counts", () => {
    const out = shapeTransitionRun(runs[0]);
    expect(out.completedAt).toBe("2026-06-29T00:00:00.000Z");
    expect(out.counts).toEqual({ orgUnits: { copied: 3 } });
    expect(out.status).toBe("completed");
  });
  it("handles an empty list", () => {
    expect(summarizeTransitionRuns([])).toMatchObject({ total: 0, completed: 0, latest: null });
  });
});

// ── reports: token usage + cost ──────────────────────────────────────────────

const SAMPLE_TOKEN_MD = `
| Session | Date | Focus | Workflow subagent tokens (measured) | Session total | Notes |
|---|---|---|---|---|---|
| 1 | 2026-06-28 | Analysis | **338,732** (schema workflow) | est | x |
| 2 | 2026-06-28 | Database | **912,182** (1 review) | run /cost | y |
| 8 | — | Developer Console | — | — | |
`;

describe("parseTokenUsage / summarizeTokenUsage", () => {
  it("parses session rows and the bolded measured token count", () => {
    const rows = parseTokenUsage(SAMPLE_TOKEN_MD);
    expect(rows.length).toBe(3);
    expect(rows[0]).toMatchObject({ session: 1, date: "2026-06-28", workflowTokens: 338732 });
    expect(rows[2]).toMatchObject({ session: 8, date: null, workflowTokens: null });
  });
  it("ignores header / separator / prose lines", () => {
    expect(parseTokenUsage("# A title\nsome prose\n| not a number | x |")).toEqual([]);
  });
  it("totals only the measured rows", () => {
    const s = summarizeTokenUsage(parseTokenUsage(SAMPLE_TOKEN_MD));
    expect(s.sessions).toBe(3);
    expect(s.sessionsMeasured).toBe(2);
    expect(s.totalWorkflowTokens).toBe(338732 + 912182);
  });
});

describe("estimateBuildCost", () => {
  it("computes USD from output tokens at the indicative price", () => {
    const c = estimateBuildCost(1_000_000, { outputPricePerMTok: 15 });
    expect(c.estimatedUsd).toBe(15);
    expect(c.totalWorkflowTokens).toBe(1_000_000);
  });
  it("defaults junk input to 0", () => {
    expect(estimateBuildCost(undefined).estimatedUsd).toBe(0);
  });
});

describe("estimateInfraCost", () => {
  it("reports Neon within free tier and headroom fraction", () => {
    const c = estimateInfraCost({ dbSizeBytes: NEON_FREE_STORAGE_BYTES / 2, mediaBytes: 0, mediaCount: 0 });
    expect(c.neon.withinFreeTier).toBe(true);
    expect(c.neon.usedFraction).toBe(0.5);
  });
  it("flags Neon over free tier", () => {
    expect(estimateInfraCost({ dbSizeBytes: NEON_FREE_STORAGE_BYTES * 2 }).neon.withinFreeTier).toBe(false);
  });
  it("estimates Cloudinary credits (~1/GB) and free-tier headroom", () => {
    const oneGb = 1024 ** 3;
    const c = estimateInfraCost({ mediaBytes: oneGb * 3, mediaCount: 100 });
    expect(c.cloudinary.estimatedCredits).toBe(3);
    expect(c.cloudinary.withinFreeTier).toBe(true);
    expect(estimateInfraCost({ mediaBytes: oneGb * (CLOUDINARY_FREE_CREDITS + 5) }).cloudinary.withinFreeTier).toBe(false);
  });
});

describe("TEST_SUITES catalog", () => {
  it("lists the static suite and the live-DB suites including this session's", () => {
    expect(TEST_SUITES.some((s) => s.kind === "static")).toBe(true);
    expect(TEST_SUITES.some((s) => s.suite?.includes("devconsole.db"))).toBe(true);
  });
});

// ── backups: pure shaper ──────────────────────────────────────────────────

describe("shapeBackup", () => {
  it("converts BigInt bytes to Number and dates to ISO", () => {
    const out = shapeBackup({
      id: "b1",
      scope: "public",
      format: "zip",
      location: "/backups/x.zip",
      checksum: "abc",
      bytes: 12345n,
      verified: true,
      verifiedAt: new Date("2026-06-29T00:00:00Z"),
      createdById: "u1",
      createdAt: new Date("2026-06-29T00:00:00Z"),
    });
    expect(out.bytes).toBe(12345);
    expect(out.verifiedAt).toBe("2026-06-29T00:00:00.000Z");
    expect(out.verified).toBe(true);
  });
  it("handles null bytes and returns null for a null row", () => {
    expect(shapeBackup({ id: "b", scope: "s", format: "zip", location: "l", bytes: null, verified: false }).bytes).toBeNull();
    expect(shapeBackup(null)).toBeNull();
  });
});
