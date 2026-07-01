// Scoped-COORDINATOR surface server context (Session 13, DL-096) — SERVER-ONLY.
//
// KNOWN_ISSUES #43: a coordinator whose event.manage / membership.manage is SCOPED to a
// club lineage can already drive the scoped mutations through /api/admin/action (the
// route only requireUser()s; each service re-authorizes at scope), but the admin NAV
// resolves permissions GLOBALLY, so loadAdminContext returns 'no-access' for a purely
// scoped grant and they never SEE a surface. This is that missing surface: a standalone
// /coordinator back-office (NOT nested under the global /admin gate) whose own context
// is scope-aware via lib/rbac/grants.mjs#listManageableLineages.
//
// Like loadAdminContext / loadMemberContext it NEVER throws — it returns a discriminated
// state the layout branches on. Management is a BACK-OFFICE capability, so this surface
// is ACTIVE-ONLY (the RBAC resolver already returns no permissions for a non-active user,
// so an inactive/revoked coordinator resolves to zero manageable lineages anyway; the
// explicit active gate makes the intent — and the friendly message — clear). It is
// plugin-INDEPENDENT, exactly like /admin (the member_platform flag gates the public
// member experience, not the back office).
//
// States: 'unauthenticated' | 'inactive' | 'no-access' (active, but no scoped manage
// grant — not a coordinator) | 'ok' (+ user + the manageable clubs).
import { cache } from "react";
import { getServerAuthSession } from "../auth/session.mjs";
import prisma from "../prisma.mjs";
import { listManageableLineages } from "../rbac/grants.mjs";

// The scoped permissions that light up the coordinator surface (a coordinator runs
// their club's events + members; a secretary the same at council scope). Central-only
// actions (organizer tagging, closure REVIEW, custom entities) are NOT here — they
// self-gate on GLOBAL event.manage inside the service (DL-086/088).
export const COORDINATOR_PERMS = ["event.manage", "membership.manage"];

export const loadCoordinatorContext = cache(async () => {
  const session = await getServerAuthSession();
  if (!session?.user?.id) return { state: "unauthenticated" };

  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true, status: true },
  });
  // Back-office ⇒ active-only (mirrors loadAdminContext). A non-active coordinator sees
  // a friendly notice, not a broken surface (and would resolve to zero lineages anyway).
  if (!account || account.status !== "active") {
    return { state: "inactive", user: { email: account?.email ?? session.user.email ?? null } };
  }

  let clubs = [];
  try {
    clubs = await listManageableLineages(account.id, COORDINATOR_PERMS);
  } catch {
    clubs = []; // fail-closed: a discovery error yields no surface (never a 500)
  }
  if (!clubs.length) {
    return { state: "no-access", user: { id: account.id, email: account.email, name: account.name } };
  }

  return {
    state: "ok",
    user: { id: account.id, email: account.email, name: account.name },
    clubs, // [{ orgUnitLineageKey, name, slug, typeKey, typeName, publishedThisYear, permissions:{events,members}, permissionKeys }]
  };
});

// A per-page helper mirroring loadModuleContext: the context PLUS a check that the actor
// holds a given scoped capability on at least one club (downgrades to 'no-access'
// otherwise). `need` is 'events' | 'members'.
export async function loadCoordinatorCapability(need) {
  const ctx = await loadCoordinatorContext();
  if (ctx.state !== "ok") return ctx;
  if (need && !ctx.clubs.some((c) => c.permissions?.[need])) return { ...ctx, state: "no-access" };
  return ctx;
}
