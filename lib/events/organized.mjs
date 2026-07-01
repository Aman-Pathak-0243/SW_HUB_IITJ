// M5 — the "EVENTS ORGANIZED" page + its audited CHANGE HISTORY (DL-089).
//
// The page has two parts:
//   1. A CURATED MARKDOWN doc (content_type='events_organized', year-scoped, reusing
//      page_block_payload like club_doc) that admin/staff/dev edit through the CMS
//      content.* actions — so EVERY add/update is audited (before/after itemSnapshot)
//      AND fully version-diffable (content_revision history), with no new pipeline.
//   2. A data-driven INDEX of all the year's events with their tagged organizers/team
//      (from event_organizer) — so the page always reflects reality.
//
// The CHANGE HISTORY is surfaced + downloadable from a named M8 dev-dashboard tab:
// getEventsOrganizedChangeHistory / exportEventsOrganizedHistory read audit_log for the
// year's events_organized content_item ids, REUSING the Session-8 audit reader's pure
// shapers + CSV serializer (no new audit writer). Gated on `audit.read` (DL-047 parity).
import prisma from "../prisma.mjs";
import { getCurrentYearId } from "../year/context.mjs";
import { getContentTypeHandler } from "../cms/content-types.mjs";
import { authorizeConsole } from "../devconsole/authorize.mjs";
import { shapeAuditEntry, auditEntriesToCsv, AUDIT_EXPORT_COLUMNS } from "../devconsole/audit.mjs";
import { listEventOrganizers } from "./organizers.mjs";

const CONTENT_TYPE = "events_organized";
const AUDIT_READ = ["audit.read"];

// ── the curated markdown doc(s) (public read; DL-089) ──
export function shapeOrganizedDoc({ item, payload = {}, rev = null }) {
  return {
    id: item.id,
    slug: item.slug ?? null,
    title: rev?.title ?? null,
    summary: rev?.summary ?? null,
    body: payload.body ?? null, // RAW markdown — rendered escape-first at the view
    updatedAt: item.publishedAt instanceof Date ? item.publishedAt.toISOString() : item.publishedAt ?? null,
  };
}

async function hydrateDocs(client, items) {
  const handler = getContentTypeHandler(CONTENT_TYPE);
  const revIds = [...new Set(items.map((i) => i.publishedRevisionId).filter(Boolean))];
  const revs = revIds.length
    ? await client.contentRevision.findMany({ where: { id: { in: revIds } }, select: { id: true, title: true, summary: true } })
    : [];
  const revMap = new Map(revs.map((r) => [r.id, r]));
  const payloads = await Promise.all(items.map((i) => (handler ? handler.readPayload(client, i.publishedRevisionId) : null)));
  return items.map((item, i) => shapeOrganizedDoc({ item, payload: payloads[i] ?? {}, rev: revMap.get(item.publishedRevisionId) ?? null }));
}

// Publicly-visible curated "Events Organized" docs for a year (current by default).
export async function listEventsOrganizedDocs({ yearId, client = prisma } = {}) {
  const year = yearId ?? (await getCurrentYearId(client));
  if (!year) return [];
  const items = await client.contentItem.findMany({
    where: { contentType: CONTENT_TYPE, academicYearId: year, status: "published", archivedAt: null, publishedRevisionId: { not: null } },
    select: { id: true, slug: true, publishedRevisionId: true, publishedAt: true },
    orderBy: { publishedAt: "desc" },
  });
  if (!items.length) return [];
  return hydrateDocs(client, items);
}

// A data-driven index of the year's PUBLISHED events + their tagged organizers/team.
// Batched (items → titles → organizer tags) — no N+1. Public playground display data.
export async function listOrganizedEventsIndex({ yearId, client = prisma } = {}) {
  const year = yearId ?? (await getCurrentYearId(client));
  if (!year) return [];
  const items = await client.contentItem.findMany({
    where: { contentType: "event", academicYearId: year, status: "published", archivedAt: null, publishedRevisionId: { not: null } },
    select: { id: true, slug: true, publishedRevisionId: true, publishedAt: true },
    orderBy: { publishedAt: "desc" },
  });
  if (!items.length) return [];
  const revIds = [...new Set(items.map((i) => i.publishedRevisionId).filter(Boolean))];
  const revs = revIds.length ? await client.contentRevision.findMany({ where: { id: { in: revIds } }, select: { id: true, title: true } }) : [];
  const titleByRev = new Map(revs.map((r) => [r.id, r.title]));
  // Batch organizer tags for all events (one query), grouped by event.
  const tags = await client.eventOrganizer.findMany({
    where: { eventItemId: { in: items.map((i) => i.id) } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { orgUnitLineage: { select: { canonicalName: true } }, entity: { select: { name: true } }, user: { select: { name: true } } },
  });
  const byEvent = new Map();
  for (const t of tags) {
    const name = t.orgUnitLineage?.canonicalName ?? t.entity?.name ?? t.user?.name ?? null;
    if (!name) continue;
    const bucket = byEvent.get(t.eventItemId) ?? { organizers: [], collaborators: [] };
    (t.kind === "collaborator" ? bucket.collaborators : bucket.organizers).push({ name, role: t.role ?? null });
    byEvent.set(t.eventItemId, bucket);
  }
  return items.map((i) => ({
    id: i.id,
    slug: i.slug ?? null,
    title: titleByRev.get(i.publishedRevisionId) ?? null,
    publishedAt: i.publishedAt instanceof Date ? i.publishedAt.toISOString() : i.publishedAt ?? null,
    organizers: byEvent.get(i.id)?.organizers ?? [],
    collaborators: byEvent.get(i.id)?.collaborators ?? [],
  }));
}

// One event's organizer tags (thin wrapper) — used by the event detail view.
export { listEventOrganizers };

// ── audited change history (M8 dev-dashboard tab; gated audit.read) ──

// The content_item ids of the year's Events-Organized docs (ANY status — the history
// covers every edit incl. drafts/archives).
async function organizedItemIds(client, yearId) {
  const items = await client.contentItem.findMany({
    where: { contentType: CONTENT_TYPE, ...(yearId ? { academicYearId: yearId } : {}) },
    select: { id: true },
  });
  return items.map((i) => i.id);
}

// The audit history of every add/update of the curated Events-Organized doc(s) for a
// year — who/what/when, newest-first. Gated on audit.read (DL-047). Capped.
export async function getEventsOrganizedChangeHistory({ yearId } = {}, actor = {}, { take = 200, client = prisma } = {}) {
  await authorizeConsole(actor, AUDIT_READ);
  const year = yearId ?? (await getCurrentYearId(client));
  const ids = await organizedItemIds(client, year);
  if (!ids.length) return { entries: [], count: 0 };
  const cap = Math.min(Math.max(Number(take) || 200, 1), 1000);
  const rows = await client.auditLog.findMany({
    where: { entityType: "content_item", entityId: { in: ids } },
    orderBy: { id: "desc" },
    take: cap,
    include: { actor: { select: { id: true, email: true, name: true } } },
  });
  return { entries: rows.map((r) => shapeAuditEntry(r)), count: rows.length };
}

// Download the Events-Organized change history as JSON or CSV (DL-089). Gated audit.read.
// Reuses the audit CSV serializer (same data-minimized columns as the audit export).
export async function exportEventsOrganizedHistory({ yearId } = {}, actor = {}, { format = "json", client = prisma } = {}) {
  const { entries } = await getEventsOrganizedChangeHistory({ yearId }, actor, { take: 1000, client });
  const fmt = format === "csv" ? "csv" : "json";
  const stamp = "events-organized-history";
  if (fmt === "csv") {
    return { format: "csv", filename: `${stamp}.csv`, contentType: "text/csv", content: auditEntriesToCsv(entries, AUDIT_EXPORT_COLUMNS), count: entries.length };
  }
  return { format: "json", filename: `${stamp}.json`, contentType: "application/json", content: JSON.stringify(entries, null, 2), count: entries.length };
}
