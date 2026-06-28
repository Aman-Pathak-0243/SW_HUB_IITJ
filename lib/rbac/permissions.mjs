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
  { key: "role.read", module: "users", label: "View roles & permissions" },
  { key: "role.create", module: "users", label: "Create roles" },
  { key: "role.update", module: "users", label: "Edit roles & their permissions" },
  { key: "role.assign", module: "users", label: "Assign roles to users" },
  { key: "role.revoke", module: "users", label: "Revoke role assignments" },

  // Developer console / ops
  { key: "audit.read", module: "ops", label: "View the audit log" },
  { key: "backup.create", module: "ops", label: "Create backups" },
  { key: "backup.restore", module: "ops", label: "Restore / roll back from a backup" },
  { key: "dev.console", module: "ops", label: "Access the developer console" },
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
];
