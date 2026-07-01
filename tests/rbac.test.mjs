import { describe, it, expect } from "vitest";
import { resolveEffectivePermissions, can } from "../lib/rbac/authorize.mjs";
import { PERMISSIONS, ROLE_DEFS, PERMISSION_KEYS, CATEGORY_ROLE_KEYS } from "../lib/rbac/permissions.mjs";

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

const ovr = (mode, permissionKey, over = {}) => ({
  orgUnitLineageKey: null,
  academicYearId: null,
  mode,
  permissionKey,
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

describe("RBAC: per-user permission overrides (M2 / DL-062)", () => {
  it("a grant override adds a permission no role gave", () => {
    const r = resolveEffectivePermissions({ isDeveloper: false }, [], {}, [ovr("grant", "content.publish")]);
    expect(can(r, "content.publish")).toBe(true);
  });

  it("a deny override removes a permission a role granted (deny subtracts)", () => {
    const r = resolveEffectivePermissions(
      { isDeveloper: false },
      [grant({ permissionKeys: ["content.read", "content.publish"] })],
      {},
      [ovr("deny", "content.publish")]
    );
    expect(can(r, "content.read")).toBe(true);
    expect(can(r, "content.publish")).toBe(false);
    expect(r.denied.has("content.publish")).toBe(true);
  });

  it("DENY WINS over a grant override at the same scope, regardless of order", () => {
    const both = [ovr("grant", "user.delete"), ovr("deny", "user.delete")];
    const r1 = resolveEffectivePermissions({ isDeveloper: false }, [], {}, both);
    const r2 = resolveEffectivePermissions({ isDeveloper: false }, [], {}, [...both].reverse());
    expect(can(r1, "user.delete")).toBe(false);
    expect(can(r2, "user.delete")).toBe(false);
  });

  it("a developer ignores overrides (the bypass is never restricted)", () => {
    const r = resolveEffectivePermissions({ isDeveloper: true }, [], {}, [ovr("deny", "content.read")]);
    expect(can(r, "content.read")).toBe(true);
    expect(r.denied.size).toBe(0);
  });

  it("a grants_all role short-circuits BEFORE overrides (deny cannot restrict it)", () => {
    const r = resolveEffectivePermissions(
      { isDeveloper: false },
      [grant({ role: { grantsAll: true } })],
      {},
      [ovr("deny", "content.read")]
    );
    expect(can(r, "content.read")).toBe(true);
    expect(r.grantsAll).toBe(true);
  });

  it("a scoped deny applies only in its scope; elsewhere the role grant stands", () => {
    const assignments = [grant({ permissionKeys: ["content.update"] })]; // global grant
    const overrides = [ovr("deny", "content.update", { orgUnitLineageKey: CLUB })]; // deny only at CLUB
    const atClub = resolveEffectivePermissions({ isDeveloper: false }, assignments, { orgUnitLineageKey: CLUB }, overrides);
    const atOther = resolveEffectivePermissions({ isDeveloper: false }, assignments, { orgUnitLineageKey: OTHER_CLUB }, overrides);
    const global = resolveEffectivePermissions({ isDeveloper: false }, assignments, {}, overrides);
    expect(can(atClub, "content.update")).toBe(false); // denied here
    expect(can(atOther, "content.update")).toBe(true); // not denied here
    expect(can(global, "content.update")).toBe(true); // a CLUB-scoped deny doesn't apply globally
  });

  it("a scoped grant override only grants within its scope", () => {
    const overrides = [ovr("grant", "media.upload", { academicYearId: YEAR })];
    const inYear = resolveEffectivePermissions({ isDeveloper: false }, [], { academicYearId: YEAR }, overrides);
    const otherYear = resolveEffectivePermissions({ isDeveloper: false }, [], { academicYearId: OTHER_YEAR }, overrides);
    expect(can(inYear, "media.upload")).toBe(true);
    expect(can(otherYear, "media.upload")).toBe(false);
  });
});

describe("RBAC catalog: M2 categories + override permission", () => {
  it("permission.override is in the catalog", () => {
    expect(PERMISSION_KEYS).toContain("permission.override");
  });

  it("seeds the six member-platform category roles (developer is system, already present)", () => {
    for (const k of ["normal_user", "co_coordinator", "coordinator", "secretary", "staff", "admin"]) {
      expect(CATEGORY_ROLE_KEYS).toContain(k);
      const role = ROLE_DEFS.find((r) => r.key === k);
      expect(role, `role ${k} seeded`).toBeTruthy();
      expect(role.isSystem).toBe(false);
      expect(role.grantsAll).toBe(false);
    }
  });

  it("the admin category has broad perms but NOT the developer-only console/backup/migrate ops", () => {
    const admin = ROLE_DEFS.find((r) => r.key === "admin");
    expect(admin.permissions).toContain("user.create");
    expect(admin.permissions).toContain("permission.override");
    for (const k of ["dev.console", "backup.create", "backup.restore", "media.migrate"]) {
      expect(admin.permissions).not.toContain(k);
    }
  });

  it("normal_user has no back-office permissions", () => {
    const nu = ROLE_DEFS.find((r) => r.key === "normal_user");
    expect(nu.permissions).toEqual([]);
  });

  it("membership.manage (M3) is in the catalog and held by coordinator/secretary/admin, not normal_user/viewer", () => {
    expect(PERMISSION_KEYS).toContain("membership.manage");
    const has = (key) => ROLE_DEFS.find((r) => r.key === key)?.permissions ?? [];
    expect(has("coordinator")).toContain("membership.manage");
    expect(has("secretary")).toContain("membership.manage");
    expect(has("admin")).toContain("membership.manage"); // admin = full catalog minus dev-only
    expect(has("normal_user")).not.toContain("membership.manage");
    expect(has("viewer")).not.toContain("membership.manage");
    // co_coordinator drafts content but does NOT manage the roster.
    expect(has("co_coordinator")).not.toContain("membership.manage");
  });

  it("event.manage (M5) is in the catalog and held by coordinator/secretary/staff/admin, not normal_user/viewer", () => {
    expect(PERMISSION_KEYS).toContain("event.manage");
    const has = (key) => ROLE_DEFS.find((r) => r.key === key)?.permissions ?? [];
    expect(has("coordinator")).toContain("event.manage"); // scoped to their organizing club
    expect(has("secretary")).toContain("event.manage");
    expect(has("staff")).toContain("event.manage"); // central (unscoped)
    expect(has("admin")).toContain("event.manage"); // admin = full catalog minus dev-only
    expect(has("normal_user")).not.toContain("event.manage");
    expect(has("viewer")).not.toContain("event.manage");
    // event.manage is NOT a developer-only op (it's an ordinary operational permission).
    expect(has("co_coordinator")).not.toContain("event.manage");
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
