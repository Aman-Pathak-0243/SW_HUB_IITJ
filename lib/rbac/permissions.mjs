// RBAC catalog — the authoritative list of atomic permissions and the seeded
// roles. Permissions and roles are DATA (rows in `permission` / `role` /
// `role_permission`), not code: this file is only the SEED + the single source
// of truth for tests. Adding a permission = add a row here, re-seed; no schema
// change. Grain is dotted `verb.resource` (DECISION_LOG DL / SCHEMA_DESIGN cap 3).

export const PERMISSIONS = [
  // Academic Year Engine
  { key: "year.read", module: "year", label: "View academic years" },
  { key: "year.create", module: "year", label: "Create an academic year" },
  { key: "year.update", module: "year", label: "Edit an academic year" },
  { key: "year.lock", module: "year", label: "Lock / unlock an academic year" },
  { key: "year.transition", module: "year", label: "Run the academic-year transition wizard" },

  // Organization model
  { key: "org_unit.read", module: "org", label: "View organization units" },
  { key: "org_unit.create", module: "org", label: "Create an organization unit" },
  { key: "org_unit.update", module: "org", label: "Edit an organization unit" },
  { key: "org_unit.archive", module: "org", label: "Archive an organization unit" },
  { key: "org_type.manage", module: "org", label: "Manage organization-unit types & hierarchy" },
  { key: "position.manage", module: "org", label: "Manage position definitions" },
  { key: "appointment.create", module: "org", label: "Create an appointment (assign a person)" },
  { key: "appointment.update", module: "org", label: "Edit an appointment" },
  { key: "appointment.archive", module: "org", label: "Archive an appointment" },

  // CMS (content_item / content_revision)
  { key: "content.read", module: "cms", label: "View content (incl. drafts)" },
  { key: "content.create", module: "cms", label: "Create content" },
  { key: "content.update", module: "cms", label: "Edit content drafts" },
  { key: "content.publish", module: "cms", label: "Publish content" },
  { key: "content.unpublish", module: "cms", label: "Unpublish content" },
  { key: "content.archive", module: "cms", label: "Archive content" },
  { key: "content.restore", module: "cms", label: "Restore a previous revision" },
  { key: "content_type.manage", module: "cms", label: "Manage content-type registry" },

  // Media
  { key: "media.read", module: "media", label: "View media library" },
  { key: "media.upload", module: "media", label: "Upload media" },
  { key: "media.update", module: "media", label: "Edit media metadata" },
  { key: "media.delete", module: "media", label: "Delete / archive media" },
  { key: "media.migrate", module: "media", label: "Run the /public→Cloudinary migration tool" },

  // Users & RBAC administration
  { key: "user.read", module: "users", label: "View users" },
  { key: "user.create", module: "users", label: "Create / invite users" },
  { key: "user.update", module: "users", label: "Edit users" },
  { key: "user.suspend", module: "users", label: "Suspend / disable users" },
  { key: "user.delete", module: "users", label: "Delete user accounts" },
  { key: "role.read", module: "users", label: "View roles & permissions" },
  { key: "role.create", module: "users", label: "Create roles" },
  { key: "role.update", module: "users", label: "Edit roles & their permissions" },
  { key: "role.assign", module: "users", label: "Assign roles to users" },
  { key: "role.revoke", module: "users", label: "Revoke role assignments" },
  // Member platform — M2 (Session 11): grant/deny a SINGLE catalog permission to
  // one specific account (a user_permission_override). Granting via an override is
  // bounded by the actor's own permissions + the DL-049/062 escalation guards.
  { key: "permission.override", module: "users", label: "Grant / deny a permission to a specific user (override)" },

  // Developer console / ops
  { key: "audit.read", module: "ops", label: "View the audit log" },
  { key: "backup.create", module: "ops", label: "Create backups" },
  { key: "backup.restore", module: "ops", label: "Restore / roll back from a backup" },
  { key: "dev.console", module: "ops", label: "Access the developer console" },
  // M8 (Session 11): per-table size monitoring + thresholds + export/TRUNCATE. This
  // is destructive, so it is a DEVELOPER-ONLY op (excluded from the `admin` category,
  // alongside backup.* / media.migrate — see ADMIN_ONLY_EXCLUDED below).
  { key: "storage.manage", module: "ops", label: "Manage per-table size thresholds, export & truncate tables" },

  // Member platform — notifications / account-request queue (M0, Session 11).
  // Surfaced on the admin & developer Password Management tabs. Toggling the
  // member-platform PLUGIN itself is developer-only (app_user.is_developer), not a
  // permission — see lib/platform/flags.mjs.
  { key: "notification.read", module: "notifications", label: "View notifications & account/password requests" },
  { key: "notification.assign", module: "notifications", label: "Take / assign a request (audited)" },
  { key: "notification.resolve", module: "notifications", label: "Resolve / dismiss a request" },

  // Member platform — feedback / support tickets (M7, Session 11). A public form
  // creates a ticket with a unique reference id; stakeholders triage/assign/resolve.
  { key: "feedback.read", module: "feedback", label: "View feedback / support tickets" },
  { key: "feedback.resolve", module: "feedback", label: "Triage / assign / resolve feedback tickets" },

  // Member platform — bulk mail (M8, Session 11). nodemailer on the institute VM;
  // senders are restricted to an authorized-sender list (mail.manage maintains it).
  { key: "mail.send", module: "mail", label: "Send bulk (rate-limited) mail" },
  { key: "mail.manage", module: "mail", label: "Manage the authorized-sender allowlist" },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

// Sensible non-developer permission bundles for the seeded operational roles.
const CONTENT_EDITOR_PERMS = [
  "content.read", "content.create", "content.update", "content.publish",
  "content.unpublish", "content.archive", "content.restore",
  "media.read", "media.upload", "media.update", "org_unit.read", "year.read",
];

const ORG_MANAGER_PERMS = [
  "org_unit.read", "org_unit.create", "org_unit.update", "org_unit.archive",
  "position.manage", "appointment.create", "appointment.update", "appointment.archive",
  "content.read", "media.read", "year.read",
];

const VIEWER_PERMS = ["content.read", "org_unit.read", "media.read", "year.read"];

// ── M2 (Session 11) RBAC "categories" — roles are the categories (data) ──────
// The member platform seeds a stakeholder ladder. Each is a NON-system, non-
// grants_all role whose default `role_permission` map reflects its real-world
// scope; admins/devs can create more and grant any of them per-unit/per-year via
// the role_assignment scope columns. The category also powers stakeholder search /
// grouping (the M2 admin filter's "category" facet matches a user's role keys).
//
//  • normal_user   — a member: no back-office permission (the category is for
//    grouping/search + future member-platform features). Reads are public anyway.
//  • co_coordinator — drafts a unit's content (no publish).
//  • coordinator    — runs a club: full content lifecycle + media (== editor set).
//  • secretary      — a council lead: coordinator + structure (units/appointments).
//  • staff          — central content/announcements + sees the request queue.
//  • admin          — institute administrator: everything EXCEPT the developer-only
//    console / backup / media-migration ops (those stay super_admin / developer).
const NORMAL_USER_PERMS = [];
const CO_COORDINATOR_PERMS = [
  "content.read", "content.create", "content.update",
  "media.read", "media.upload", "org_unit.read", "year.read",
];
const COORDINATOR_PERMS = CONTENT_EDITOR_PERMS;
const SECRETARY_PERMS = [
  ...CONTENT_EDITOR_PERMS,
  "org_unit.update", "appointment.create", "appointment.update", "appointment.archive",
];
const STAFF_PERMS = [
  "content.read", "content.create", "content.update", "content.publish",
  "content.unpublish", "content.archive", "content.restore",
  "media.read", "media.upload", "media.update", "org_unit.read", "year.read",
  "notification.read", "feedback.read", "mail.send",
];
// admin = the full catalog minus the developer-console / backup / migration / storage
// ops (reserved for super_admin / developer). Computed from PERMISSION_KEYS so it can
// never drift out of sync with the catalog as new permissions are added. `storage.manage`
// (M8: export/TRUNCATE tables) is destructive → developer-only, like backup.* (DL-068).
const ADMIN_ONLY_EXCLUDED = new Set(["dev.console", "backup.create", "backup.restore", "media.migrate", "storage.manage"]);
const ADMIN_PERMS = PERMISSION_KEYS.filter((k) => !ADMIN_ONLY_EXCLUDED.has(k));

// Seeded roles. `developer` is the unrestricted super-role (grants_all short-
// circuit + app_user.is_developer). `super_admin` is granted every permission
// explicitly (editable). The rest are convenient, non-system starting roles.
export const ROLE_DEFS = [
  {
    key: "developer",
    name: "Developer",
    isSystem: true,
    grantsAll: true,
    description: "Unrestricted access (grants_all). Bypasses permission checks.",
    permissions: [], // not needed — grants_all short-circuits
  },
  {
    key: "super_admin",
    name: "Super Admin",
    isSystem: true,
    grantsAll: false,
    description: "Full administrative access via the complete permission set.",
    permissions: "ALL",
  },
  {
    key: "content_editor",
    name: "Content Editor",
    isSystem: false,
    grantsAll: false,
    description: "Create, edit and publish CMS content and upload media.",
    permissions: CONTENT_EDITOR_PERMS,
  },
  {
    key: "org_manager",
    name: "Organization Manager",
    isSystem: false,
    grantsAll: false,
    description: "Manage org units, positions and appointments.",
    permissions: ORG_MANAGER_PERMS,
  },
  {
    key: "viewer",
    name: "Viewer",
    isSystem: false,
    grantsAll: false,
    description: "Read-only access to content and structure.",
    permissions: VIEWER_PERMS,
  },

  // ── M2 member-platform "categories" (the stakeholder ladder) ──
  {
    key: "normal_user",
    name: "Normal User",
    isSystem: false,
    grantsAll: false,
    description: "A member account — no back-office permissions; the category drives search/grouping and member-platform features.",
    permissions: NORMAL_USER_PERMS,
    category: true,
  },
  {
    key: "co_coordinator",
    name: "Co-coordinator",
    isSystem: false,
    grantsAll: false,
    description: "Drafts a unit's content (create/edit; no publish). Scope a grant to the unit.",
    permissions: CO_COORDINATOR_PERMS,
    category: true,
  },
  {
    key: "coordinator",
    name: "Coordinator",
    isSystem: false,
    grantsAll: false,
    description: "Runs a club: full content lifecycle + media. Scope a grant to the unit.",
    permissions: COORDINATOR_PERMS,
    category: true,
  },
  {
    key: "secretary",
    name: "Secretary",
    isSystem: false,
    grantsAll: false,
    description: "A council lead: coordinator access plus structure (units & appointments). Scope a grant to the council.",
    permissions: SECRETARY_PERMS,
    category: true,
  },
  {
    key: "staff",
    name: "Staff",
    isSystem: false,
    grantsAll: false,
    description: "Central content & announcements; sees the account/password request queue.",
    permissions: STAFF_PERMS,
    category: true,
  },
  {
    key: "admin",
    name: "Administrator",
    isSystem: false,
    grantsAll: false,
    description: "Institute administrator — every permission except the developer-only console / backup / migration ops.",
    permissions: ADMIN_PERMS,
    category: true,
  },
];

// The seeded "category" role keys (M2) — the stakeholder ladder the admin search /
// grouping facet uses, in ascending privilege order. Exported as the single source
// of truth so the admin filter + tests agree.
export const CATEGORY_ROLE_KEYS = ROLE_DEFS.filter((r) => r.category).map((r) => r.key);
