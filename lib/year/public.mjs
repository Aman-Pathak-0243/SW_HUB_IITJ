// PUBLIC year selector (capability 1 + 6) — lets anonymous public pages show a
// CHOSEN year's published content (an "archive" view), not only the current year.
//
// The base public visibility rule (lib/cms/visibility.mjs) always filters by the
// CURRENT year, so next-year content stays hidden. This module generalizes it to
// an explicitly-selected year while keeping the rest of the rule intact:
// published AND not-archived AND has-a-published-revision. The fetch-then-window
// loop itself is shared with visibility.mjs (loadPublicItems / loadPublicItem).
//
// PUBLISH WINDOWS: for events/announcements the live window
// (publish_from..publish_until) is a "what is live right now" concept. It is
// applied only when viewing the CURRENT year (identical to visibility.mjs); for a
// PAST year's archive the window is ignored so the year's published events remain
// browsable forever (DL-032). Callers can override via `applyWindow`.
import prisma from "../prisma.mjs";
import { publicItemWhere, loadPublicItems, loadPublicItem } from "../cms/visibility.mjs";
import { getCurrentYearId } from "./context.mjs";

// Years a public visitor may select: live (active) or archived (locked) years,
// newest first. 'planning' years are never exposed publicly. Each entry carries
// the minimal fields a year-picker needs.
export async function listSelectableYears({ client = prisma } = {}) {
  return client.academicYear.findMany({
    where: { status: { in: ["active", "locked"] } },
    orderBy: [{ startDate: "desc" }],
    select: { id: true, label: true, status: true, isCurrent: true, startDate: true, endDate: true },
  });
}

// Decide whether to enforce the live publish window for a selected year: yes for
// the current year (live behavior), no for a past-year archive — unless the
// caller forces it explicitly.
async function shouldApplyWindow(yearId, applyWindow, client) {
  if (applyWindow !== undefined) return applyWindow;
  const currentId = await getCurrentYearId(client);
  return yearId === currentId;
}

// List a SELECTED year's publicly-visible content, each with its published
// payload. Mirrors visibility.listPublicContent but for an arbitrary year and
// with archive-aware window handling.
export async function listPublicContentForYear(
  yearId,
  { contentType, orgUnitId, now = new Date(), applyWindow } = {},
  { client = prisma } = {}
) {
  if (!yearId) return [];
  const enforceWindow = await shouldApplyWindow(yearId, applyWindow, client);
  return loadPublicItems(client, publicItemWhere(yearId, { contentType, orgUnitId }), { enforceWindow, now });
}

// Fetch one publicly-visible item by (contentType, slug) within a SELECTED year,
// or null if it is not public in that year.
export async function getPublicItemBySlugForYear(
  contentType,
  slug,
  yearId,
  { now = new Date(), applyWindow } = {},
  { client = prisma } = {}
) {
  if (!yearId) return null;
  const enforceWindow = await shouldApplyWindow(yearId, applyWindow, client);
  return loadPublicItem(client, { ...publicItemWhere(yearId, { contentType }), slug }, { enforceWindow, now });
}

// Convenience: the public archive for a chosen year — the year row plus its
// published content. Returns null when the year is not publicly selectable.
export async function getPublicYearArchive(
  yearId,
  { contentType, now = new Date() } = {},
  { client = prisma } = {}
) {
  const year = await client.academicYear.findFirst({
    where: { id: yearId, status: { in: ["active", "locked"] } },
    select: { id: true, label: true, status: true, isCurrent: true },
  });
  if (!year) return null;
  const content = await listPublicContentForYear(yearId, { contentType, now }, { client });
  return { year, content };
}
