import { describe, it, expect } from "vitest";
import { resolveEffectivePermissions, can } from "../lib/rbac/authorize.mjs";
import { PERMISSIONS, ROLE_DEFS, PERMISSION_KEYS } from "../lib/rbac/permissions.mjs";

const YEAR = "11111111-1111-1111-1111-111111111111";
const OTHER_YEAR = "22222222-2222-2222-2222-222222222222";
const CLUB = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER_CLUB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const grant = (over = {}) => ({
  orgUnitLineageKey: null,
  academicYearId: null,
  revokedAt: null,
  role: { grantsAll: false },
  permissionKeys: [],
  ...over,
});

describe("RBAC: resolveEffectivePermissions + can", () => {
  it("developer short-circuits to grantsAll regardless of assignments", () => {
    const r = resolveEffectivePermissions({ isDeveloper: true }, []);
    expect(r.grantsAll).toBe(true);
    expect(can(r, "anything.at.all")).toBe(true);
  });

  it("a grants_all role confers everything", () => {
    const r = resolveEffectivePermissions({ isDeveloper: false }, [
      grant({ role: { grantsAll: true } }),
    ]);
    expect(can(r, "content.publish")).toBe(true);
    expect(can(r, "user.suspend")).toBe(true);
  });

  it("unions permissions across multiple assignments", () => {
    const r = resolveEffectivePermissions({ isDeveloper: false }, [
      grant({ permissionKeys: ["content.read", "content.update"] }),
      grant({ permissionKeys: ["media.upload"] }),
    ]);
    expect(can(r, "content.read")).toBe(true);
    expect(can(r, "content.update")).toBe(true);
    expect(can(r, "media.upload")).toBe(true);
    expect(can(r, "user.create")).toBe(false);
  });

  it("excludes revoked assignments", () => {
    const r = resolveEffectivePermissions({ isDeveloper: false }, [
      grant({ permissionKeys: ["content.publish"], revokedAt: new Date() }),
    ]);
    expect(can(r, "content.publish")).toBe(false);
  });

  it("global (NULL-scope) grant applies to any requested scope", () => {
    const r = resolveEffectivePermissions(
      { isDeveloper: false },
      [grant({ permissionKeys: ["content.update"] })],
      { orgUnitLineageKey: CLUB, academicYearId: YEAR }
    );
    expect(can(r, "content.update")).toBe(true);
  });

  it("unit-scoped grant applies only to that unit", () => {
    const assignments = [grant({ orgUnitLineageKey: CLUB, permissionKeys: ["content.update"] })];
    const inScope = resolveEffectivePermissions({ isDeveloper: false }, assignments, { orgUnitLineageKey: CLUB });
    const otherUnit = resolveEffectivePermissions({ isDeveloper: false }, assignments, { orgUnitLineageKey: OTHER_CLUB });
    const globalReq = resolveEffectivePermissions({ isDeveloper: false }, assignments, {});
    expect(can(inScope, "content.update")).toBe(true);
    expect(can(otherUnit, "content.update")).toBe(false);
    // a unit-scoped grant does NOT satisfy a global (unscoped) request
    expect(can(globalReq, "content.update")).toBe(false);
  });

  it("year-scoped grant applies only to that year", () => {
    const assignments = [grant({ academicYearId: YEAR, permissionKeys: ["content.publish"] })];
    const sameYear = resolveEffectivePermissions({ isDeveloper: false }, assignments, { academicYearId: YEAR });
    const otherYear = resolveEffectivePermissions({ isDeveloper: false }, assignments, { academicYearId: OTHER_YEAR });
    expect(can(sameYear, "content.publish")).toBe(true);
    expect(can(otherYear, "content.publish")).toBe(false);
  });

  it("combined unit+year grant requires both to match", () => {
    const assignments = [grant({ orgUnitLineageKey: CLUB, academicYearId: YEAR, permissionKeys: ["appointment.create"] })];
    const both = resolveEffectivePermissions({ isDeveloper: false }, assignments, { orgUnitLineageKey: CLUB, academicYearId: YEAR });
    const wrongYear = resolveEffectivePermissions({ isDeveloper: false }, assignments, { orgUnitLineageKey: CLUB, academicYearId: OTHER_YEAR });
    expect(can(both, "appointment.create")).toBe(true);
    expect(can(wrongYear, "appointment.create")).toBe(false);
  });

  it("an empty/no-assignment user has no permissions", () => {
    const r = resolveEffectivePermissions({ isDeveloper: false }, []);
    expect(can(r, "content.read")).toBe(false);
  });
});

describe("RBAC catalog integrity", () => {
  it("permission keys are unique and dotted", () => {
    const keys = PERMISSIONS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(k).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });

  it("role permission references all exist in the catalog", () => {
    const catalog = new Set(PERMISSION_KEYS);
    for (const role of ROLE_DEFS) {
      if (role.permissions === "ALL" || role.grantsAll) continue;
      for (const key of role.permissions) {
        expect(catalog.has(key), `role ${role.key} references unknown permission ${key}`).toBe(true);
      }
    }
  });

  it("exactly one grants_all system role (developer)", () => {
    const grantsAll = ROLE_DEFS.filter((r) => r.grantsAll);
    expect(grantsAll).toHaveLength(1);
    expect(grantsAll[0].key).toBe("developer");
    expect(grantsAll[0].isSystem).toBe(true);
  });
});
