// Static unit tests for the Session-9 Admin Panel helpers — pure logic, no DB, so
// they run in the default-green `npm test`. Covers the nav model, the view-models,
// the form validators, the users-service pure helpers, and the admin action registry.
import { describe, it, expect } from "vitest";
import {
  hasPerm, buildAdminNav, canAccessModule, hasAnyAdminAccess, serializePermissions, ADMIN_MODULES,
} from "../lib/admin/nav.mjs";
import {
  statusTone, contentTypeLabel, shapeContentRow, availableContentActions, groupContentByType,
  diffViews, buildDiffRows, formatAssignmentScope, shapeYearRow, humanBytes,
} from "../lib/admin/view-models.mjs";
import {
  validateUserForm, validateRoleForm, validateGrantForm, validateContentForm, validateYearForm, validateMediaForm, validateOverrideForm,
} from "../lib/admin/forms.mjs";
import { normalizeEmail, normalizeRoleKey, shapeUser, shapeRole, shapeAssignment, shapeOverride } from "../lib/users/admin.mjs";
import { ADMIN_ACTIONS, isKnownAdminAction } from "../lib/admin/handlers.mjs";

// helper: a resolved permission set from a list of keys
const resolved = (keys, grantsAll = false) => ({ grantsAll, permissions: new Set(keys) });

describe("admin/nav", () => {
  it("hasPerm honors grants_all and Set/array membership", () => {
    expect(hasPerm(resolved([], true), "anything")).toBe(true);
    expect(hasPerm(resolved(["content.read"]), "content.read")).toBe(true);
    expect(hasPerm(resolved(["content.read"]), "user.read")).toBe(false);
    expect(hasPerm({ grantsAll: false, permissions: ["x"] }, "x")).toBe(true); // array form
    expect(hasPerm(null, "x")).toBe(false);
  });

  it("buildAdminNav shows only modules the viewer can touch (+ dashboard)", () => {
    const editor = resolved(["content.read", "media.read"]);
    const nav = buildAdminNav(editor).map((m) => m.key);
    expect(nav).toContain("dashboard");
    expect(nav).toContain("content");
    expect(nav).toContain("media");
    expect(nav).not.toContain("users");
    expect(nav).not.toContain("console");
  });

  it("a developer (grants_all) sees every module", () => {
    const nav = buildAdminNav(resolved([], true)).map((m) => m.key);
    expect(nav.sort()).toEqual(ADMIN_MODULES.map((m) => m.key).sort());
  });

  it("a user with NO admin permission sees nothing (dashboard hidden too)", () => {
    const none = resolved([]);
    expect(hasAnyAdminAccess(none)).toBe(false);
    expect(canAccessModule(none, "dashboard")).toBe(false);
    expect(buildAdminNav(none)).toEqual([]);
  });

  it("canAccessModule is any-of over the module's permission set", () => {
    expect(canAccessModule(resolved(["role.read"]), "users")).toBe(true);
    expect(canAccessModule(resolved(["audit.read"]), "console")).toBe(true);
    expect(canAccessModule(resolved(["year.read"]), "media")).toBe(false);
  });

  it("serializePermissions makes a JSON-safe shape that hasPerm still reads", () => {
    const s = serializePermissions(resolved(["content.read"]));
    expect(Array.isArray(s.permissions)).toBe(true);
    expect(hasPerm(s, "content.read")).toBe(true);
    expect(serializePermissions(null)).toEqual({ grantsAll: false, permissions: [] });
  });
});

describe("admin/view-models", () => {
  it("statusTone maps lifecycle states to tones", () => {
    expect(statusTone("published")).toBe("good");
    expect(statusTone("draft")).toBe("info");
    expect(statusTone("archived")).toBe("muted");
    expect(statusTone("review")).toBe("warn");
    expect(statusTone("inactive")).toBe("warn"); // M1: can browse, no participation
    expect(statusTone("revoked")).toBe("muted"); // M1: no login
    expect(statusTone("weird")).toBe("neutral");
  });

  it("contentTypeLabel resolves known types and falls back", () => {
    expect(contentTypeLabel("event")).toBe("Event");
    expect(contentTypeLabel("nope")).toBe("nope");
  });

  it("shapeContentRow flattens a content_item with a resolved title", () => {
    const row = shapeContentRow(
      { id: "i1", contentType: "event", slug: "fest", status: "published", pinned: true, publishedRevisionId: "r1", draftRevisionId: null },
      { title: "Fest 2026" }
    );
    expect(row).toMatchObject({ id: "i1", title: "Fest 2026", typeLabel: "Event", statusTone: "good", hasPublished: true, hasDraft: false, pinned: true });
  });

  it("availableContentActions depends on state", () => {
    expect(availableContentActions({ status: "draft", hasDraft: true, hasPublished: false })).toEqual(["edit", "publish", "archive"]);
    expect(availableContentActions({ status: "published", hasDraft: false, hasPublished: true })).toEqual(["edit", "unpublish", "archive"]);
    expect(availableContentActions({ status: "archived" })).toEqual([]); // no unarchive op in the registry
  });

  it("groupContentByType groups + sorts by label", () => {
    const rows = [shapeContentRow({ id: "1", contentType: "event", status: "draft" }), shapeContentRow({ id: "2", contentType: "announcement", status: "draft" })];
    const groups = groupContentByType(rows);
    expect(groups.map((g) => g.label)).toEqual(["Announcement", "Event"]);
  });

  it("diffViews + buildDiffRows produce field-level changes (objects by value)", () => {
    const a = { title: "A", summary: "x", payload: { body: "1", tags: [1, 2] } };
    const b = { title: "B", summary: "x", payload: { body: "1", tags: [1, 3] } };
    const diff = diffViews(a, b);
    expect(diff.changed.sort()).toEqual(["tags", "title"]);
    const rows = buildDiffRows(diff);
    const byField = Object.fromEntries(rows.map((r) => [r.field, r]));
    expect(byField.title).toMatchObject({ from: "A", to: "B" });
    expect(byField.tags.to).toBe("[1,3]");
  });

  it("formatAssignmentScope describes the grant scope", () => {
    expect(formatAssignmentScope({})).toBe("institute-wide");
    expect(formatAssignmentScope({ academicYearId: "y", academicYearLabel: "2025-26" })).toBe("year 2025-26");
    expect(formatAssignmentScope({ orgUnitLineageKey: "u" })).toBe("unit-scoped");
  });

  it("shapeYearRow + humanBytes format for display", () => {
    expect(shapeYearRow({ id: "y", label: "2025-26", status: "active", isCurrent: true }).statusTone).toBe("good");
    expect(humanBytes(0)).toBe("0 B");
    expect(humanBytes(1024)).toBe("1 KB");
    expect(humanBytes(1024 * 1024 * 5)).toBe("5 MB");
    expect(humanBytes(-1)).toBe("—");
  });
});

describe("admin/forms", () => {
  it("validateUserForm requires a valid email on create", () => {
    expect(validateUserForm({ email: "bad" }, { isCreate: true }).ok).toBe(false);
    const ok = validateUserForm({ email: "a@b.co", name: "A" }, { isCreate: true });
    expect(ok.ok).toBe(true);
    expect(ok.value.email).toBe("a@b.co");
    expect(validateUserForm({ email: "a@b.co", password: "short" }, { isCreate: true }).errors.password).toBeTruthy();
  });

  it("validateRoleForm requires a slug key + name on create", () => {
    expect(validateRoleForm({ key: "Bad Key", name: "x" }, { isCreate: true }).errors.key).toBeTruthy();
    const ok = validateRoleForm({ key: "club_editor", name: "Club Editor", permissionKeys: ["content.read"] }, { isCreate: true });
    expect(ok.ok).toBe(true);
    expect(ok.value).toMatchObject({ key: "club_editor", permissionKeys: ["content.read"] });
  });

  it("validateGrantForm requires a user and a role", () => {
    expect(validateGrantForm({}).ok).toBe(false);
    expect(validateGrantForm({ userId: "u", roleId: "r" }).ok).toBe(true);
  });

  it("validateContentForm requires a type + title on create and validates slug", () => {
    expect(validateContentForm({ title: "" }, { isCreate: true }).ok).toBe(false);
    expect(validateContentForm({ contentType: "event", title: "T", slug: "Bad Slug" }, { isCreate: true }).errors.slug).toBeTruthy();
    expect(validateContentForm({ contentType: "event", title: "T", slug: "ok-slug" }, { isCreate: true }).ok).toBe(true);
  });

  it("validateYearForm enforces YYYY-YY + date order", () => {
    expect(validateYearForm({ label: "2026", startDate: "2026-07-01", endDate: "2027-06-30" }).errors.label).toBeTruthy();
    expect(validateYearForm({ label: "2026-27", startDate: "2027-07-01", endDate: "2027-06-30" }).errors.endDate).toBeTruthy();
    expect(validateYearForm({ label: "2026-27", startDate: "2026-07-01", endDate: "2027-06-30" }).ok).toBe(true);
  });

  it("validateMediaForm requires a url + known kind/provider", () => {
    expect(validateMediaForm({}).ok).toBe(false);
    expect(validateMediaForm({ url: "https://x/y.png", kind: "nope" }).errors.kind).toBeTruthy();
    expect(validateMediaForm({ url: "https://x/y.png" }).ok).toBe(true);
  });

  it("validateOverrideForm needs a user, a known mode and a permission key (M2)", () => {
    expect(validateOverrideForm({}).ok).toBe(false);
    expect(validateOverrideForm({ userId: "u", mode: "nope", permissionKey: "user.delete" }).errors.mode).toBeTruthy();
    expect(validateOverrideForm({ userId: "u", mode: "deny" }).errors.permissionKey).toBeTruthy();
    const ok = validateOverrideForm({ userId: "u", mode: "grant", permissionKey: "media.upload", reason: " test " });
    expect(ok.ok).toBe(true);
    expect(ok.value).toMatchObject({ userId: "u", mode: "grant", permissionKey: "media.upload", reason: "test" });
  });
});

describe("users/admin pure helpers", () => {
  it("normalizeEmail trims + validates", () => {
    expect(normalizeEmail("  A@B.co ")).toBe("A@B.co");
    expect(normalizeEmail("no-at")).toBeNull();
    expect(normalizeEmail("a@b")).toBeNull();
  });

  it("normalizeRoleKey enforces a lowercase slug", () => {
    expect(normalizeRoleKey(" Club_Editor ")).toBe("club_editor");
    expect(normalizeRoleKey("9bad")).toBeNull();
    expect(normalizeRoleKey("has space")).toBeNull();
  });

  it("shapeUser never leaks the password hash and reports hasPassword", () => {
    const u = shapeUser({ id: "u", email: "a@b.co", name: "A", isDeveloper: false, status: "active", passwordHash: "secret" });
    expect(u.hasPassword).toBe(true);
    expect(u).not.toHaveProperty("passwordHash");
  });

  it("shapeRole + shapeAssignment shape display fields", () => {
    expect(shapeRole({ id: "r", key: "viewer", name: "Viewer", status: "active" }, { permissionKeys: ["content.read"] }).permissionKeys).toEqual(["content.read"]);
    const a = shapeAssignment({ id: "a", userId: "u", roleId: "r", revokedAt: null });
    expect(a.active).toBe(true);
  });
});

describe("admin/handlers registry", () => {
  it("every action has a run() and a gate (permission | scoped | console)", () => {
    for (const [key, entry] of Object.entries(ADMIN_ACTIONS)) {
      expect(typeof entry.run, `${key}.run`).toBe("function");
      const gated = !!entry.permission || entry.scoped === true || entry.console === true;
      expect(gated, `${key} must declare a gate`).toBe(true);
    }
  });

  it("isKnownAdminAction recognizes registered actions only", () => {
    expect(isKnownAdminAction("user.create")).toBe(true);
    expect(isKnownAdminAction("content.publish")).toBe(true);
    expect(isKnownAdminAction("totally.fake")).toBe(false);
  });

  it("institute-wide ops gate a concrete permission; content/org ops are service-scoped", () => {
    expect(ADMIN_ACTIONS["user.create"].permission).toBe("user.create");
    expect(ADMIN_ACTIONS["year.transition"].permission).toBe("year.transition");
    expect(ADMIN_ACTIONS["content.publish"].scoped).toBe(true);
    expect(ADMIN_ACTIONS["org.unit.create"].scoped).toBe(true);
    expect(ADMIN_ACTIONS["backup.record"].console).toBe(true);
  });

  it("the M2 override actions gate on permission.override", () => {
    expect(ADMIN_ACTIONS["permission.override.set"].permission).toBe("permission.override");
    expect(ADMIN_ACTIONS["permission.override.remove"].permission).toBe("permission.override");
  });
});

describe("users/admin shapeOverride", () => {
  it("shapes a JSON-safe override row", () => {
    const o = shapeOverride({
      id: "o1", userId: "u1", permissionId: "p1", mode: "deny",
      orgUnitLineageKey: null, academicYearId: null,
      permission: { key: "content.publish", label: "Publish content" },
      createdAt: new Date("2026-06-30T00:00:00Z"),
    });
    expect(o).toMatchObject({ id: "o1", mode: "deny", permissionKey: "content.publish", permissionLabel: "Publish content" });
    expect(o.createdAt).toBe("2026-06-30T00:00:00.000Z");
  });
  it("returns null for a falsy row", () => {
    expect(shapeOverride(null)).toBeNull();
  });
});
