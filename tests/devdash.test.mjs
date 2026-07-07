import { describe, it, expect } from "vitest";
import { sectionFromPath, topByCount } from "../lib/devconsole/usage.mjs";
import { buildStorageReport, toCsv, TRUNCATABLE_TABLES } from "../lib/devconsole/storage.mjs";
import { csvCell, auditEntriesToCsv, AUDIT_EXPORT_COLUMNS } from "../lib/devconsole/audit.mjs";

// M8 — usage analytics, storage report, and CSV export (pure helpers).

describe("usage analytics (pure)", () => {
  it("derives a coarse section from a path", () => {
    expect(sectionFromPath("/org/clubs/coding")).toBe("org");
    expect(sectionFromPath("/events?x=1")).toBe("events");
    expect(sectionFromPath("/")).toBe("home");
    expect(sectionFromPath("")).toBe("home");
  });
  it("sorts by count desc then key asc and takes top n", () => {
    const rows = [{ key: "a", count: 2 }, { key: "b", count: 5 }, { key: "c", count: 5 }];
    expect(topByCount(rows, 2)).toEqual([{ key: "b", count: 5 }, { key: "c", count: 5 }]);
  });
});

describe("storage report (pure)", () => {
  it("flags tables over threshold, sorts largest-first, totals bytes", () => {
    const sizes = [
      { tableName: "page_visit", bytes: 5000, estRows: 100 },
      { tableName: "audit_log", bytes: 200, estRows: 3 },
      { tableName: "feedback", bytes: 1000, estRows: 9 },
    ];
    const thresholds = [{ tableName: "page_visit", thresholdBytes: 4000 }, { tableName: "feedback", thresholdBytes: 9999 }];
    const r = buildStorageReport(sizes, thresholds);
    expect(r.rows.map((x) => x.tableName)).toEqual(["page_visit", "feedback", "audit_log"]); // size desc
    expect(r.totalBytes).toBe(6200);
    expect(r.flagged.map((x) => x.tableName)).toEqual(["page_visit"]); // only it exceeds
    expect(r.rows.find((x) => x.tableName === "audit_log").threshold).toBeNull();
  });
  it("only page_visit is allowlisted for truncation (conservative)", () => {
    expect(TRUNCATABLE_TABLES.has("page_visit")).toBe(true);
    expect(TRUNCATABLE_TABLES.has("audit_log")).toBe(false);
    expect(TRUNCATABLE_TABLES.has("content_revision")).toBe(false);
  });
  it("toCsv quotes commas/quotes/newlines and JSON-encodes objects", () => {
    const csv = toCsv([{ a: "x,y", b: 'he said "hi"', c: { k: 1 } }]);
    const [header, row] = csv.split("\n");
    expect(header).toBe("a,b,c");
    expect(row).toContain('"x,y"');
    expect(row).toContain('"he said ""hi"""');
    expect(row).toContain('"{""k"":1}"');
  });
});

describe("audit CSV export (pure)", () => {
  it("quotes cells and pulls actorEmail from the nested actor", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell(null)).toBe("");
    const csv = auditEntriesToCsv([
      { id: "5", createdAt: "2026-06-30T00:00:00Z", action: "update", entityType: "feedback", entityId: "f1", actor: { email: "x@y.co" }, summary: "Took FB-1, again" },
    ]);
    const [header, row] = csv.split("\n");
    expect(header).toBe(AUDIT_EXPORT_COLUMNS.join(","));
    expect(row).toContain("x@y.co");
    expect(row).toContain('"Took FB-1, again"');
  });
});
