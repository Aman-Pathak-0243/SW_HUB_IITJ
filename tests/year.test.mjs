// PURE unit tests for the Academic Year Engine's DB-free logic: the lock
// precondition, the year audit snapshot, and the Session-4 additions to the
// DB-guard → friendly-error mapping. DB-backed behavior is in tests/year.db.test.mjs.
import { describe, it, expect } from "vitest";
import { lockBlockReason } from "../lib/year/lock.mjs";
import { yearSnapshot } from "../lib/year/context.mjs";
import { mapDbError } from "../lib/cms/errors.mjs";

describe("lockBlockReason (lock precondition)", () => {
  it("refuses to lock the current (live) year", () => {
    const r = lockBlockReason({ isCurrent: true, status: "active" }, "locked");
    expect(r?.code).toBe("CANNOT_LOCK_CURRENT");
  });

  it("allows locking a non-current year", () => {
    expect(lockBlockReason({ isCurrent: false, status: "active" }, "locked")).toBeNull();
  });

  it("allows unlocking the current year (only locking is restricted)", () => {
    expect(lockBlockReason({ isCurrent: true, status: "active" }, "active")).toBeNull();
  });

  it("flags a missing year", () => {
    expect(lockBlockReason(null, "locked")?.code).toBe("CMS_NOT_FOUND");
  });
});

describe("yearSnapshot", () => {
  it("returns a compact JSON-friendly snapshot", () => {
    const snap = yearSnapshot({
      id: "y1",
      label: "2026-27",
      status: "active",
      isCurrent: true,
      startDate: new Date("2026-07-01"),
      endDate: new Date("2027-06-30"),
      transitionedFromYearId: "y0",
      extra: "ignored",
    });
    expect(snap).toMatchObject({ id: "y1", label: "2026-27", status: "active", isCurrent: true, transitionedFromYearId: "y0" });
    expect(snap).not.toHaveProperty("extra");
  });

  it("maps null to null", () => {
    expect(yearSnapshot(null)).toBeNull();
  });
});

describe("mapDbError — Session-4 year/transition guard signatures", () => {
  const cases = [
    ["transition_no_self_chk", "TRANSITION_SELF", 422],
    ["transition_run_one_completed_uq", "TRANSITION_EXISTS", 409],
    ["academic_year_one_current_uq", "CURRENT_YEAR_CONFLICT", 409],
    ["org_unit_academic_year_id_lineage_key_key", "ONE_UNIT_PER_YEAR", 409],
    ["academic_year_label_format_chk", "INVALID_YEAR_LABEL", 422],
    ["academic_year_date_order_chk", "INVALID_YEAR_DATES", 422],
    ["academic_year_no_self_transition_chk", "INVALID_YEAR_PROVENANCE", 422],
    ["academic_year_label_key", "YEAR_LABEL_TAKEN", 409],
    // lock_guard remains mapped (Session-3 matcher) — locked years surface YEAR_LOCKED.
    ["lock_guard: UPDATE on org_unit blocked", "YEAR_LOCKED", 409],
  ];
  for (const [signature, code, status] of cases) {
    it(`maps "${signature}" → ${code} (${status})`, () => {
      const mapped = mapDbError(new Error(`ERROR: ${signature} ...`));
      expect(mapped.code).toBe(code);
      expect(mapped.status).toBe(status);
      expect(mapped.cause).toBeInstanceOf(Error);
    });
  }

  it("passes CmsError through unchanged", () => {
    const mapped = mapDbError(mapDbError(new Error("transition_no_self_chk")));
    expect(mapped.code).toBe("TRANSITION_SELF");
  });
});
