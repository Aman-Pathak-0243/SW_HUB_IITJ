// M5 / Session 13 (DL-096) — the SCOPED-COORDINATOR read layer for the /coordinator
// surface. Two reads:
//   • listEventsForManager(lineageKeys) — the events a coordinator can manage: those an
//     organizing club lineage of theirs is tagged on (kind='organizer'). This is the
//     exact set assertEventManage's SCOPED branch authorizes, so the surface never shows
//     an event the coordinator can't actually manage.
//   • getManagedEvent(eventItemId, actor) — the full operational view of ONE event,
//     GATED by assertEventManage (throws 403 if it isn't the actor's to manage). It
//     REUSES the existing gated service reads (rounds/settings/registrations/scores/
//     attendance/closure) so there is no parallel read pipeline — the coordinator page
//     just composes them server-side (the admin EventsClient submits blind; this shows
//     the live data too).
import prisma from "../prisma.mjs";
import { getCurrentYearId } from "../year/context.mjs";
import { assertEventManage } from "./authz.mjs";
import { listRounds } from "./rounds.mjs";
import { getEventSettings } from "./settings.mjs";
import { listRegistrations } from "./registration.mjs";
import { listScores, listAttendance } from "./scoring.mjs";
import { listClosureReports } from "./closure.mjs";

const EVENT_TYPE = "event";

function revTitle(item, titleByRev) {
  const rid = item.publishedRevisionId ?? item.draftRevisionId ?? null;
  return rid ? titleByRev.get(rid) ?? null : null;
}

// The events a coordinator (scoped to `lineageKeys`) may manage — organized (kind=
// 'organizer') by one of those lineages in `year` (current by default). Draft +
// published (NOT archived), matching the admin events module's scope. Batched: one
// organizer query → item ids → one content_item query → one revision-title query →
// one registration-count groupBy. Returns [{ id, slug, title, status, publishedAt,
// updatedAt, organizingLineageKeys, confirmed, waitlisted }] newest-first.
export async function listEventsForManager(lineageKeys, { yearId, client = prisma } = {}) {
  const keys = [...new Set((lineageKeys ?? []).filter(Boolean))];
  if (!keys.length) return [];
  const year = yearId ?? (await getCurrentYearId(client));
  if (!year) return [];

  const tags = await client.eventOrganizer.findMany({
    where: { kind: "organizer", orgUnitLineageKey: { in: keys } },
    select: { eventItemId: true, orgUnitLineageKey: true },
  });
  if (!tags.length) return [];
  const itemIds = [...new Set(tags.map((t) => t.eventItemId))];

  const items = await client.contentItem.findMany({
    where: { id: { in: itemIds }, contentType: EVENT_TYPE, academicYearId: year, archivedAt: null },
    select: { id: true, slug: true, status: true, publishedRevisionId: true, draftRevisionId: true, publishedAt: true, updatedAt: true },
  });
  if (!items.length) return [];

  const revIds = [...new Set(items.flatMap((i) => [i.publishedRevisionId, i.draftRevisionId]).filter(Boolean))];
  const [revs, regGroups] = await Promise.all([
    revIds.length ? client.contentRevision.findMany({ where: { id: { in: revIds } }, select: { id: true, title: true } }) : Promise.resolve([]),
    client.eventRegistration.groupBy({ by: ["eventItemId", "status"], where: { eventItemId: { in: items.map((i) => i.id) }, status: { not: "cancelled" } }, _count: { _all: true } }),
  ]);
  const titleByRev = new Map(revs.map((r) => [r.id, r.title]));

  // organizing lineages (of THIS coordinator's set) tagged on each event
  const lineagesByEvent = new Map();
  for (const t of tags) {
    const arr = lineagesByEvent.get(t.eventItemId) ?? [];
    if (!arr.includes(t.orgUnitLineageKey)) arr.push(t.orgUnitLineageKey);
    lineagesByEvent.set(t.eventItemId, arr);
  }
  const countByEvent = new Map();
  for (const g of regGroups) {
    const c = countByEvent.get(g.eventItemId) ?? { confirmed: 0, waitlisted: 0 };
    if (g.status === "confirmed") c.confirmed = g._count._all;
    else if (g.status === "waitlisted") c.waitlisted = g._count._all;
    countByEvent.set(g.eventItemId, c);
  }

  return items
    .map((i) => {
      const counts = countByEvent.get(i.id) ?? { confirmed: 0, waitlisted: 0 };
      return {
        id: i.id,
        slug: i.slug ?? null,
        title: revTitle(i, titleByRev),
        status: i.status,
        publishedAt: i.publishedAt instanceof Date ? i.publishedAt.toISOString() : i.publishedAt ?? null,
        updatedAt: i.updatedAt instanceof Date ? i.updatedAt.toISOString() : i.updatedAt ?? null,
        organizingLineageKeys: lineagesByEvent.get(i.id) ?? [],
        confirmed: counts.confirmed,
        waitlisted: counts.waitlisted,
      };
    })
    .sort((a, b) => {
      const at = a.publishedAt ?? a.updatedAt ?? "";
      const bt = b.publishedAt ?? b.updatedAt ?? "";
      return bt.localeCompare(at);
    });
}

// The full operational view of ONE event for the coordinator manage page. GATED:
// assertEventManage throws 403 (or 401) when the actor may not manage it — so this is
// the per-event authority (a coordinator cannot open another club's event by id). All
// sub-reads reuse the existing gated services; getEffectivePermissions is memoized per
// request so the repeated authorize checks collapse to one RBAC load. Returns
//   { event: { id, slug, title, status }, settings, rounds, registrations,
//     scores, attendance, closureReports }.
export async function getManagedEvent(eventItemId, actor = {}, { client = prisma } = {}) {
  const item = await assertEventManage(actor, eventItemId, { client }); // authorize FIRST (403 if not theirs)

  // assertEventManage's select omits the (plain, non-FK) revision-id cache columns, so
  // fetch them for the display title (published, else the current draft).
  const header = await client.contentItem.findUnique({ where: { id: item.id }, select: { publishedRevisionId: true, draftRevisionId: true } });
  const rid = header?.publishedRevisionId ?? header?.draftRevisionId ?? null;
  const [rev, settings, rounds, regPage, scores, attendance, closureReports] = await Promise.all([
    rid ? client.contentRevision.findUnique({ where: { id: rid }, select: { title: true } }) : Promise.resolve(null),
    getEventSettings(item.id, { client }),
    listRounds(item.id, { client }),
    listRegistrations({ eventItemId: item.id, take: 1000 }, actor),
    listScores(item.id, { actor, client }),
    listAttendance(item.id, { actor, client }),
    listClosureReports(item.id, actor, { client }),
  ]);

  return {
    event: { id: item.id, slug: item.slug ?? null, title: rev?.title ?? null, status: item.status },
    settings,
    rounds,
    registrations: regPage.entries,
    registrationCursor: regPage.nextCursor,
    hasMoreRegistrations: regPage.hasMore,
    scores,
    attendance,
    closureReports,
  };
}
