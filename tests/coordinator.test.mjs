// Static tests for the scoped-coordinator surface (Session 13, DL-096) — the PURE
// scoped-grant discovery core `scopedLineagesFor`. It is the INVERSE of the RBAC
// resolver ("which lineages does U hold P at?"), built ON resolveEffectivePermissions so
// it inherits deny-wins, the developer/grants_all short-circuit, and the year-dimension
// inScope semantics. These cases lock that parity without a DB.
import { describe, it, expect } from "vitest";
import { scopedLineagesFor } from "../lib/rbac/grants.mjs";

const A = "lineage-A";
const B = "lineage-B";
const Y = "year-2025";
const Y_OTHER = "year-2024";
const USER = { isDeveloper: false };

// normalized assignment / override builders (the shape loadUserRbacInputs produces)
const asg = (orgUnitLineageKey, permissionKeys, { academicYearId = null, grantsAll = false, revokedAt = null } = {}) => ({
  orgUnitLineageKey,
  academicYearId,
  revokedAt,
  role: { grantsAll },
  permissionKeys,
});
const ovr = (orgUnitLineageKey, permissionKey, mode = "grant", { academicYearId = null } = {}) => ({ orgUnitLineageKey, academicYearId, mode, permissionKey });

describe("scopedLineagesFor — scoped-grant discovery (DL-096)", () => {
  it("discovers a coordinator's scoped club with only the granted perm", () => {
    const res = scopedLineagesFor(USER, [asg(A, ["event.manage", "content.read"])], [], ["event.manage", "membership.manage"], Y);
    expect(res).toEqual([{ orgUnitLineageKey: A, permissions: ["event.manage"] }]);
  });

  it("a GLOBAL (unscoped) grant is NOT a scoped lineage → empty (that's a global admin)", () => {
    expect(scopedLineagesFor(USER, [asg(null, ["event.manage"])], [], ["event.manage"], Y)).toEqual([]);
  });

  it("deny-wins: a GLOBAL deny override removes a scoped grant", () => {
    const res = scopedLineagesFor(USER, [asg(A, ["event.manage"])], [ovr(null, "event.manage", "deny")], ["event.manage"], Y);
    expect(res).toEqual([]);
  });

  it("deny-wins: a SCOPED deny on the same lineage removes it", () => {
    const res = scopedLineagesFor(USER, [asg(A, ["event.manage"])], [ovr(A, "event.manage", "deny")], ["event.manage"], Y);
    expect(res).toEqual([]);
  });

  it("a GRANT override alone creates a scoped lineage (no role grant needed)", () => {
    const res = scopedLineagesFor(USER, [], [ovr(A, "membership.manage", "grant")], ["event.manage", "membership.manage"], Y);
    expect(res).toEqual([{ orgUnitLineageKey: A, permissions: ["membership.manage"] }]);
  });

  it("discovers multiple lineages", () => {
    const res = scopedLineagesFor(USER, [asg(A, ["membership.manage"]), asg(B, ["membership.manage"])], [], ["membership.manage"], Y);
    expect(res.map((r) => r.orgUnitLineageKey).sort()).toEqual([A, B].sort());
  });

  it("year dimension: a grant scoped to a DIFFERENT year is excluded", () => {
    expect(scopedLineagesFor(USER, [asg(A, ["event.manage"], { academicYearId: Y_OTHER })], [], ["event.manage"], Y)).toEqual([]);
  });

  it("year dimension: a SAME-year scoped grant is included", () => {
    expect(scopedLineagesFor(USER, [asg(A, ["event.manage"], { academicYearId: Y })], [], ["event.manage"], Y)).toEqual([
      { orgUnitLineageKey: A, permissions: ["event.manage"] },
    ]);
  });

  it("year dimension: an all-years (null) scoped grant matches any year", () => {
    expect(scopedLineagesFor(USER, [asg(A, ["event.manage"], { academicYearId: null })], [], ["event.manage"], Y)).toEqual([
      { orgUnitLineageKey: A, permissions: ["event.manage"] },
    ]);
  });

  it("returns only the ASKED permission keys", () => {
    expect(scopedLineagesFor(USER, [asg(A, ["membership.manage"])], [], ["event.manage"], Y)).toEqual([]);
    const both = scopedLineagesFor(USER, [asg(A, ["event.manage", "membership.manage"])], [], ["event.manage", "membership.manage"], Y);
    expect(both[0].permissions.sort()).toEqual(["event.manage", "membership.manage"]);
  });

  it("a revoked assignment is not a candidate", () => {
    expect(scopedLineagesFor(USER, [asg(A, ["event.manage"], { revokedAt: new Date() })], [], ["event.manage"], Y)).toEqual([]);
  });

  it("a developer (grants_all short-circuit) passes at any candidate lineage", () => {
    // Edge: a developer with a scoped assignment. resolveEffectivePermissions short-
    // circuits to grants_all, so can() is true for the asked key at that candidate.
    expect(scopedLineagesFor({ isDeveloper: true }, [asg(A, [])], [], ["event.manage"], Y)).toEqual([
      { orgUnitLineageKey: A, permissions: ["event.manage"] },
    ]);
  });

  it("empty inputs → empty", () => {
    expect(scopedLineagesFor(USER, [asg(A, ["event.manage"])], [], [], Y)).toEqual([]);
    expect(scopedLineagesFor(USER, [], [], ["event.manage"], Y)).toEqual([]);
  });
});
