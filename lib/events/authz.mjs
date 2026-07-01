// M5 event-playground AUTHORIZATION seam (DL-086). One place decides "may this actor
// manage this event's operational subsystem?" — reused by every playground mutation
// service (organizers / rounds / settings / registration management / scores /
// attendance / closure). Authorize-FIRST: services call assertEventManage before any
// state disclosure, exactly like the CMS service authorizes before reading item state.
//
// The rule (DL-086):
//   • GLOBAL event.manage (an UNSCOPED grant — staff / admin / dev via grants_all)
//     may manage ANY event. The RBAC resolver's inScope() excludes a club-SCOPED
//     grant from a global ({}) check, so a coordinator does NOT pass here (parity
//     with DL-082's central-vs-scoped split).
//   • Otherwise, event.manage SCOPED to ANY of the event's ORGANIZING club lineages
//     (kind='organizer' tags) passes — so a coordinator runs their own club's event.
//   • `requireGlobal:true` forces the central-only check for actions that define WHO
//     organizes / review closure / manage custom entities (a coordinator must not be
//     able to add their own club as an organizer to grant themselves access).
import prisma from "../prisma.mjs";
import { getEffectivePermissions, can } from "../rbac/authorize.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";

export const EVENT_TYPE = "event";
export const EVENT_MANAGE_PERM = "event.manage";

const EVENT_SELECT = { id: true, contentType: true, academicYearId: true, orgUnitId: true, slug: true, status: true };

// Load an event content_item → for authorization + scope. Rejects a non-event item so
// a playground service can never mutate another content type's subsystem.
export async function loadEventOrThrow(eventItemId, client = prisma) {
  if (!eventItemId) throw new CmsValidationError("An event item id is required.");
  const item = await client.contentItem.findUnique({ where: { id: eventItemId }, select: EVENT_SELECT });
  if (!item) throw new CmsNotFoundError(`Event ${eventItemId} not found.`);
  if (item.contentType !== EVENT_TYPE) throw new CmsValidationError(`Content item ${eventItemId} is not an event.`);
  return item;
}

// The org-unit lineages that ORGANIZE this event (kind='organizer' club tags) — the
// scopes at which a coordinator/secretary gains event.manage on it (DL-086).
export async function organizingLineageKeys(eventItemId, client = prisma) {
  const rows = await client.eventOrganizer.findMany({
    where: { eventItemId, kind: "organizer", orgUnitLineageKey: { not: null } },
    select: { orgUnitLineageKey: true },
  });
  return [...new Set(rows.map((r) => r.orgUnitLineageKey))];
}

function unauthenticated() {
  const e = new Error("An actor user id is required for this operation.");
  e.status = 401;
  e.code = "UNAUTHENTICATED";
  return e;
}
function forbidden() {
  const e = new Error("You are not permitted to manage this event.");
  e.status = 403;
  e.code = "FORBIDDEN";
  return e;
}

// Authorize event.manage for an actor on an event; returns the loaded event item.
// A `system` actor (seed/migration) bypasses. Global first, then per-organizing-lineage.
export async function assertEventManage(actor, eventItemOrId, { requireGlobal = false, client = prisma } = {}) {
  const item = typeof eventItemOrId === "string" ? await loadEventOrThrow(eventItemOrId, client) : eventItemOrId;
  if (actor?.system) return item;
  if (!actor?.userId) throw unauthenticated();

  // GLOBAL check (unscoped event.manage — staff/admin/dev). inScope() excludes a
  // club-scoped grant from this {} scope, so a coordinator does not pass here.
  const global = await getEffectivePermissions(actor.userId, {});
  if (can(global, EVENT_MANAGE_PERM)) return item;
  if (requireGlobal) throw forbidden();

  // SCOPED: event.manage at any organizing club lineage (+ the event's year).
  const lineages = await organizingLineageKeys(item.id, client);
  for (const lineageKey of lineages) {
    const scoped = await getEffectivePermissions(actor.userId, { orgUnitLineageKey: lineageKey, academicYearId: item.academicYearId });
    if (can(scoped, EVENT_MANAGE_PERM)) return item;
  }
  throw forbidden();
}

// Non-throwing variant for read layers that want to reveal PII (a registration roster)
// only to a manager — returns true/false instead of throwing.
export async function canManageEvent(actor, eventItemOrId, opts = {}) {
  try {
    await assertEventManage(actor, eventItemOrId, opts);
    return true;
  } catch (e) {
    if (e?.status === 403 || e?.status === 401) return false;
    throw e; // a real error (not-found / not-an-event) still propagates
  }
}
