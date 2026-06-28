// Handler-facing auth helpers. Protected route handlers call requireUser() /
// requirePermission() — the single entrypoint that enforces BOTH authentication
// (a valid session) and authorization (a live DB permission check).
import { getServerSession } from "next-auth/next";
import { authOptions } from "./options.mjs";
import prisma from "../prisma.mjs";
import { getEffectivePermissions, can } from "../rbac/authorize.mjs";

export function getServerAuthSession() {
  return getServerSession(authOptions);
}

// Returns the session user or throws a 401-shaped error. Re-checks account
// status LIVE from the DB so a user suspended/disabled after their JWT was issued
// is rejected at the protected-route boundary (JWT sessions are not server-
// revocable; this closes that gap for protected handlers — DL-019).
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
