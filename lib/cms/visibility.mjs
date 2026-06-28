// Public visibility rule — the data-access layer for ANONYMOUS / public reads
// (capability 6). The rule, from SCHEMA_DESIGN: an item is public iff
//   status = 'published'  AND  academic_year_id = the CURRENT year  AND
//   archived_at IS NULL   AND  it has a live published revision
// and, for events & announcements, the current time is within the payload's
// publish_from / publish_until window.
//
// Because the layer always filters by the current academic year, a next-year
// published item is structurally hidden until its year becomes current. Admin /
// editor reads (which see drafts and other years) go through lib/cms/content.mjs,
// NOT through here.
import prisma from "../prisma.mjs";
import { getContentTypeHandler } from "./content-types.mjs";
// Current-year resolution lives in lib/year/context.mjs (the canonical home);
// re-exported here so existing importers of `resolveCurrentYear` are unaffected.
import { resolveCurrentYear } from "../year/context.mjs";

export { resolveCurrentYear };

// Content types whose public visibility additionally honors a publish window.
export const WINDOWED_TYPES = new Set(["event", "announcement"]);

function asDate(v) {
  if (v == null) return null;
  return v instanceof Date ? v : new Date(v);
}

// Is `now` within a payload's [publish_from, publish_until) window? A missing
// payload or missing bound means "open" on that side. Half-open at the end so an
// item disappears exactly at publish_until.
export function isWithinPublishWindow(payload, now = new Date()) {
  if (!payload) return true;
  const from = asDate(payload.publishFrom);
  const until = asDate(payload.publishUntil);
  if (from && now < from) return false;
  if (until && now >= until) return false;
  return true;
}

// PURE visibility predicate (unit-testable without a DB). `payload` is only
// consulted for windowed types; pass it for event/announcement.
export function isPubliclyVisible(item, { currentYearId, now = new Date(), payload = null } = {}) {
  if (!item) return false;
  if (item.status !== "published") return false;
  if (item.archivedAt) return false;
  if (item.academicYearId !== currentYearId) return false;
  if (!item.publishedRevisionId) return false;
  if (WINDOWED_TYPES.has(item.contentType) && !isWithinPublishWindow(payload, now)) return false;
  return true;
}

// Prisma `where` for the spine portion of the public rule (window is applied in
// JS against the payload). Pass the resolved current year id.
export function publicItemWhere(currentYearId, { contentType, orgUnitId } = {}) {
  return {
    status: "published",
    academicYearId: currentYearId,
    archivedAt: null,
    publishedRevisionId: { not: null },
    ...(contentType ? { contentType } : {}),
    ...(orgUnitId ? { orgUnitId } : {}),
  };
}

// Shared read primitives — load items/one item matching a public `where`, attach
// each published payload, and (when enforceWindow) drop windowed items outside
// their publish window. Reused by the current-year reads here AND the chosen-year
// reads in lib/year/public.mjs so the fetch-then-window loop lives in one place.
export async function loadPublicItems(client, where, { enforceWindow = true, now = new Date() } = {}) {
  const items = await client.contentItem.findMany({
    where,
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
  });
  const out = [];
  for (const item of items) {
    const handler = getContentTypeHandler(item.contentType);
    const payload = handler ? await handler.readPayload(client, item.publishedRevisionId) : null;
    if (enforceWindow && WINDOWED_TYPES.has(item.contentType) && !isWithinPublishWindow(payload, now)) continue;
    out.push({ item, payload });
  }
  return out;
}

export async function loadPublicItem(client, where, { enforceWindow = true, now = new Date() } = {}) {
  const item = await client.contentItem.findFirst({ where });
  if (!item) return null;
  const handler = getContentTypeHandler(item.contentType);
  const payload = handler ? await handler.readPayload(client, item.publishedRevisionId) : null;
  if (enforceWindow && WINDOWED_TYPES.has(item.contentType) && !isWithinPublishWindow(payload, now)) return null;
  return { item, payload };
}

// List publicly-visible items of a type for the current year, each with its
// published payload, with the publish window applied for windowed types.
// Returns [{ item, payload }] ordered pinned-first then most-recently-published.
export async function listPublicContent(
  { contentType, orgUnitId, now = new Date(), currentYearId } = {},
  { client = prisma } = {}
) {
  const yearId = currentYearId ?? (await resolveCurrentYear(client))?.id;
  if (!yearId) return [];
  return loadPublicItems(client, publicItemWhere(yearId, { contentType, orgUnitId }), { enforceWindow: true, now });
}

// Fetch one publicly-visible item by (contentType, slug) for the current year,
// or null if it does not exist / is not currently public.
export async function getPublicItemBySlug(contentType, slug, { now = new Date(), client = prisma } = {}) {
  const yearId = (await resolveCurrentYear(client))?.id;
  if (!yearId) return null;
  return loadPublicItem(client, { ...publicItemWhere(yearId, { contentType }), slug }, { enforceWindow: true, now });
}
