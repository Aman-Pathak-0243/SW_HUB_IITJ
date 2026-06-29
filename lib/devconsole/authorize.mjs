// Developer-console authorization gate (Session 8). The console is a read-mostly
// operational surface; each surface is gated on ONE OR MORE permission keys
// (dev.console / audit.read / backup.*). The permission model is an additive UNION
// with a grants_all / is_developer short-circuit (DL-019), so a caller holding ANY
// one of the listed keys is authorized — this `assertAnyPermission`-style gate is
// the only thing the console layer adds on top of the existing RBAC engine.
//
// It mirrors the service-layer convention (lib/media/migrate.mjs#authorizeMigrate):
// an `actor` object — `{ userId }` for a real user, or `{ system: true }` for
// seeds / CLI scripts / tests — and a `system` bypass. Console operations are
// institute-wide, so the scope is always global ({}). Route handlers (Session 9 UI
// + the Session-8 /api/dev/* routes) still call requirePermission FIRST to enforce
// authentication + a single key at the boundary; this gate is the service-layer
// defense-in-depth that also runs when a script/test calls a reader directly.
import { getEffectivePermissions, can } from "../rbac/authorize.mjs";

// Throw a 401-shaped error (no actor) or 403-shaped error (actor lacks every key).
// Returns the resolved permission set on success so a caller can reuse it.
export async function authorizeConsole(actor, permissionKeys) {
  if (actor?.system) return { grantsAll: true, permissions: new Set(), system: true };
  if (!actor?.userId) {
    const err = new Error("An actor user id is required for the developer console.");
    err.status = 401;
    err.code = "UNAUTHENTICATED";
    throw err;
  }
  const keys = Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys];
  const resolved = await getEffectivePermissions(actor.userId, {});
  if (!keys.some((k) => can(resolved, k))) {
    const err = new Error(`Forbidden: the developer console requires one of [${keys.join(", ")}].`);
    err.status = 403;
    err.code = "FORBIDDEN";
    throw err;
  }
  return resolved;
}
