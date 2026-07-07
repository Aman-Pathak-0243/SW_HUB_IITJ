// Users & Roles administration service (Session 9) — the ONE net-new backend of
// the Admin Panel. Everything else the panel renders is an EXISTING service
// (lib/cms, lib/year, lib/org, lib/media, lib/devconsole); this module is the
// missing piece: managing the RBAC data (app_user accounts, role definitions,
// and role_assignment grants) that the whole authorization engine reads.
//
// It follows every established convention so it composes with the rest of the
// system unchanged:
//   • AUTHORIZE FIRST — every mutating op gates on its `user.*` / `role.*`
//     permission via the shared `assertActorPermission` (system actor bypasses;
//     missing actor → 401; missing permission → 403), BEFORE any state read, so
//     an unauthorized caller can neither act nor probe (no auth-after-disclosure).
//   • AUDIT — each mutation runs through the shared `auditedMutation` and writes
//     exactly ONE semantic audit_log row (DL-012/DL-028/DL-033). User/role admin
//     uses the operation-level actions create/update/grant_role/revoke_role, the
//     last two of which the AuditAction enum models specifically for RBAC changes.
//   • DB IS THE SOURCE OF TRUTH (DL-029) — the email/role-key uniques and the
//     `role_assignment_unique_active_grant_uq` partial unique are honored, never
//     re-implemented; a violation surfaces as a friendly mapped error.
//
// PRIVILEGE-ESCALATION GUARDS (DL-049):
//   • Only a DEVELOPER (app_user.is_developer) may create or set `is_developer`
//     on an account — a `grants_all` super_admin holds every permission but is NOT
//     a developer, so it cannot mint an account that bypasses RBAC entirely.
//   • A new role can never be created with `grants_all` (that flag is reserved for
//     the seeded `developer` role); SYSTEM roles (developer / super_admin) are
//     protected from modification except their description, so an admin cannot
//     strip super_admin's permissions or deactivate it and lock everyone out.
//   • GRANTING a grants_all or system role (developer / super_admin) is likewise
//     developer-only — holding `role.assign` alone must not let a super_admin
//     delegate the unrestricted bypass to a puppet account (or itself).
//   • You cannot set your OWN account to a non-active status (self-lockout guard).
import prisma from "../prisma.mjs";
import { assertActorPermission } from "../year/context.mjs";
import { userCan } from "../rbac/authorize.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsValidationError, CmsNotFoundError, CmsError } from "../cms/errors.mjs";
import { hashPassword, verifyPassword } from "../auth/password.mjs";
import { normalizeEmail } from "../auth/email.mjs";
import { validatePasswordPolicy } from "../auth/password-policy.mjs";
import { generatePassword } from "../auth/password-generator.mjs";
import { matchesUserFilter, instituteEmailPrefix } from "./search.mjs";
import { USER_STATUSES } from "../auth/access.mjs";

// Re-exported so existing importers/tests keep `import { normalizeEmail } from
// "lib/users/admin.mjs"` working; the canonical definition lives in lib/auth/email.mjs.
export { normalizeEmail };

const USER_ENTITY = "app_user";
const ROLE_ENTITY = "role";
const ASSIGNMENT_ENTITY = "role_assignment";
const OVERRIDE_ENTITY = "user_permission_override";

// M2: managing a per-email permission override (grant/deny a single permission).
export const OVERRIDE_OP_PERMISSION = "permission.override";
export const OVERRIDE_MODES = ["grant", "deny"];

// Role keys whose CLUB-scoped grant is limited to ONE club per person per academic year
// (the "a coordinator coordinates one club only" rule). A second club is rejected until the
// existing one is revoked. Extend this set to also cap co_coordinator, etc.
export const ONE_CLUB_ROLE_KEYS = new Set(["coordinator"]);

// app_user.status (UserStatus enum) — the three M1 access modes (DL-065). The
// canonical list lives in the pure, client-safe lib/auth/access.mjs; re-exported here
// so existing importers keep `import { USER_STATUSES } from "lib/users/admin.mjs"`.
export { USER_STATUSES };

// Permission key per mutating op (capability-3 grain; keys in lib/rbac/permissions.mjs).
export const USER_OP_PERMISSIONS = {
  create: "user.create",
  update: "user.update",
  suspend: "user.suspend",
  delete: "user.delete",
};
export const ROLE_OP_PERMISSIONS = {
  create: "role.create",
  update: "role.update",
  assign: "role.assign",
  revoke: "role.revoke",
};

// ── PURE helpers (no DB; unit-tested) ───────────────────────────────────────

// A role key must be a stable, lowercase dotted/underscored slug (matches the
// seeded keys: developer, super_admin, content_editor, …). PURE + exported.
export function normalizeRoleKey(raw) {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key || !/^[a-z][a-z0-9_]*$/.test(key)) return null;
  return key;
}

// Compact, JSON-safe snapshot of an app_user for audit before/after (never the
// password hash). Exported for the view layer.
export function shapeUser(u, { roles, overrides } = {}) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    isDeveloper: u.isDeveloper ?? false,
    status: u.status,
    allowNormalView: u.allowNormalView ?? true,
    hasPassword: u.passwordHash != null,
    mustChangePassword: u.mustChangePassword ?? false,
    passwordSetAt: u.passwordSetAt instanceof Date ? u.passwordSetAt.toISOString() : u.passwordSetAt ?? null,
    lastLoginAt: u.lastLoginAt instanceof Date ? u.lastLoginAt.toISOString() : u.lastLoginAt ?? null,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt ?? null,
    ...(roles !== undefined ? { roles } : {}),
    ...(overrides !== undefined ? { overrides } : {}),
  };
}

// Compact, JSON-safe snapshot of a role (+ its permission keys / counts when known).
export function shapeRole(r, { permissionKeys, assignmentCount } = {}) {
  if (!r) return null;
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description ?? null,
    isSystem: r.isSystem ?? false,
    grantsAll: r.grantsAll ?? false,
    status: r.status,
    ...(permissionKeys !== undefined ? { permissionKeys } : {}),
    ...(assignmentCount !== undefined ? { assignmentCount } : {}),
  };
}

// Compact, JSON-safe view of a role_assignment (with the joined role/scope labels
// when included). The scope nulls mean "institute-wide / all years".
export function shapeAssignment(a) {
  if (!a) return null;
  return {
    id: a.id,
    userId: a.userId,
    roleId: a.roleId,
    roleKey: a.role?.key ?? null,
    roleName: a.role?.name ?? null,
    orgUnitLineageKey: a.orgUnitLineageKey ?? null,
    academicYearId: a.academicYearId ?? null,
    academicYearLabel: a.academicYear?.label ?? null,
    grantedAt: a.grantedAt instanceof Date ? a.grantedAt.toISOString() : a.grantedAt ?? null,
    revokedAt: a.revokedAt instanceof Date ? a.revokedAt.toISOString() : a.revokedAt ?? null,
    active: a.revokedAt == null,
  };
}

// Compact, JSON-safe view of a user_permission_override (M2). The scope nulls mean
// "institute-wide / all years". `permissionKey` is joined when included.
export function shapeOverride(o) {
  if (!o) return null;
  return {
    id: o.id,
    userId: o.userId,
    permissionId: o.permissionId,
    permissionKey: o.permission?.key ?? null,
    permissionLabel: o.permission?.label ?? null,
    mode: o.mode,
    orgUnitLineageKey: o.orgUnitLineageKey ?? null,
    academicYearId: o.academicYearId ?? null,
    academicYearLabel: o.academicYear?.label ?? null,
    reason: o.reason ?? null,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt ?? null,
  };
}

// ── internal guards ─────────────────────────────────────────────────────────

// Setting/clearing the unrestricted `is_developer` flag is reserved for an actor
// who is THEMSELVES a developer (a grants_all super_admin is not enough — DL-049).
// A `system` actor (seed/migration) bypasses. Only checked when the flag is set.
async function assertCanSetDeveloper(actor) {
  if (actor?.system) return;
  const me = await prisma.user.findUnique({ where: { id: actor?.userId ?? "" }, select: { isDeveloper: true } });
  if (!me?.isDeveloper) {
    throw new CmsError("Only a developer can grant or remove developer (unrestricted) access.", {
      status: 403,
      code: "DEVELOPER_ONLY",
    });
  }
}

async function loadUserOrThrow(id) {
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) throw new CmsNotFoundError(`User ${id} not found.`);
  return u;
}

// Validate a plaintext password against the M0 policy (server-authoritative), then
// hash it (argon2id). Used by every path that sets a password (create / set / bulk /
// reset / self-change) so the rule is enforced in exactly one place.
async function hashWithPolicy(password) {
  const pw = String(password ?? "");
  const { ok, errors } = validatePasswordPolicy(pw);
  if (!ok) throw new CmsValidationError(`Password does not meet the policy: ${errors.join("; ")}.`);
  return hashPassword(pw);
}

async function loadRoleOrThrow(id) {
  const r = await prisma.role.findUnique({ where: { id } });
  if (!r) throw new CmsNotFoundError(`Role ${id} not found.`);
  return r;
}

// Resolve permission ids for a set of keys; throws a friendly 422 listing any
// unknown keys (so a typo'd permission is caught before the write).
async function resolvePermissionIds(keys) {
  const wanted = [...new Set((keys ?? []).map((k) => String(k)))];
  if (!wanted.length) return [];
  const rows = await prisma.permission.findMany({ where: { key: { in: wanted } }, select: { id: true, key: true } });
  const found = new Set(rows.map((p) => p.key));
  const unknown = wanted.filter((k) => !found.has(k));
  if (unknown.length) throw new CmsValidationError(`Unknown permission key(s): ${unknown.join(", ")}.`);
  return rows.map((p) => p.id);
}

// ── reads ────────────────────────────────────────────────────────────────────

// List users (newest first) with their ACTIVE role keys + permission overrides.
// M2 smart-search criteria: `status`, free-text `search` (email/name contains),
// `category` (a role key — the stakeholder-category facet), and the email-format
// `year` / `level` (ug|pg|research) / `branch`. The DB query narrows COARSELY
// (status + category join + an email-prefix startsWith when the institute-email
// parts form a leading prefix); the PURE `matchesUserFilter` then refines for
// PRECISION over the returned page (the single source of truth for the predicate,
// shared with the client-side debounced filter — no drift). With a non-prefixable
// filter (e.g. branch without year) the precise filter runs over the first `take`
// rows; the admin UI also filters client-side over the loaded list.
export async function listUsers({ status, search, category, year, level, branch, take = 200 } = {}, actor = {}) {
  await assertActorPermission(actor, "user.read");
  const where = {};
  if (status) where.status = status;
  if (search) where.OR = [{ email: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }];
  if (category) where.roleAssignments = { some: { revokedAt: null, role: { key: String(category) } } };
  // Cheap, index-friendly narrowing when (year[,level[,branch]]) form a leading
  // institute-email prefix (e.g. 2023ume). Non-leading combos are left to the
  // precise filter below (a superset is safe — it only ever narrows further).
  const prefix = instituteEmailPrefix({ year, level, branch });
  if (prefix) where.email = { startsWith: prefix, mode: "insensitive" };

  const rows = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    include: {
      roleAssignments: {
        where: { revokedAt: null },
        select: {
          id: true,
          orgUnitLineageKey: true,
          academicYearId: true,
          role: { select: { key: true, name: true } },
          academicYear: { select: { label: true } },
        },
      },
      permissionOverrides: {
        select: {
          id: true,
          mode: true,
          orgUnitLineageKey: true,
          academicYearId: true,
          reason: true,
          createdAt: true,
          permission: { select: { key: true, label: true } },
          academicYear: { select: { label: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  const shaped = rows.map((u) =>
    shapeUser(u, {
      roles: u.roleAssignments.map((ra) => ({
        assignmentId: ra.id,
        key: ra.role.key,
        name: ra.role.name,
        orgUnitLineageKey: ra.orgUnitLineageKey,
        academicYearId: ra.academicYearId,
        academicYearLabel: ra.academicYear?.label ?? null,
      })),
      overrides: u.permissionOverrides.map((o) => shapeOverride({ ...o, userId: u.id })),
    })
  );
  // Precise refinement over the shaped page: matchesUserFilter is the SINGLE
  // authority for the final predicate on BOTH server and client (the DB clauses
  // above are a coarse superset). `search` maps to the pure filter's `q` (per-field
  // email/name match — identical to the DB where.OR, so no client/server drift);
  // re-applying status/category here is idempotent (the DB already narrowed them).
  return shaped.filter((u) => matchesUserFilter(u, { year, level, branch, category, status, q: search }));
}

// One user with their full (active + revoked) assignment history.
export async function getUser(id, actor = {}) {
  await assertActorPermission(actor, "user.read");
  const u = await prisma.user.findUnique({
    where: { id },
    include: {
      roleAssignments: {
        orderBy: { grantedAt: "desc" },
        include: { role: { select: { key: true, name: true } }, academicYear: { select: { label: true } } },
      },
      permissionOverrides: {
        orderBy: { createdAt: "desc" },
        include: { permission: { select: { key: true, label: true } }, academicYear: { select: { label: true } } },
      },
    },
  });
  if (!u) throw new CmsNotFoundError(`User ${id} not found.`);
  return {
    ...shapeUser(u),
    assignments: u.roleAssignments.map(shapeAssignment),
    overrides: u.permissionOverrides.map(shapeOverride),
  };
}

// List roles with their permission keys + active-assignment counts.
export async function listRoles({ includeInactive = false } = {}, actor = {}) {
  await assertActorPermission(actor, "role.read");
  const rows = await prisma.role.findMany({
    where: includeInactive ? {} : { status: "active" },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: {
      rolePermissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { roleAssignments: true } },
    },
  });
  return rows.map((r) =>
    shapeRole(r, {
      permissionKeys: r.rolePermissions.map((rp) => rp.permission.key).sort(),
      assignmentCount: r._count.roleAssignments,
    })
  );
}

// UNGATED full role view (id + permission keys) — the internal reader create/
// update return so they don't depend on the actor ALSO holding role.read.
async function roleView(id) {
  const r = await prisma.role.findUnique({
    where: { id },
    include: { rolePermissions: { select: { permission: { select: { key: true } } } } },
  });
  if (!r) return null;
  return shapeRole(r, { permissionKeys: r.rolePermissions.map((rp) => rp.permission.key).sort() });
}

// One role with its permission keys (gated on role.read).
export async function getRole(id, actor = {}) {
  await assertActorPermission(actor, "role.read");
  const v = await roleView(id);
  if (!v) throw new CmsNotFoundError(`Role ${id} not found.`);
  return v;
}

// The full permission catalog (for a role editor's checkbox list), grouped by module.
export async function listPermissionCatalog(actor = {}) {
  await assertActorPermission(actor, "role.read");
  const rows = await prisma.permission.findMany({ orderBy: [{ module: "asc" }, { key: "asc" }] });
  const byModule = {};
  for (const p of rows) (byModule[p.module ?? "other"] ??= []).push({ key: p.key, label: p.label });
  return { permissions: rows.map((p) => ({ key: p.key, label: p.label, module: p.module ?? "other" })), byModule };
}

// ── user mutations ─────────────────────────────────────────────────────────

// Create a user. M0: admin-provisioned accounts get an INITIAL password (delivered
// externally) + must_change_password=true → forced change on first login. A
// password is optional (a no-password account can be created and given a credential
// later via a reset). `mustChangePassword` defaults to true whenever an initial
// password is set (the admin-provisioning case); pass it explicitly to override.
// input: { email, name?, isDeveloper?, status?, password?, mustChangePassword?, allowNormalView? }
export async function createUser(input = {}, actor = {}) {
  await assertActorPermission(actor, USER_OP_PERMISSIONS.create);
  const email = normalizeEmail(input.email);
  if (!email) throw new CmsValidationError("A valid email address is required.");
  const status = input.status ?? "active";
  if (!USER_STATUSES.includes(status)) throw new CmsValidationError(`Unknown user status '${status}'.`);
  if (input.isDeveloper) await assertCanSetDeveloper(actor);

  // Friendly pre-check (the citext UNIQUE would otherwise surface as a generic P2002).
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new CmsError("An account with that email already exists.", { status: 409, code: "EMAIL_TAKEN" });

  const hasPw = input.password != null && input.password !== "";
  const passwordHash = hasPw ? await hashWithPolicy(input.password) : null;
  // Force a first-login change for any admin-set initial password (the default),
  // unless the caller explicitly opts out. A no-password account is never flagged.
  const mustChange = hasPw ? input.mustChangePassword ?? true : false;
  const name = String(input.name ?? "").trim() || email;

  const { user } = await auditedMutation(
    actor,
    async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          name,
          passwordHash,
          isDeveloper: !!input.isDeveloper,
          status,
          // Omit when not provided so the column default (true) applies (DL-067).
          allowNormalView: input.allowNormalView === undefined ? undefined : !!input.allowNormalView,
          mustChangePassword: mustChange,
          passwordSetAt: hasPw ? new Date() : null,
        },
      });
      return { user: created };
    },
    ({ user }) => ({
      action: "create",
      entityType: USER_ENTITY,
      entityId: user.id,
      after: shapeUser(user),
      summary: `Created user ${user.email}${user.isDeveloper ? " (developer)" : ""}${hasPw ? " with an initial password (must change)" : ""}`,
    })
  );
  // Return the SHAPED row — never hand the raw record (with password_hash) back to
  // a caller / the API client. Mirrors updateUser / setUserStatus.
  return { user: shapeUser(user) };
}

// Edit a user's profile fields (display name + developer flag + the M1 member-view
// toggle). Status changes go through setUserStatus; password through setUserPassword.
// patch: { name?, isDeveloper?, allowNormalView? }
export async function updateUser(id, patch = {}, actor = {}) {
  await assertActorPermission(actor, USER_OP_PERMISSIONS.update);
  const user = await loadUserOrThrow(id);

  const data = {};
  if (patch.name !== undefined) {
    const name = String(patch.name ?? "").trim();
    if (!name) throw new CmsValidationError("Display name cannot be empty.");
    data.name = name;
  }
  if (patch.isDeveloper !== undefined && !!patch.isDeveloper !== user.isDeveloper) {
    await assertCanSetDeveloper(actor); // both granting AND removing developer is developer-only
    data.isDeveloper = !!patch.isDeveloper;
  }
  // M1 (DL-067): the per-account "allow normal (member) view" toggle. Audited via
  // the same updateUser path (one semantic row); no escalation concern (it only
  // narrows/permits a member's own normal view, never a back-office capability).
  if (patch.allowNormalView !== undefined && !!patch.allowNormalView !== (user.allowNormalView !== false)) {
    data.allowNormalView = !!patch.allowNormalView;
  }
  if (!Object.keys(data).length) return { user: shapeUser(user), changed: false };

  const { user: updated } = await auditedMutation(
    actor,
    async (tx) => ({ user: await tx.user.update({ where: { id }, data }) }),
    ({ user: updated }) => ({
      action: "update",
      entityType: USER_ENTITY,
      entityId: updated.id,
      before: shapeUser(user),
      after: shapeUser(updated),
      summary: `Edited user ${updated.email}`,
    })
  );
  return { user: shapeUser(updated), changed: true };
}

// Set a user's account status (active / inactive / revoked — M1, DL-065). Because
// authorization is resolved live per request (DL-019), a status change takes effect
// on the user's NEXT request — no session table to clear; a `revoked` user is also
// rejected at the next sign-in (lib/auth/options.mjs). You cannot set your OWN account
// to a non-active status (self-lockout guard).
export async function setUserStatus(id, status, actor = {}) {
  await assertActorPermission(actor, USER_OP_PERMISSIONS.suspend);
  if (!USER_STATUSES.includes(status)) throw new CmsValidationError(`Unknown user status '${status}'.`);
  if (!actor?.system && id === actor?.userId && status !== "active") {
    throw new CmsError("You cannot deactivate or revoke your own account.", { status: 409, code: "SELF_LOCKOUT" });
  }
  const user = await loadUserOrThrow(id);
  if (user.status === status) return { user: shapeUser(user), changed: false };

  const { user: updated } = await auditedMutation(
    actor,
    async (tx) => ({ user: await tx.user.update({ where: { id }, data: { status } }) }),
    ({ user: updated }) => ({
      action: "update",
      entityType: USER_ENTITY,
      entityId: updated.id,
      before: shapeUser(user),
      after: shapeUser(updated),
      summary: `Set user ${updated.email} status → ${status}`,
    })
  );
  return { user: shapeUser(updated), changed: true };
}

// Set / reset a user's password (argon2id), validated against the M0 policy. The
// plaintext is never logged or audited — only that a credential was set. By default
// the user must change it on next login (`mustChange:true`), since an admin-set
// password is a temporary credential delivered out-of-band.
export async function setUserPassword(id, password, actor = {}, { mustChange = true } = {}) {
  await assertActorPermission(actor, USER_OP_PERMISSIONS.update);
  const user = await loadUserOrThrow(id);
  // ESCALATION GUARD (DL-049 parity, Session-11 review CRITICAL): resetting a
  // DEVELOPER's credential hands control of an unrestricted-bypass account to
  // whoever receives the new password, so — like updateUser/deleteUser — only a
  // developer may reset a developer's password. Covers forcePasswordReset +
  // fulfilResetRequest, which both funnel through here.
  if (user.isDeveloper) await assertCanSetDeveloper(actor);
  const passwordHash = await hashWithPolicy(password);

  const { user: updated } = await auditedMutation(
    actor,
    async (tx) => ({
      user: await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: !!mustChange, passwordSetAt: new Date() },
      }),
    }),
    ({ user: updated }) => ({
      action: "update",
      entityType: USER_ENTITY,
      entityId: updated.id,
      summary: `Set a new password for ${updated.email}${mustChange ? " (must change on next login)" : ""}`,
    })
  );
  return { user: shapeUser(updated), changed: true };
}

// ── M0 account-lifecycle additions ───────────────────────────────────────────

// Parse a bulk-account CSV (`email,password[,name]` per line; an optional header
// row is detected + skipped). PURE — no DB. Returns { rows, errors } where rows are
// the valid {email, password, name?} to create and errors describe rejected lines
// (bad email, policy-failing password, in-file duplicate email). The actual create
// is bulkCreateUsers; keeping parse pure makes it unit-testable + client-previewable.
export function parseUserCsv(text) {
  const rows = [];
  const errors = [];
  const seen = new Set();
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    const cols = line.split(",").map((c) => c.trim());
    const rawEmail = cols[0] ?? "";
    // Detect + skip a header row: only when the FIRST cell is exactly the label
    // "email" (case-insensitive) — precise, so an invalid first data line that
    // merely contains the substring "email" is still validated, not silently dropped.
    if (i === 0 && rawEmail.toLowerCase() === "email") return;
    const lineNo = i + 1;
    const email = normalizeEmail(rawEmail);
    if (!email) {
      errors.push({ line: lineNo, email: rawEmail, reason: "Invalid email address" });
      return;
    }
    const password = cols[1] ?? "";
    const { ok, errors: pwErrors } = validatePasswordPolicy(password);
    if (!ok) {
      errors.push({ line: lineNo, email, reason: `Password must: ${pwErrors.join("; ")}` });
      return;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) {
      errors.push({ line: lineNo, email, reason: "Duplicate email within the file" });
      return;
    }
    seen.add(key);
    const row = { email, password };
    if (cols[2]) row.name = cols[2];
    // Optional 4th column: a role KEY to grant on creation (e.g. normal_user,
    // coordinator, staff). Unknown/blank → no role. Granted globally (unscoped);
    // scope a role per-user afterward via the row action if needed.
    if (cols[3]) row.role = cols[3];
    rows.push(row);
  });
  return { rows, errors };
}

// Bulk-create admin-provisioned accounts from parsed CSV rows. Idempotent by email:
// an account that already exists is SKIPPED (not overwritten — its password is never
// reset by an import), reported in `skipped`. Each created account is must-change.
// Returns { created: [shaped], skipped: [{email}], failed: [{email, reason}] }.
// One semantic audit row PER created user (via createUser) — no bulk-bypass, since
// account creation is a security-relevant, individually-attributable act.
export async function bulkCreateUsers(rows = [], actor = {}) {
  await assertActorPermission(actor, USER_OP_PERMISSIONS.create);
  const created = [];
  const skipped = [];
  const failed = [];
  for (const r of rows) {
    const email = normalizeEmail(r?.email);
    if (!email) {
      failed.push({ email: r?.email ?? null, reason: "Invalid email" });
      continue;
    }
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      skipped.push({ email });
      continue;
    }
    try {
      const { user } = await createUser(
        { email, password: r.password, name: r.name, mustChangePassword: true },
        actor
      );
      created.push(user);
      // Optional per-row role (4th CSV column) — granted globally after creation.
      // Best-effort: an unknown role / missing role.assign leaves the user created but
      // records a note, rather than failing the whole account.
      if (r.role) {
        try {
          await grantRole({ userId: user.id, roleKey: String(r.role) }, actor);
        } catch (e) {
          failed.push({ email, reason: `Created, but role '${r.role}' not applied: ${e?.message ?? e}` });
        }
      }
    } catch (e) {
      failed.push({ email, reason: e?.message ?? "Create failed" });
    }
  }
  return { created, skipped, failed, summary: { created: created.length, skipped: skipped.length, failed: failed.length } };
}

// Parse a bulk CSV and create the valid rows in one call (the admin UI sends raw
// text). Parse errors (bad email / weak password / in-file dup) are merged into the
// `failed` list so the operator sees every rejected line. Gated via bulkCreateUsers.
export async function importUsersCsv(csv, actor = {}) {
  const { rows, errors } = parseUserCsv(csv);
  const res = await bulkCreateUsers(rows, actor);
  const failed = [
    ...errors.map((e) => ({ email: e.email ?? null, reason: `Line ${e.line}: ${e.reason}` })),
    ...res.failed,
  ];
  return {
    created: res.created,
    skipped: res.skipped,
    failed,
    summary: { created: res.created.length, skipped: res.skipped.length, failed: failed.length },
  };
}

// Generate a random policy-compliant password, set it on the user, and flag
// must_change_password — the admin/dev force-reset (on suspicion) and the
// fulfilment of a password-reset request. Returns the SHAPED user AND the generated
// plaintext ONCE so the operator can deliver it via the institute's external mail
// (it is never stored in plaintext or audited). Gated on user.update.
export async function forcePasswordReset(id, actor = {}) {
  await assertActorPermission(actor, USER_OP_PERMISSIONS.update);
  const password = generatePassword();
  const { user } = await setUserPassword(id, password, actor, { mustChange: true });
  return { user, generatedPassword: password };
}

// Self-service password change (no admin permission — the user changes their OWN
// credential). Verifies the current password, enforces the policy on the new one,
// then clears must_change_password. This is the forced-first-login path. The actor
// IS the subject (id === actor.userId); a system actor may set it for tooling.
export async function changeOwnPassword(id, { currentPassword, newPassword } = {}, actor = {}) {
  if (!actor?.system && actor?.userId !== id) {
    const err = new Error("You can only change your own password.");
    err.status = 403;
    err.code = "FORBIDDEN";
    throw err;
  }
  const user = await loadUserOrThrow(id);
  if (!user.passwordHash) {
    throw new CmsError("This account has no password set; ask an administrator to provision one.", {
      status: 409,
      code: "NO_PASSWORD",
    });
  }
  if (!actor?.system) {
    const ok = await verifyPassword(user.passwordHash, String(currentPassword ?? ""));
    if (!ok) throw new CmsError("Your current password is incorrect.", { status: 403, code: "BAD_CURRENT_PASSWORD" });
  }
  const newStr = String(newPassword ?? "");
  if (user.passwordHash && (await verifyPassword(user.passwordHash, newStr))) {
    throw new CmsValidationError("Your new password must be different from your current one.");
  }
  const passwordHash = await hashWithPolicy(newStr);

  const { user: updated } = await auditedMutation(
    actor,
    async (tx) => ({
      user: await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: false, passwordSetAt: new Date() },
      }),
    }),
    ({ user: updated }) => ({
      action: "update",
      entityType: USER_ENTITY,
      entityId: updated.id,
      summary: `${updated.email} changed their own password`,
    })
  );
  return { user: shapeUser(updated), changed: true };
}

// Hard-delete a user account. Guarded: you cannot delete yourself; deleting a
// DEVELOPER is developer-only (escalation parity with DL-049). One semantic audit
// row is written BEFORE the row is removed (the deleter is the actor and is NOT the
// deleted user, so attribution survives; the deleted user's OWN past audit rows have
// their actor set null by the FK — documented). role_assignment rows cascade.
export async function deleteUser(id, actor = {}) {
  await assertActorPermission(actor, USER_OP_PERMISSIONS.delete);
  if (!actor?.system && id === actor?.userId) {
    throw new CmsError("You cannot delete your own account.", { status: 409, code: "SELF_LOCKOUT" });
  }
  const user = await loadUserOrThrow(id);
  if (user.isDeveloper) await assertCanSetDeveloper(actor); // only a developer can delete a developer

  await auditedMutation(
    actor,
    async (tx) => {
      await tx.user.delete({ where: { id } });
      return { user };
    },
    // auditedMutation writes this row AFTER commit (on the un-extended client); the
    // pre-loaded `before` snapshot preserves the deleted account in the log. The
    // actor is the deleter (not the deleted user), so attribution is intact.
    () => ({
      action: "delete",
      entityType: USER_ENTITY,
      entityId: user.id,
      before: shapeUser(user),
      summary: `Deleted user ${user.email}`,
    })
  );
  return { deleted: true, user: shapeUser(user) };
}

// ── role mutations ───────────────────────────────────────────────────────────

// Create a custom role. `grantsAll` is NEVER settable (reserved for the seeded
// developer role); the new role is non-system. input: { key, name, description?,
// permissionKeys? }
export async function createRole(input = {}, actor = {}) {
  await assertActorPermission(actor, ROLE_OP_PERMISSIONS.create);
  const key = normalizeRoleKey(input.key);
  if (!key) throw new CmsValidationError("A role key is required (lowercase letters, digits and underscores; e.g. 'club_editor').");
  const name = String(input.name ?? "").trim();
  if (!name) throw new CmsValidationError("A role name is required.");

  const existing = await prisma.role.findUnique({ where: { key }, select: { id: true } });
  if (existing) throw new CmsError("A role with that key already exists.", { status: 409, code: "ROLE_KEY_TAKEN" });
  const permissionIds = await resolvePermissionIds(input.permissionKeys);

  const { role } = await auditedMutation(
    actor,
    async (tx) => {
      const role = await tx.role.create({
        data: {
          key,
          name,
          description: input.description ?? null,
          isSystem: false,
          grantsAll: false, // reserved for the seeded developer role (DL-049)
          status: "active",
          createdById: actor?.userId ?? null,
          updatedById: actor?.userId ?? null,
          rolePermissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
        },
      });
      return { role };
    },
    ({ role }) => ({
      action: "create",
      entityType: ROLE_ENTITY,
      entityId: role.id,
      after: { ...shapeRole(role), permissionKeys: input.permissionKeys ?? [] },
      summary: `Created role "${role.name}" (${role.key}) with ${permissionIds.length} permission(s)`,
    })
  );
  return roleView(role.id);
}

// Edit a role. SYSTEM roles (developer / super_admin) are protected: only their
// `description` may change (so an admin cannot strip super_admin's permissions or
// deactivate it and lock everyone out — DL-049). `grantsAll` / `isSystem` / `key`
// are never editable. patch: { name?, description?, status?, permissionKeys? }
export async function updateRole(id, patch = {}, actor = {}) {
  await assertActorPermission(actor, ROLE_OP_PERMISSIONS.update);
  const role = await loadRoleOrThrow(id);

  const touchesProtected =
    patch.name !== undefined ||
    patch.status !== undefined ||
    patch.permissionKeys !== undefined ||
    patch.grantsAll !== undefined ||
    patch.key !== undefined ||
    patch.isSystem !== undefined;
  if (role.isSystem && touchesProtected) {
    throw new CmsError(
      `The system role "${role.name}" is protected — only its description can be edited.`,
      { status: 409, code: "SYSTEM_ROLE_PROTECTED" }
    );
  }

  const data = {};
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new CmsValidationError("Role name cannot be empty.");
    data.name = name;
  }
  if (patch.description !== undefined) data.description = patch.description || null;
  if (patch.status !== undefined) {
    if (!["active", "archived"].includes(patch.status)) throw new CmsValidationError(`Unknown role status '${patch.status}'.`);
    data.status = patch.status;
  }
  const replacingPerms = patch.permissionKeys !== undefined;
  const permissionIds = replacingPerms ? await resolvePermissionIds(patch.permissionKeys) : null;
  if (!Object.keys(data).length && !replacingPerms) return roleView(id);

  const before = await roleView(id);
  // Project the post-write shape from before+patch so the audit before/after are
  // the SAME full role shape (a clean activity-log diff), without an extra read.
  const after = {
    ...before,
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.description !== undefined ? { description: data.description } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...(replacingPerms ? { permissionKeys: [...patch.permissionKeys].map(String).sort() } : {}),
  };
  await auditedMutation(
    actor,
    async (tx) => {
      if (Object.keys(data).length) {
        await tx.role.update({ where: { id }, data: { ...data, updatedById: actor?.userId ?? null } });
      }
      if (replacingPerms) {
        // Replace the permission set wholesale (delete + recreate) so edits are
        // deterministic — mirrors the CMS list-children write strategy.
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissionIds.length) {
          await tx.rolePermission.createMany({ data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })) });
        }
      }
      return { id };
    },
    () => ({
      action: "update",
      entityType: ROLE_ENTITY,
      entityId: id,
      before,
      after,
      summary: `Edited role "${role.name}"${replacingPerms ? ` (${permissionIds.length} permission(s))` : ""}`,
    })
  );
  return roleView(id);
}

// ── role-assignment mutations (grant / revoke) ───────────────────────────────

// Grant a role to a user, optionally scoped to an org-unit lineage and/or year.
// Idempotent: an existing ACTIVE identical grant is returned unchanged (honoring
// the `role_assignment_unique_active_grant_uq` partial unique). input:
// { userId, roleId | roleKey, orgUnitLineageKey?, academicYearId? }
export async function grantRole(input = {}, actor = {}) {
  await assertActorPermission(actor, ROLE_OP_PERMISSIONS.assign);
  // Accept either a userId or an email (the Coordinators mapping UI passes an email).
  let userId = input.userId ?? null;
  if (!userId && input.email) {
    const em = normalizeEmail(input.email);
    const u = em ? await prisma.user.findUnique({ where: { email: em }, select: { id: true } }) : null;
    if (!u) throw new CmsValidationError(`No account exists for ${input.email}. Create the account first.`);
    userId = u.id;
  }
  if (!userId) throw new CmsValidationError("A userId or email is required.");
  await loadUserOrThrow(userId);

  let roleId = input.roleId ?? null;
  if (!roleId && input.roleKey) {
    const r = await prisma.role.findUnique({ where: { key: String(input.roleKey) }, select: { id: true } });
    if (!r) throw new CmsNotFoundError(`Role '${input.roleKey}' not found.`);
    roleId = r.id;
  }
  if (!roleId) throw new CmsValidationError("A roleId or roleKey is required.");
  const role = await prisma.role.findUnique({ where: { id: roleId } });
  if (!role) throw new CmsNotFoundError(`Role ${roleId} not found.`);
  if (role.status !== "active") throw new CmsValidationError("Cannot assign an archived role.");
  // PRIVILEGE-ESCALATION GUARD (DL-049): assigning a grants_all role (developer) or
  // a protected SYSTEM role (developer / super_admin) confers power up to and
  // including the unrestricted bypass — exactly what the is_developer flag guard
  // blocks. role.assign ALONE must not let a (non-developer) super_admin mint that:
  // granting such a role is therefore a developer-only action, mirroring
  // assertCanSetDeveloper. A `system` actor (seed) bypasses.
  if (!actor?.system && (role.grantsAll || role.isSystem)) await assertCanSetDeveloper(actor);

  const orgUnitLineageKey = input.orgUnitLineageKey ?? null;
  const academicYearId = input.academicYearId ?? null;

  // Idempotent no-op for an existing active identical grant (avoids tripping the
  // active-grant partial unique on a re-grant).
  const dup = await prisma.roleAssignment.findFirst({
    where: { userId, roleId, orgUnitLineageKey, academicYearId, revokedAt: null },
    include: { role: { select: { key: true, name: true } }, academicYear: { select: { label: true } } },
  });
  if (dup) return { assignment: shapeAssignment(dup), created: false };

  // ONE-CLUB rule (per academic year): a coordinator maps to at most one club. Reject a
  // club-scoped grant when the user already holds this role at a DIFFERENT club that year
  // ("a single person coordinates one club only") — revoke the existing one first.
  if (ONE_CLUB_ROLE_KEYS.has(role.key) && orgUnitLineageKey && academicYearId) {
    const other = await prisma.roleAssignment.findFirst({
      where: { userId, roleId, academicYearId, revokedAt: null, orgUnitLineageKey: { not: orgUnitLineageKey } },
      select: { id: true },
    });
    if (other) {
      throw new CmsError("This person already coordinates another club this academic year. A coordinator can be mapped to only one club — revoke the existing assignment first.", { status: 409, code: "COORDINATOR_ONE_CLUB" });
    }
  }

  const { assignment } = await auditedMutation(
    actor,
    async (tx) => {
      const created = await tx.roleAssignment.create({
        data: { userId, roleId, orgUnitLineageKey, academicYearId, grantedById: actor?.userId ?? null },
        include: { role: { select: { key: true, name: true } }, academicYear: { select: { label: true } } },
      });
      return { assignment: created };
    },
    ({ assignment }) => ({
      action: "grant_role",
      entityType: ASSIGNMENT_ENTITY,
      entityId: assignment.id,
      academicYearId: assignment.academicYearId,
      after: shapeAssignment(assignment),
      summary: `Granted role "${role.name}" to user ${userId}${
        orgUnitLineageKey ? ` (unit ${orgUnitLineageKey})` : ""
      }${academicYearId ? ` for year ${assignment.academicYear?.label ?? academicYearId}` : ""}`,
    })
  );
  return { assignment: shapeAssignment(assignment), created: true };
}

// Active CLUB-scoped `coordinator` grants for a year, joined to the user — powers the admin
// Coordinators mapping (which club each coordinator is mapped to). Gated on role.read.
export async function listCoordinatorGrants({ yearId } = {}, actor = {}) {
  await assertActorPermission(actor, "role.read");
  if (!yearId) return [];
  const rows = await prisma.roleAssignment.findMany({
    where: { academicYearId: yearId, revokedAt: null, orgUnitLineageKey: { not: null }, role: { key: "coordinator" } },
    select: { id: true, orgUnitLineageKey: true, grantedAt: true, user: { select: { id: true, name: true, email: true, status: true } } },
    orderBy: { grantedAt: "asc" },
  });
  return rows.map((r) => ({
    assignmentId: r.id,
    orgUnitLineageKey: r.orgUnitLineageKey,
    userId: r.user?.id ?? null,
    userName: r.user?.name ?? null,
    userEmail: r.user?.email ?? null,
    userStatus: r.user?.status ?? null,
  }));
}

// Revoke a role assignment (soft — sets revoked_at; never deletes, so the grant
// history survives for audit). Idempotent: an already-revoked grant is a no-op.
export async function revokeRole(assignmentId, actor = {}) {
  await assertActorPermission(actor, ROLE_OP_PERMISSIONS.revoke);
  const existing = await prisma.roleAssignment.findUnique({
    where: { id: assignmentId },
    include: { role: { select: { key: true, name: true } }, academicYear: { select: { label: true } } },
  });
  if (!existing) throw new CmsNotFoundError(`Role assignment ${assignmentId} not found.`);
  if (existing.revokedAt) return { assignment: shapeAssignment(existing), changed: false };

  const { assignment } = await auditedMutation(
    actor,
    async (tx) => {
      const updated = await tx.roleAssignment.update({
        where: { id: assignmentId },
        data: { revokedAt: new Date(), revokedById: actor?.userId ?? null },
        include: { role: { select: { key: true, name: true } }, academicYear: { select: { label: true } } },
      });
      return { assignment: updated };
    },
    ({ assignment }) => ({
      action: "revoke_role",
      entityType: ASSIGNMENT_ENTITY,
      entityId: assignment.id,
      academicYearId: assignment.academicYearId,
      before: shapeAssignment(existing),
      after: shapeAssignment(assignment),
      summary: `Revoked role "${existing.role?.name ?? existing.roleId}" from user ${existing.userId}`,
    })
  );
  return { assignment: shapeAssignment(assignment), changed: true };
}

// ── per-email permission overrides (grant / deny — M2, DL-062) ───────────────

// Read a user's permission overrides (gated on permission.override). The list/get
// views already embed them; this is the focused reader for an API/tooling caller.
export async function listUserOverrides(userId, actor = {}) {
  await assertActorPermission(actor, OVERRIDE_OP_PERMISSION);
  const rows = await prisma.userPermissionOverride.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { permission: { select: { key: true, label: true } }, academicYear: { select: { label: true } } },
  });
  return rows.map(shapeOverride);
}

// ESCALATION GUARD (DL-062, parity with DL-049): a GRANT override hands a single
// catalog permission to an account, so an actor must not be able to grant a
// permission they do not themselves hold (self/puppet escalation). A grant is
// therefore allowed only when the actor is a developer / grants_all super_admin
// (userCan short-circuits to true) OR the actor effectively holds that permission
// AT THE OVERRIDE'S SCOPE. A DENY (de-escalation) needs no such guard. A `system`
// actor (seed/migration) bypasses. Denies/grants on a developer subject are
// harmless — the resolver ignores all overrides for the unrestricted bypass.
async function assertCanGrantPermission(actor, permissionKey, scope) {
  if (actor?.system) return;
  if (await userCan(actor.userId, permissionKey, scope)) return;
  throw new CmsError(
    `You can only grant a permission you hold yourself ('${permissionKey}' at the chosen scope).`,
    { status: 403, code: "OVERRIDE_ESCALATION" }
  );
}

// Set (create or update) a per-email permission override. Idempotent at a scope:
// the NULLS-NOT-DISTINCT unique means ONE override per (user, permission, scope),
// so a re-set with the same mode is a no-op and a flip (grant↔deny) updates in
// place. input: { userId, permissionKey, mode: 'grant'|'deny', orgUnitLineageKey?,
// academicYearId?, reason? }. Authorizes permission.override FIRST; one semantic
// audit row.
export async function setUserOverride(input = {}, actor = {}) {
  await assertActorPermission(actor, OVERRIDE_OP_PERMISSION);
  if (!input.userId) throw new CmsValidationError("A userId is required.");
  const mode = String(input.mode ?? "");
  if (!OVERRIDE_MODES.includes(mode)) throw new CmsValidationError("Override mode must be 'grant' or 'deny'.");
  const permissionKey = String(input.permissionKey ?? "");
  if (!permissionKey) throw new CmsValidationError("A permissionKey is required.");

  await loadUserOrThrow(input.userId);
  const permission = await prisma.permission.findUnique({ where: { key: permissionKey }, select: { id: true, key: true, label: true } });
  if (!permission) throw new CmsValidationError(`Unknown permission key '${permissionKey}'.`);

  const orgUnitLineageKey = input.orgUnitLineageKey ?? null;
  const academicYearId = input.academicYearId ?? null;
  const reason = input.reason ? String(input.reason) : null;

  // Escalation guard applies to GRANTs only (deny is a de-escalation).
  if (mode === "grant") await assertCanGrantPermission(actor, permissionKey, { orgUnitLineageKey, academicYearId });

  // Upsert by (user, permission, scope) — the unique target. Find the existing row
  // (null-safe scope match) so we can no-op / flip in place and audit before/after.
  const existing = await prisma.userPermissionOverride.findFirst({
    where: { userId: input.userId, permissionId: permission.id, orgUnitLineageKey, academicYearId },
    include: { permission: { select: { key: true, label: true } }, academicYear: { select: { label: true } } },
  });
  if (existing && existing.mode === mode && (existing.reason ?? null) === reason) {
    return { override: shapeOverride(existing), changed: false };
  }

  const scopeNote = orgUnitLineageKey ? ` (unit ${orgUnitLineageKey})` : academicYearId ? " (year-scoped)" : " (institute-wide)";
  const { override } = await auditedMutation(
    actor,
    async (tx) => {
      const row = existing
        ? await tx.userPermissionOverride.update({
            where: { id: existing.id },
            data: { mode, reason, createdById: actor?.userId ?? null },
            include: { permission: { select: { key: true, label: true } }, academicYear: { select: { label: true } } },
          })
        : await tx.userPermissionOverride.create({
            data: { userId: input.userId, permissionId: permission.id, mode, orgUnitLineageKey, academicYearId, reason, createdById: actor?.userId ?? null },
            include: { permission: { select: { key: true, label: true } }, academicYear: { select: { label: true } } },
          });
      return { override: row };
    },
    ({ override }) => ({
      action: existing ? "update" : "create",
      entityType: OVERRIDE_ENTITY,
      entityId: override.id,
      academicYearId,
      before: existing ? shapeOverride(existing) : undefined,
      after: shapeOverride(override),
      summary: `${mode === "deny" ? "Denied" : "Granted"} permission "${permissionKey}" ${mode === "deny" ? "to" : "for"} user ${input.userId}${scopeNote}`,
    })
  );
  return { override: shapeOverride(override), changed: true };
}

// Remove a permission override (hard delete — overrides are not historized; the
// audit log records the removal with a before-snapshot). Idempotent-ish: a missing
// id is a 404. Authorizes permission.override FIRST; one semantic audit row.
export async function removeUserOverride(id, actor = {}) {
  await assertActorPermission(actor, OVERRIDE_OP_PERMISSION);
  const existing = await prisma.userPermissionOverride.findUnique({
    where: { id },
    include: { permission: { select: { key: true, label: true } }, academicYear: { select: { label: true } } },
  });
  if (!existing) throw new CmsNotFoundError(`Permission override ${id} not found.`);

  await auditedMutation(
    actor,
    async (tx) => {
      await tx.userPermissionOverride.delete({ where: { id } });
      return { existing };
    },
    () => ({
      action: "delete",
      entityType: OVERRIDE_ENTITY,
      entityId: existing.id,
      academicYearId: existing.academicYearId,
      before: shapeOverride(existing),
      summary: `Removed ${existing.mode} override "${existing.permission?.key ?? existing.permissionId}" from user ${existing.userId}`,
    })
  );
  return { removed: true, override: shapeOverride(existing) };
}

// BULK set the INSTITUTE-WIDE permission overrides for one account (Session 14, DL-102).
// Backs the checkbox grid in the admin Users UI: instead of applying one override at a
// time via a dropdown, the admin ticks grant/deny for many permissions and saves once.
// `entries` is the DESIRED full institute-wide set [{ permissionKey, mode }]; this diffs
// it against the account's current institute-wide (scope null/null) overrides and:
//   • sets/flips each desired override (reusing setUserOverride → escalation guard +
//     one audit row per change), and
//   • removes any institute-wide override no longer desired (reusing removeUserOverride).
// Scoped (unit/year) overrides are left untouched — those remain API-managed (DL-062).
// Steps are applied sequentially (NOT one giant tx) per the Neon-latency rule (DL-031).
export async function setUserOverrides(userId, entries = [], actor = {}) {
  await assertActorPermission(actor, OVERRIDE_OP_PERMISSION);
  if (!userId) throw new CmsValidationError("A userId is required.");
  if (!Array.isArray(entries)) throw new CmsValidationError("entries must be an array.");
  await loadUserOrThrow(userId);

  // Desired institute-wide overrides, deduped by permissionKey (last wins).
  const desired = new Map();
  for (const e of entries) {
    const permissionKey = String(e?.permissionKey ?? "");
    if (!permissionKey) continue;
    const mode = String(e?.mode ?? "");
    if (!OVERRIDE_MODES.includes(mode)) throw new CmsValidationError(`Override mode for '${permissionKey}' must be 'grant' or 'deny'.`);
    desired.set(permissionKey, mode);
  }

  // Current INSTITUTE-WIDE overrides (scope null/null) for this account.
  const current = await prisma.userPermissionOverride.findMany({
    where: { userId, orgUnitLineageKey: null, academicYearId: null },
    include: { permission: { select: { key: true } } },
  });
  const currentByKey = new Map(current.map((o) => [o.permission.key, o]));

  let applied = 0;
  let removed = 0;
  // Set / flip the desired overrides (setUserOverride no-ops an unchanged one).
  for (const [permissionKey, mode] of desired) {
    const existing = currentByKey.get(permissionKey);
    if (existing && existing.mode === mode) continue;
    await setUserOverride({ userId, permissionKey, mode }, actor);
    applied++;
  }
  // Remove institute-wide overrides that are no longer desired.
  for (const o of current) {
    if (!desired.has(o.permission.key)) {
      await removeUserOverride(o.id, actor);
      removed++;
    }
  }
  return { applied, removed };
}
