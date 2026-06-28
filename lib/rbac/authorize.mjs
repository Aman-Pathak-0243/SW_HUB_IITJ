// Server-side authorization engine — the SINGLE source of permission decisions
// for all protected handlers. Replaces the V1 hardcoded email allowlist
// (KNOWN_ISSUES #8): access is now derived live from role_assignment +
// role_permission in the DB, so admins change without a code edit/redeploy.
//
// Because sessions are JWT (DECISION_LOG DL-013), permissions are resolved LIVE
// from the DB on every protected action — a revoked role takes effect on the
// next request, not on token refresh. The JWT only proves identity.
//
// Permission model: additive UNION across a user's in-scope active assignments,
// with a grants_all / is_developer short-circuit. No negative/deny permissions.
import prisma from "../prisma.mjs";

// An assignment applies to a request iff, for each scope dimension, the
// assignment is unscoped (NULL = "all") OR equals the requested value.
// A NULL request value with a non-NULL assignment scope does NOT match (the
// assignment is narrower than the request).
function inScope(assignment, scope) {
  if (assignment.orgUnitLineageKey != null && assignment.orgUnitLineageKey !== scope.orgUnitLineageKey) {
    return false;
  }
  if (assignment.academicYearId != null && assignment.academicYearId !== scope.academicYearId) {
    return false;
  }
  return true;
}

// PURE resolver (unit-testable without a DB). `user` => { isDeveloper }.
// `assignments` => [{ orgUnitLineageKey, academicYearId, revokedAt,
//   role: { grantsAll }, permissionKeys: string[] }].
export function resolveEffectivePermissions(user, assignments, scope = {}) {
  if (user?.isDeveloper) {
    return { grantsAll: true, permissions: new Set() };
  }
  const permissions = new Set();
  let grantsAll = false;
  for (const a of assignments) {
    if (a.revokedAt) continue;
    if (!inScope(a, scope)) continue;
    if (a.role?.grantsAll) grantsAll = true;
    for (const key of a.permissionKeys ?? []) permissions.add(key);
  }
  return { grantsAll, permissions };
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

  const assignments = await prisma.roleAssignment.findMany({
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
  });

  const normalized = assignments.map((a) => ({
    orgUnitLineageKey: a.orgUnitLineageKey,
    academicYearId: a.academicYearId,
    revokedAt: a.revokedAt,
    role: { grantsAll: a.role.grantsAll },
    permissionKeys: a.role.rolePermissions.map((rp) => rp.permission.key),
  }));

  return { ...resolveEffectivePermissions(user, normalized, scope), user };
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
