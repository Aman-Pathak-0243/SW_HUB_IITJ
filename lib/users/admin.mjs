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
//   • You cannot suspend / disable your OWN account (self-lockout guard).
import prisma from "../prisma.mjs";
import { assertActorPermission } from "../year/context.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsValidationError, CmsNotFoundError, CmsError } from "../cms/errors.mjs";
import { hashPassword } from "../auth/password.mjs";

const USER_ENTITY = "app_user";
const ROLE_ENTITY = "role";
const ASSIGNMENT_ENTITY = "role_assignment";

// app_user.status (UserStatus enum) — the states an admin can set.
export const USER_STATUSES = ["active", "suspended", "invited", "disabled"];

// Permission key per mutating op (capability-3 grain; keys in lib/rbac/permissions.mjs).
export const USER_OP_PERMISSIONS = {
  create: "user.create",
  update: "user.update",
  suspend: "user.suspend",
};
export const ROLE_OP_PERMISSIONS = {
  create: "role.create",
  update: "role.update",
  assign: "role.assign",
  revoke: "role.revoke",
};

// ── PURE helpers (no DB; unit-tested) ───────────────────────────────────────

// Trim + lower-bound validate an email. The DB column is citext (case-insensitive
// unique); we still normalize whitespace and require a single @ with a dotted host.
export function normalizeEmail(raw) {
  const email = String(raw ?? "").trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

// A role key must be a stable, lowercase dotted/underscored slug (matches the
// seeded keys: developer, super_admin, content_editor, …). PURE + exported.
export function normalizeRoleKey(raw) {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key || !/^[a-z][a-z0-9_]*$/.test(key)) return null;
  return key;
}

// Compact, JSON-safe snapshot of an app_user for audit before/after (never the
// password hash). Exported for the view layer.
export function shapeUser(u, { roles } = {}) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name ?? null,
    isDeveloper: u.isDeveloper ?? false,
    status: u.status,
    hasPassword: u.passwordHash != null,
    lastLoginAt: u.lastLoginAt instanceof Date ? u.lastLoginAt.toISOString() : u.lastLoginAt ?? null,
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt ?? null,
    ...(roles !== undefined ? { roles } : {}),
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

// List users (newest first) with their ACTIVE role keys, optional status / search.
export async function listUsers({ status, search, take = 200 } = {}, actor = {}) {
  await assertActorPermission(actor, "user.read");
  const where = {};
  if (status) where.status = status;
  if (search) where.OR = [{ email: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }];
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
    },
  });
  return rows.map((u) =>
    shapeUser(u, {
      roles: u.roleAssignments.map((ra) => ({
        assignmentId: ra.id,
        key: ra.role.key,
        name: ra.role.name,
        orgUnitLineageKey: ra.orgUnitLineageKey,
        academicYearId: ra.academicYearId,
        academicYearLabel: ra.academicYear?.label ?? null,
      })),
    })
  );
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
    },
  });
  if (!u) throw new CmsNotFoundError(`User ${id} not found.`);
  return { ...shapeUser(u), assignments: u.roleAssignments.map(shapeAssignment) };
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

// Create (invite) a user. A password is optional — without one, the account can
// still sign in via Google (account-linking by email) once status is active.
// input: { email, name?, isDeveloper?, status?, password? }
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

  const passwordHash = input.password ? await hashPassword(String(input.password)) : null;
  const name = String(input.name ?? "").trim() || email;

  const { user } = await auditedMutation(
    actor,
    async (tx) => {
      const created = await tx.user.create({
        data: { email, name, passwordHash, isDeveloper: !!input.isDeveloper, status },
      });
      return { user: created };
    },
    ({ user }) => ({
      action: "create",
      entityType: USER_ENTITY,
      entityId: user.id,
      after: shapeUser(user),
      summary: `Created user ${user.email}${user.isDeveloper ? " (developer)" : ""}`,
    })
  );
  // Return the SHAPED row — never hand the raw record (with password_hash) back to
  // a caller / the API client. Mirrors updateUser / setUserStatus.
  return { user: shapeUser(user) };
}

// Edit a user's profile fields (display name + developer flag). Status changes go
// through setUserStatus; password through setUserPassword. patch: { name?, isDeveloper? }
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

// Set a user's account status (active / suspended / invited / disabled). Because
// authorization is resolved live per request (DL-019), a suspended/disabled user
// is blocked on their NEXT protected request — no session table to clear. You
// cannot suspend/disable your OWN account (self-lockout guard).
export async function setUserStatus(id, status, actor = {}) {
  await assertActorPermission(actor, USER_OP_PERMISSIONS.suspend);
  if (!USER_STATUSES.includes(status)) throw new CmsValidationError(`Unknown user status '${status}'.`);
  if (!actor?.system && id === actor?.userId && status !== "active") {
    throw new CmsError("You cannot suspend or disable your own account.", { status: 409, code: "SELF_LOCKOUT" });
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

// Set / reset a user's password (argon2id). The plaintext is never logged or
// audited — only that a credential was set.
export async function setUserPassword(id, password, actor = {}) {
  await assertActorPermission(actor, USER_OP_PERMISSIONS.update);
  const user = await loadUserOrThrow(id);
  const passwordHash = await hashPassword(String(password ?? "")); // enforces MIN_PASSWORD_LENGTH

  const { user: updated } = await auditedMutation(
    actor,
    async (tx) => ({ user: await tx.user.update({ where: { id }, data: { passwordHash } }) }),
    ({ user: updated }) => ({
      action: "update",
      entityType: USER_ENTITY,
      entityId: updated.id,
      summary: `Set a new password for ${updated.email}`,
    })
  );
  return { user: shapeUser(updated), changed: true };
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
  if (!input.userId) throw new CmsValidationError("A userId is required.");
  await loadUserOrThrow(input.userId);

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
    where: { userId: input.userId, roleId, orgUnitLineageKey, academicYearId, revokedAt: null },
    include: { role: { select: { key: true, name: true } }, academicYear: { select: { label: true } } },
  });
  if (dup) return { assignment: shapeAssignment(dup), created: false };

  const { assignment } = await auditedMutation(
    actor,
    async (tx) => {
      const created = await tx.roleAssignment.create({
        data: { userId: input.userId, roleId, orgUnitLineageKey, academicYearId, grantedById: actor?.userId ?? null },
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
      summary: `Granted role "${role.name}" to user ${input.userId}${
        orgUnitLineageKey ? ` (unit ${orgUnitLineageKey})` : ""
      }${academicYearId ? ` for year ${assignment.academicYear?.label ?? academicYearId}` : ""}`,
    })
  );
  return { assignment: shapeAssignment(assignment), created: true };
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
