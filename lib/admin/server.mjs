// Admin Panel server context (Session 9) — SERVER-ONLY (imports the auth session +
// the prisma-backed RBAC engine). Server Components call `loadAdminContext()` to
// gate + decorate the shell; it NEVER throws (the panel renders a sign-in / denied
// state instead). Mutations still go through the gated /api/admin/action route.
//
// (It imports prisma, so it is server-only de facto — bundling it into a Client
// Component would fail at build; we don't depend on the `server-only` marker pkg.)
import { getServerAuthSession } from "../auth/session.mjs";
import { getEffectivePermissions } from "../rbac/authorize.mjs";
import prisma from "../prisma.mjs";
import { buildAdminNav, hasAnyAdminAccess, canAccessModule, serializePermissions } from "./nav.mjs";

// Resolve who is viewing the admin panel and what they can see. Returns a discriminated
// shape the layout branches on: 'unauthenticated' | 'inactive' | 'no-access' | 'ok'.
export async function loadAdminContext() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return { state: "unauthenticated" };

  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, isDeveloper: true, status: true },
  });
  if (!account || account.status !== "active") {
    return { state: "inactive", user: { email: account?.email ?? session.user.email ?? null } };
  }

  const resolved = await getEffectivePermissions(account.id, {});
  if (!hasAnyAdminAccess(resolved)) {
    return { state: "no-access", user: { id: account.id, email: account.email, name: account.name } };
  }

  return {
    state: "ok",
    user: { id: account.id, email: account.email, name: account.name, isDeveloper: account.isDeveloper },
    resolved,
    nav: buildAdminNav(resolved),
    perms: serializePermissions(resolved),
  };
}

// Page-level guard: load the context and additionally confirm a specific module is
// visible. Returns the same shape, downgraded to 'no-access' when the module is not.
export async function loadModuleContext(moduleKey) {
  const ctx = await loadAdminContext();
  if (ctx.state !== "ok") return ctx;
  if (!canAccessModule(ctx.resolved, moduleKey)) return { ...ctx, state: "no-access" };
  return ctx;
}
