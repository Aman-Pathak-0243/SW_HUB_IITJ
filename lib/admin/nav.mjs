// Admin Panel navigation model (Session 9) — PURE + dependency-free so it is
// unit-testable without a DB and safe to import from anywhere (it deliberately
// does NOT import the RBAC engine / prisma; it re-states the one-line additive
// "has permission" check that lib/rbac/authorize.mjs#can uses).
//
// The admin shell shows ONLY the modules the viewer can touch: each module
// declares an `anyOf` set of permission keys, and `buildAdminNav(resolved)`
// returns the modules the resolved permission set satisfies (developer /
// grants_all sees everything; the Dashboard is always shown to any authenticated
// admin who can see at least one module). `resolved` is the shape returned by
// getEffectivePermissions: { grantsAll:boolean, permissions:Set<string> }.

// Additive-union check (mirrors lib/rbac/authorize.mjs#can) without importing it,
// keeping this module free of the prisma-backed engine so it stays pure.
export function hasPerm(resolved, key) {
  if (!resolved) return false;
  if (resolved.grantsAll === true) return true;
  const p = resolved.permissions;
  if (!p) return false;
  return typeof p.has === "function" ? p.has(key) : Array.isArray(p) ? p.includes(key) : false;
}

// The admin module catalog. `anyOf: null` => always visible (the Dashboard).
// Order here is the sidebar order.
export const ADMIN_MODULES = [
  { key: "dashboard", label: "Dashboard", href: "/admin", icon: "home", anyOf: null },
  {
    key: "content",
    label: "Content",
    href: "/admin/content",
    icon: "doc",
    description: "Events, announcements, resources & profiles — draft/publish/version.",
    anyOf: ["content.read", "content.create", "content.update", "content.publish", "content.unpublish", "content.archive", "content.restore"],
  },
  {
    key: "organization",
    label: "Organization",
    href: "/admin/organization",
    icon: "sitemap",
    description: "Councils, clubs, hostels, messes, people & appointments.",
    anyOf: ["org_unit.read", "org_unit.create", "org_unit.update", "org_unit.archive", "appointment.create", "appointment.update", "appointment.archive", "position.manage"],
  },
  {
    key: "years",
    label: "Academic Years",
    href: "/admin/years",
    icon: "calendar",
    description: "Years, the Transition Wizard, lock/unlock & set-current.",
    anyOf: ["year.read", "year.create", "year.update", "year.lock", "year.transition"],
  },
  {
    key: "events",
    label: "Event Playground",
    href: "/admin/events",
    icon: "calendar",
    description: "Organizer tagging, rounds, registrations, scores, attendance, closure reports & CSV downloads (M5).",
    anyOf: ["event.manage"],
  },
  {
    key: "media",
    label: "Media",
    href: "/admin/media",
    icon: "image",
    description: "The media library — browse, register, edit metadata & archive.",
    anyOf: ["media.read", "media.upload", "media.update", "media.delete", "media.migrate"],
  },
  {
    key: "users",
    label: "Users & Roles",
    href: "/admin/users",
    icon: "users",
    description: "Accounts, role definitions, role assignments & per-email permission overrides (RBAC).",
    anyOf: ["user.read", "user.create", "user.update", "user.suspend", "user.delete", "role.read", "role.create", "role.update", "role.assign", "role.revoke", "permission.override"],
  },
  {
    key: "requests",
    label: "Password Management",
    href: "/admin/requests",
    icon: "inbox",
    description: "Account-creation & password-reset requests — take, fulfil & resolve (M0).",
    anyOf: ["notification.read"],
  },
  {
    key: "feedback",
    label: "Feedback",
    href: "/admin/feedback",
    icon: "inbox",
    description: "Support tickets / bug reports / queries from the public feedback form (M7).",
    anyOf: ["feedback.read"],
  },
  {
    key: "mail",
    label: "Mail",
    href: "/admin/mail",
    icon: "send",
    description: "Bulk (rate-limited) mail + the authorized-sender allowlist (M8).",
    anyOf: ["mail.send", "mail.manage"],
  },
  {
    key: "plugins",
    label: "Plugins",
    href: "/admin/plugins",
    icon: "plug",
    description: "Developer-controlled feature flags — turn the member platform on/off.",
    anyOf: ["dev.console"],
  },
  {
    key: "console",
    label: "Developer Console",
    href: "/admin/console",
    icon: "terminal",
    description: "System status, audit log, reports, backups & recovery.",
    anyOf: ["dev.console", "audit.read", "backup.create", "backup.restore"],
  },
  {
    key: "devdash",
    label: "Developer Dashboard",
    href: "/admin/devdash",
    icon: "gauge",
    description: "Action-log export, usage analytics & per-table storage thresholds (M8).",
    anyOf: ["dev.console", "audit.read", "storage.manage"],
  },
];

export const ADMIN_MODULE_BY_KEY = Object.fromEntries(ADMIN_MODULES.map((m) => [m.key, m]));

// Can the viewer see a module? Dashboard (anyOf null) is visible to anyone who
// can see at least one OTHER module (i.e. is a real admin), not to a bare
// authenticated user with zero admin permissions.
export function canAccessModule(resolved, moduleKey) {
  const mod = ADMIN_MODULE_BY_KEY[moduleKey];
  if (!mod) return false;
  if (mod.anyOf === null) return ADMIN_MODULES.some((m) => m.anyOf && m.anyOf.some((k) => hasPerm(resolved, k)));
  return mod.anyOf.some((k) => hasPerm(resolved, k));
}

// The visible nav items for a resolved permission set, in sidebar order.
export function buildAdminNav(resolved) {
  return ADMIN_MODULES.filter((m) => canAccessModule(resolved, m.key));
}

// Does the viewer have ANY admin access at all (i.e. should they see the panel)?
export function hasAnyAdminAccess(resolved) {
  return ADMIN_MODULES.some((m) => m.anyOf && m.anyOf.some((k) => hasPerm(resolved, k)));
}

// Serialize a resolved permission set (with a Set) to a JSON-safe shape a Client
// Component can receive as props and re-check with hasPerm.
export function serializePermissions(resolved) {
  if (!resolved) return { grantsAll: false, permissions: [] };
  const p = resolved.permissions;
  const permissions = p && typeof p.has === "function" ? [...p] : Array.isArray(p) ? p : [];
  return { grantsAll: resolved.grantsAll === true, permissions };
}
