import { describe, it, expect } from "vitest";
import {
  USER_STATUSES,
  isKnownStatus,
  canLogin,
  canParticipate,
  canViewNormal,
  describeAccess,
  resolveSurface,
  scopeMatches,
} from "../lib/auth/access.mjs";
import { resolveEffectivePermissions, can } from "../lib/rbac/authorize.mjs";

// M1 (DL-065/066/067) — the access-mode matrix, surface routing, and scoped-route
// resolution, all exercised through the PURE helpers that the live gates enforce.

describe("M1 status vocabulary", () => {
  it("is exactly active / inactive / revoked", () => {
    expect(USER_STATUSES).toEqual(["active", "inactive", "revoked"]);
    expect(isKnownStatus("active")).toBe(true);
    expect(isKnownStatus("suspended")).toBe(false); // retired legacy value
  });
});

describe("access matrix per status (DL-065)", () => {
  // [status, canLogin, canParticipate, canViewNormal(allowNormalView=true)]
  const MATRIX = [
    ["active", true, true, true],
    ["inactive", true, false, true],
    ["revoked", false, false, false],
    ["bogus", false, false, false], // unknown → fail-safe deny
  ];
  for (const [status, login, participate, view] of MATRIX) {
    it(`${status}: login=${login} participate=${participate} normalView=${view}`, () => {
      expect(canLogin(status)).toBe(login);
      expect(canParticipate(status)).toBe(participate);
      expect(canViewNormal(status, true)).toBe(view);
    });
  }

  it("allowNormalView=false withholds the member view even when the account can log in", () => {
    expect(canViewNormal("active", false)).toBe(false);
    expect(canViewNormal("inactive", false)).toBe(false);
    // ...but never lets a revoked account in regardless of the toggle.
    expect(canViewNormal("revoked", true)).toBe(false);
  });

  it("describeAccess returns the full JSON-safe shape", () => {
    expect(describeAccess("inactive", true)).toEqual({
      status: "inactive",
      canLogin: true,
      canParticipate: false,
      canViewNormal: true,
    });
  });
});

describe("surface routing (DL-066)", () => {
  it("developer → developer; admin access → admin; otherwise member", () => {
    expect(resolveSurface({ isDeveloper: true, hasAdminAccess: true })).toBe("developer");
    expect(resolveSurface({ isDeveloper: true, hasAdminAccess: false })).toBe("developer");
    expect(resolveSurface({ isDeveloper: false, hasAdminAccess: true })).toBe("admin");
    expect(resolveSurface({ isDeveloper: false, hasAdminAccess: false })).toBe("member");
    expect(resolveSurface()).toBe("member");
  });
});

describe("scoped-route matching (DL-066) — mirrors lib/rbac/authorize.mjs#inScope", () => {
  it("a NULL grant dimension means 'all'; a non-NULL dimension must equal the request", () => {
    expect(scopeMatches({}, { orgUnitLineageKey: "club-x", academicYearId: "y1" })).toBe(true);
    expect(scopeMatches({ orgUnitLineageKey: "club-x" }, { orgUnitLineageKey: "club-x" })).toBe(true);
    expect(scopeMatches({ orgUnitLineageKey: "club-x" }, { orgUnitLineageKey: "club-y" })).toBe(false);
    expect(scopeMatches({ academicYearId: "y1" }, { academicYearId: "y2" })).toBe(false);
    // a narrower grant does NOT satisfy a broader (unscoped) request
    expect(scopeMatches({ orgUnitLineageKey: "club-x" }, {})).toBe(false);
  });
});

describe("scoped RBAC: coordinator → own club only (DL-066, via the live resolver)", () => {
  const user = { isDeveloper: false };
  // A coordinator scoped to club X's lineage (NULL year = all years).
  const coordAtClubX = [
    { orgUnitLineageKey: "club-x", academicYearId: null, revokedAt: null, role: { grantsAll: false }, permissionKeys: ["content.create", "content.edit"] },
  ];

  it("passes for the coordinator's own club", () => {
    const r = resolveEffectivePermissions(user, coordAtClubX, { orgUnitLineageKey: "club-x" });
    expect(can(r, "content.edit")).toBe(true);
  });

  it("is denied for a DIFFERENT club", () => {
    const r = resolveEffectivePermissions(user, coordAtClubX, { orgUnitLineageKey: "club-y" });
    expect(can(r, "content.edit")).toBe(false);
  });

  it("is denied for an institute-wide (unscoped) request — the grant is narrower", () => {
    const r = resolveEffectivePermissions(user, coordAtClubX, {});
    expect(can(r, "content.edit")).toBe(false);
  });

  it("an INSTITUTE-WIDE grant (NULL lineage) satisfies any scope", () => {
    const staffCentral = [
      { orgUnitLineageKey: null, academicYearId: null, revokedAt: null, role: { grantsAll: false }, permissionKeys: ["notification.read"] },
    ];
    expect(can(resolveEffectivePermissions(user, staffCentral, { orgUnitLineageKey: "club-z" }), "notification.read")).toBe(true);
    expect(can(resolveEffectivePermissions(user, staffCentral, {}), "notification.read")).toBe(true);
  });
});
