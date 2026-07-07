// Forced first-login password change — the PURE routing decision (M0, DL-058).
// An authenticated user whose token carries `mustChangePassword` is redirected to
// the change-password page for every request except an allowlist (the change page
// itself, the change API, the NextAuth endpoints, sign-out, and framework/static
// assets). Kept pure + unit-tested; the edge middleware (middleware.js) is a thin
// wrapper that reads the JWT and applies this decision.
//
// NOTE: this depends ONLY on the JWT flag, never a DB read — so it is safe on the
// Edge runtime AND it is naturally inert when the member platform plugin is OFF
// (no account is ever flagged must-change while the plugin is disabled).

export const PASSWORD_CHANGE_PATH = "/account/password";

// Paths an authenticated must-change user may still reach (so they can actually
// change their password and sign out, and so assets/auth callbacks keep working).
const ALLOW_PREFIXES = [
  PASSWORD_CHANGE_PATH,
  "/api/account/password", // the self-service change endpoint
  "/api/auth", // NextAuth (session, signout, csrf, callbacks)
  "/_next",
  "/favicon",
];

// True when this exact path is allowed through without forcing the change.
export function isPasswordChangeExempt(pathname) {
  if (!pathname) return true;
  return ALLOW_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
}

// The core decision: should this request be redirected to the change-password page?
// `mustChange` is the token flag; `pathname` is the requested path.
export function shouldForcePasswordChange({ mustChange, pathname }) {
  if (!mustChange) return false;
  return !isPasswordChangeExempt(pathname);
}
