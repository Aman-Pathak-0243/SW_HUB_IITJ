// Access modes & surface routing (M1, DL-065/066/067) — PURE, client-safe helpers
// (no DB, no server-only imports) so the SAME matrix backs the live server gates
// (lib/auth/session.mjs, lib/auth/options.mjs) AND any client UI, with zero drift
// (the DL-051 mirrored-helper pattern). The server modules are the authority; these
// encode the decisions they enforce.
//
// THREE STATUS MODES:
//   • active   — full access: log in, browse, see own achievements, AND participate
//                in events (the future M5 playground).
//   • inactive — can log in + browse + see own achievements, but CANNOT participate
//                in events. (No event-participation feature exists yet — the gate is
//                modelled now via `canParticipate` so M5 reuses it unchanged.)
//   • revoked  — cannot log in at all (rejected at the credentials authorize, the
//                signIn callback, and the requireMember boundary); sees only the
//                public, unauthenticated site.

// The states an admin/dev can set (the UserStatus enum, post-M1 migration).
export const USER_STATUSES = ["active", "inactive", "revoked"];

export function isKnownStatus(status) {
  return USER_STATUSES.includes(status);
}

// CAN THIS STATUS AUTHENTICATE? active + inactive may log in; revoked (and any
// unknown/missing value, fail-safe) may not. The login gates and requireMember use
// this; a revoked account is rejected before a session is ever issued.
export function canLogin(status) {
  return status === "active" || status === "inactive";
}

// CAN THIS STATUS PARTICIPATE IN EVENTS? active only. inactive is explicitly barred
// (it can still browse + see its own achievements). This is the reusable capability
// M5's event playground will gate registration/scoring/attendance on.
export function canParticipate(status) {
  return status === "active";
}

// CAN THIS ACCOUNT SEE THE AUTHENTICATED MEMBER (normal) VIEW? It must be able to
// log in AND have the per-account `allowNormalView` toggle on (DL-067). A revoked
// account never sees it; an account whose toggle is off is held out of the member
// experience even while it can authenticate.
export function canViewNormal(status, allowNormalView = true) {
  return canLogin(status) && allowNormalView !== false;
}

// A compact, JSON-safe description of an account's access — handy for the member
// view, an "explain my access" panel, and the access-matrix tests.
export function describeAccess(status, allowNormalView = true) {
  return {
    status,
    canLogin: canLogin(status),
    canParticipate: canParticipate(status),
    canViewNormal: canViewNormal(status, allowNormalView),
  };
}

// THREE SURFACES (DL-066). Which dashboard a logged-in user lands on, derived from
// primitives the caller already has (kept dependency-light like lib/admin/nav.mjs —
// no prisma import — so it stays client-safe):
//   • developer    — app_user.is_developer (the unrestricted bypass / dev console).
//   • admin        — has at least one admin-panel module visible (back-office).
//   • member       — everyone else who can log in (the normal/member view).
export function resolveSurface({ isDeveloper = false, hasAdminAccess = false } = {}) {
  if (isDeveloper) return "developer";
  if (hasAdminAccess) return "admin";
  return "member";
}

// SCOPED-ROUTE matching (DL-066). Does a grant's (org-unit-lineage, year) scope
// cover a requested route scope? A NULL grant dimension means "all" (institute-wide
// / all-years); a non-NULL dimension must equal the request. This mirrors the exact
// `inScope` predicate in lib/rbac/authorize.mjs (role_assignment + override scope),
// restated here pure so route guards and tests share one rule (coordinator → own
// club lineage only; secretary → own council; staff → playground/announcements).
export function scopeMatches(grantScope = {}, routeScope = {}) {
  if (grantScope.orgUnitLineageKey != null && grantScope.orgUnitLineageKey !== routeScope.orgUnitLineageKey) {
    return false;
  }
  if (grantScope.academicYearId != null && grantScope.academicYearId !== routeScope.academicYearId) {
    return false;
  }
  return true;
}
