// Handler-facing auth helpers. Protected route handlers call requireUser() /
// requirePermission() — the single entrypoint that enforces BOTH authentication
// (a valid session) and authorization (a live DB permission check).
import { getServerSession } from "next-auth/next";
import { authOptions } from "./options.mjs";
import prisma from "../prisma.mjs";
import { getEffectivePermissions, can } from "../rbac/authorize.mjs";
import { canLogin, canParticipate, canViewNormal } from "./access.mjs";

export function getServerAuthSession() {
  return getServerSession(authOptions);
}

// THE BACK-OFFICE boundary. Returns the session user or throws a 401/403-shaped
// error. Re-checks account status LIVE from the DB so a user whose account changed
// after their JWT was issued is re-evaluated at the protected-route boundary (JWT
// sessions are not server-revocable; this closes that gap for protected handlers —
// DL-019). Admin/dev surfaces require status === 'active': an `inactive` account has
// no back-office permissions anyway (the RBAC resolver returns none for non-active),
// and a `revoked` account cannot even authenticate. Member (normal-view) surfaces
// use requireMember(), which DOES admit `inactive`.
export async function requireUser() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    const err = new Error("Unauthorized");
    err.status = 401;
    err.code = "UNAUTHENTICATED";
    throw err;
  }
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { status: true },
  });
  if (!account || account.status !== "active") {
    const err = new Error("Account is not active");
    err.status = 403;
    err.code = "ACCOUNT_INACTIVE";
    throw err;
  }
  return session.user;
}

// THE MEMBER (normal-view) boundary (M1, DL-065/067). Admits `active` AND `inactive`
// accounts (both may log in and browse the member experience) but rejects `revoked`
// (which also can't authenticate in the first place — defense in depth) and any
// account whose per-account `allowNormalView` toggle is off. Status + the toggle are
// read LIVE (DL-019). Returns a decorated member object the member pages render from.
export async function requireMember() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    const err = new Error("Unauthorized");
    err.status = 401;
    err.code = "UNAUTHENTICATED";
    throw err;
  }
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, status: true, allowNormalView: true, isDeveloper: true },
  });
  if (!account || !canLogin(account.status)) {
    const err = new Error("Account access has been revoked.");
    err.status = 403;
    err.code = "ACCOUNT_REVOKED";
    throw err;
  }
  if (!canViewNormal(account.status, account.allowNormalView)) {
    const err = new Error("The member view is not enabled for this account.");
    err.status = 403;
    err.code = "NORMAL_VIEW_DISABLED";
    throw err;
  }
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    status: account.status,
    isDeveloper: !!account.isDeveloper,
    allowNormalView: account.allowNormalView !== false,
    canParticipate: canParticipate(account.status),
  };
}

// THE EVENT-PARTICIPATION capability (M1, modelled now for M5 to reuse unchanged).
// `active` may participate; `inactive` is barred. Accepts either the decorated member
// object from requireMember() (uses its already-live `status`) or a raw userId string
// (reads status LIVE). Throws a 403-shaped error when participation is not permitted.
export async function assertCanParticipate(memberOrUserId) {
  let status;
  if (memberOrUserId && typeof memberOrUserId === "object" && "status" in memberOrUserId) {
    status = memberOrUserId.status;
  } else {
    const id = typeof memberOrUserId === "string" ? memberOrUserId : memberOrUserId?.id;
    const account = id ? await prisma.user.findUnique({ where: { id }, select: { status: true } }) : null;
    status = account?.status;
  }
  if (!canParticipate(status)) {
    const err = new Error("Your account cannot participate in events.");
    err.status = 403;
    err.code = "PARTICIPATION_DISABLED";
    throw err;
  }
}

// Enforces a permission for the current session user, optionally scoped to an
// org-unit lineage and/or academic year. Throws 401 if unauthenticated, 403 if
// unauthorized. Returns { user, resolved } on success.
export async function requirePermission(permissionKey, scope = {}) {
  const user = await requireUser();
  const resolved = await getEffectivePermissions(user.id, scope);
  if (!can(resolved, permissionKey)) {
    const err = new Error(`Forbidden: missing permission '${permissionKey}'`);
    err.status = 403;
    err.code = "FORBIDDEN";
    throw err;
  }
  return { user, resolved };
}

// SCOPED-ROUTE access (M1, DL-066) — the named seam for per-unit/per-year route
// gating (coordinator → own club page; secretary → own council; staff → playground
// / central announcements). It is requirePermission with an explicit scope: the live
// resolver (lib/rbac/authorize.mjs) matches the user's role_assignment scope columns
// against the requested (org-unit-lineage, year), so a coordinator scoped to club X's
// lineage passes for X and is 403'd for club Y. Reused by M3/M5 route guards.
export async function requireScopedPermission(permissionKey, { orgUnitLineageKey = null, academicYearId = null } = {}) {
  return requirePermission(permissionKey, { orgUnitLineageKey, academicYearId });
}
