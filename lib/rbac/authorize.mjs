// Server-side authorization engine — the SINGLE source of permission decisions
// for all protected handlers. Replaces the V1 hardcoded email allowlist
// (KNOWN_ISSUES #8): access is now derived live from role_assignment +
// role_permission in the DB, so admins change without a code edit/redeploy.
//
// Because sessions are JWT (DECISION_LOG DL-013), permissions are resolved LIVE
// from the DB on every protected action — a revoked role takes effect on the
// next request, not on token refresh. The JWT only proves identity.
//
// Permission model (M2 / DL-062): additive UNION across a user's in-scope active
// assignments, THEN per-user overrides (grant adds, deny removes — DENY WINS),
// with a grants_all / is_developer short-circuit BEFORE overrides. This REVISES
// DL-026 #8's original "no negative/deny permissions" rule: a deny override can
// now subtract a permission a role granted. The unrestricted bypass (developer /
// grants_all) is intentionally NEVER restricted by an override.
import prisma from "../prisma.mjs";

// An assignment/override applies to a request iff, for each scope dimension, it is
// unscoped (NULL = "all") OR equals the requested value. A NULL request value with
// a non-NULL scope does NOT match (the grant is narrower than the request). Used
// for BOTH role_assignment rows and permission overrides (same scope columns).
function inScope(scoped, scope) {
  if (scoped.orgUnitLineageKey != null && scoped.orgUnitLineageKey !== scope.orgUnitLineageKey) {
    return false;
  }
  if (scoped.academicYearId != null && scoped.academicYearId !== scope.academicYearId) {
    return false;
  }
  return true;
}

// PURE resolver (unit-testable without a DB). `user` => { isDeveloper }.
// `assignments` => [{ orgUnitLineageKey, academicYearId, revokedAt,
//   role: { grantsAll }, permissionKeys: string[] }].
// `overrides` => [{ orgUnitLineageKey, academicYearId, mode: 'grant'|'deny',
//   permissionKey }] — per-user grant/deny applied AFTER the role union (M2).
export function resolveEffectivePermissions(user, assignments, scope = {}, overrides = []) {
  if (user?.isDeveloper) {
    return { grantsAll: true, permissions: new Set(), denied: new Set() };
  }
  const permissions = new Set();
  let grantsAll = false;
  for (const a of assignments) {
    if (a.revokedAt) continue;
    if (!inScope(a, scope)) continue;
    if (a.role?.grantsAll) grantsAll = true;
    for (const key of a.permissionKeys ?? []) permissions.add(key);
  }
  // A grants_all role is the unrestricted bypass — short-circuit BEFORE overrides
  // (an override never restricts the bypass; mirrors the is_developer rule above).
  if (grantsAll) {
    return { grantsAll: true, permissions: new Set(), denied: new Set() };
  }

  // Apply per-user overrides. Grants are added first, then denies subtract — so
  // DENY WINS even against a grant override (or a role) at any applicable scope,
  // independent of array order. `denied` is returned for UI/explainability.
  const inScopeOverrides = overrides.filter((o) => inScope(o, scope));
  for (const o of inScopeOverrides) {
    if (o.mode === "grant" && o.permissionKey) permissions.add(o.permissionKey);
  }
  const denied = new Set();
  for (const o of inScopeOverrides) {
    if (o.mode === "deny" && o.permissionKey) {
      permissions.delete(o.permissionKey);
      denied.add(o.permissionKey);
    }
  }
  return { grantsAll: false, permissions, denied };
}

export function can(resolved, permissionKey) {
  return resolved.grantsAll === true || resolved.permissions.has(permissionKey);
}

// DB-backed resolution for a real user id.
export async function getEffectivePermissions(userId, scope = {}) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isDeveloper: true, status: true },
  });
  if (!user || user.status !== "active") {
    return { grantsAll: false, permissions: new Set(), user: user ?? null };
  }
  if (user.isDeveloper) {
    return { grantsAll: true, permissions: new Set(), user };
  }

  const [assignments, overrides] = await Promise.all([
    prisma.roleAssignment.findMany({
      where: { userId, revokedAt: null, role: { status: "active" } },
      select: {
        orgUnitLineageKey: true,
        academicYearId: true,
        revokedAt: true,
        role: {
          select: {
            grantsAll: true,
            rolePermissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    }),
    // M2: per-user grant/deny overrides (deny wins). Loaded for every non-developer
    // resolution; indexed by user_id. A grants_all role makes them moot (the
    // resolver short-circuits), but loading them is cheap and keeps one code path.
    prisma.userPermissionOverride.findMany({
      where: { userId },
      select: { orgUnitLineageKey: true, academicYearId: true, mode: true, permission: { select: { key: true } } },
    }),
  ]);

  const normalized = assignments.map((a) => ({
    orgUnitLineageKey: a.orgUnitLineageKey,
    academicYearId: a.academicYearId,
    revokedAt: a.revokedAt,
    role: { grantsAll: a.role.grantsAll },
    permissionKeys: a.role.rolePermissions.map((rp) => rp.permission.key),
  }));
  const normalizedOverrides = overrides.map((o) => ({
    orgUnitLineageKey: o.orgUnitLineageKey,
    academicYearId: o.academicYearId,
    mode: o.mode,
    permissionKey: o.permission.key,
  }));

  return { ...resolveEffectivePermissions(user, normalized, scope, normalizedOverrides), user };
}

export async function userCan(userId, permissionKey, scope = {}) {
  const resolved = await getEffectivePermissions(userId, scope);
  return can(resolved, permissionKey);
}

// Throws a 403-shaped error when the user lacks the permission. Use in handlers
// that already have a userId; route entrypoints should prefer
// lib/auth/session.mjs#requirePermission (which also enforces authentication).
export async function assertPermission(userId, permissionKey, scope = {}) {
  if (!(await userCan(userId, permissionKey, scope))) {
    const err = new Error(`Forbidden: missing permission '${permissionKey}'`);
    err.status = 403;
    err.code = "FORBIDDEN";
    throw err;
  }
}
