// Member (normal-view) server context (M1, DL-065/066/067) — SERVER-ONLY (imports
// the auth session + the prisma-backed RBAC engine + the plugin gate). The member
// page calls `loadMemberContext()` to gate + decorate the normal view; like
// lib/admin/server.mjs#loadAdminContext it NEVER throws — it returns a discriminated
// state the page branches on, so a revoked / view-disabled / signed-out visitor sees
// a friendly state instead of a 500.
//
// States: 'plugin-off' (the page calls notFound() — the member surface is invisible
// while the member_platform plugin is off, DL-058) | 'unauthenticated' | 'revoked'
// | 'view-disabled' (the per-account allow-normal-view toggle is off) | 'ok'.
import { cache } from "react";
import { getServerAuthSession } from "../auth/session.mjs";
import { getEffectivePermissions } from "../rbac/authorize.mjs";
import { listManageableLineages } from "../rbac/grants.mjs";
import { hasAnyAdminAccess } from "../admin/nav.mjs";
import { isMemberPlatformEnabled } from "../platform/flags.mjs";
import { canLogin, canViewNormal, resolveSurface, describeAccess } from "../auth/access.mjs";
import prisma from "../prisma.mjs";

export const loadMemberContext = cache(async () => {
  // Fail-closed plugin gate (DL-058): a DB hiccup degrades to "off" → the page 404s.
  let enabled = false;
  try {
    enabled = await isMemberPlatformEnabled();
  } catch {
    enabled = false;
  }
  if (!enabled) return { state: "plugin-off" };

  const session = await getServerAuthSession();
  if (!session?.user?.id) return { state: "unauthenticated" };

  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, status: true, allowNormalView: true, isDeveloper: true },
  });
  if (!account || !canLogin(account.status)) {
    return { state: "revoked", user: { email: account?.email ?? session.user.email ?? null } };
  }
  if (!canViewNormal(account.status, account.allowNormalView)) {
    return { state: "view-disabled", user: { email: account.email } };
  }

  // Surface routing (DL-066): developer → dev dashboard; any admin-module access →
  // admin dashboard; else the member view. Resolved live from the RBAC engine so a
  // scoped coordinator/secretary/staff grant lights up the relevant back-office link.
  let hasAdminAccess = false;
  try {
    const resolved = await getEffectivePermissions(account.id, {});
    hasAdminAccess = hasAnyAdminAccess(resolved);
  } catch {
    hasAdminAccess = false; // degrade: still show the member view
  }

  // The back office (admin + developer surfaces) is ACTIVE-ONLY (requireUser /
  // loadAdminContext). So gate BOTH surface inputs on active status: hasAdminAccess
  // is already false for non-active (getEffectivePermissions short-circuits), and the
  // developer flag must be gated the same way — otherwise an INACTIVE developer would
  // be routed to surface="developer" and shown a /admin link the active-only admin
  // boundary then denies (a dead link). An inactive developer correctly falls back to
  // the member surface.
  const isActive = account.status === "active";

  // Does this member also COORDINATE a unit (a SCOPED event.manage / membership.manage
  // grant)? Such a grant is invisible to the global permission resolution above, so a
  // purely-scoped coordinator has hasAdminAccess=false yet still has a back-office surface
  // at /coordinator (Session 13, DL-096 — KNOWN_ISSUES #43). Best-effort: a discovery
  // error degrades to no link. Non-active accounts resolve to zero scoped grants (the RBAC
  // loader returns nothing for them), so an inactive coordinator correctly shows no link.
  let coordinates = false;
  try {
    coordinates = (await listManageableLineages(account.id, ["event.manage", "membership.manage"])).length > 0;
  } catch {
    coordinates = false;
  }

  return {
    state: "ok",
    member: {
      id: account.id,
      email: account.email,
      name: account.name,
      status: account.status,
      isDeveloper: !!account.isDeveloper,
    },
    surface: resolveSurface({ isDeveloper: isActive && account.isDeveloper, hasAdminAccess }),
    hasAdminAccess,
    coordinates,
    access: describeAccess(account.status, account.allowNormalView),
  };
});
