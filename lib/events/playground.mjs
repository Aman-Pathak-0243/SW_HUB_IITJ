// M5 — the LOGIN-ONLY Centralized Event Playground READ layer (DL-084..087). Shapes the
// event content_item + its relational subsystem (organizers / rounds / settings /
// registration state / scores → rankings) into the flat objects the playground list +
// detail pages render. All reads are BATCHED (Neon per-round-trip latency): the detail
// resolves rankings from ONE event_score fetch (round + overall) via the PURE rankEntries.
//
// Access: the playground is login-only (the PAGE gates via requireMember, DL-065); these
// reads are PII-minimized (participants by display NAME only — the roster with emails is
// a SEPARATE gated read, lib/events/registration.mjs#listRegistrations). Reads only.
import prisma from "../prisma.mjs";
import { getCurrentYearId } from "../year/context.mjs";
import { cloudinaryAutoUrl } from "../media/cloudinary.mjs";
import { resolveBlock } from "../achievements/public.mjs";
import { blockMediaIds } from "../achievements/forms.mjs";
import { isRegistrationOpen, registrationOutcome, rankEntries } from "./forms.mjs";
import { shapeSettings } from "./settings.mjs";
import { getMyRegistration } from "./registration.mjs";

const CONTENT_TYPE = "event";
const ms = (d) => (d ? new Date(d).getTime() : -Infinity);

async function resolveMediaMap(client, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const rows = await client.mediaAsset.findMany({ where: { id: { in: unique } }, select: { id: true, url: true, kind: true } });
  return Object.fromEntries(rows.map((m) => [m.id, m.kind === "image" ? cloudinaryAutoUrl(m.url) : m.url]));
}

// ── list (cards) ──
// Every PUBLISHED event for a year (current by default) with its organizer names +
// registration state. Login-only surface, so NOT audience-gated (all published events
// show). Ordered soonest upcoming/undated first, then most-recent past.
export async function listPlaygroundEvents({ yearId, now = new Date(), client = prisma } = {}) {
  const year = yearId ?? (await getCurrentYearId(client));
  if (!year) return [];
  const items = await client.contentItem.findMany({
    where: { contentType: CONTENT_TYPE, academicYearId: year, status: "published", archivedAt: null, publishedRevisionId: { not: null } },
    select: { id: true, slug: true, pinned: true, publishedAt: true, publishedRevisionId: true },
  });
  if (!items.length) return [];
  const ids = items.map((i) => i.id);
  const revIds = [...new Set(items.map((i) => i.publishedRevisionId).filter(Boolean))];

  const [revs, payloads, tags, settingsRows, regGroups] = await Promise.all([
    client.contentRevision.findMany({ where: { id: { in: revIds } }, select: { id: true, title: true, summary: true } }),
    client.eventPayload.findMany({ where: { revisionId: { in: revIds } }, select: { revisionId: true, category: true, eventDate: true, coverMediaId: true } }),
    client.eventOrganizer.findMany({
      where: { eventItemId: { in: ids } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { orgUnitLineage: { select: { canonicalName: true } }, entity: { select: { name: true } }, user: { select: { name: true } } },
    }),
    client.eventSettings.findMany({ where: { eventItemId: { in: ids } } }),
    client.eventRegistration.groupBy({ by: ["eventItemId", "status"], where: { eventItemId: { in: ids }, status: { not: "cancelled" } }, _count: { _all: true } }),
  ]);
  const revMap = new Map(revs.map((r) => [r.id, r]));
  const payloadMap = new Map(payloads.map((p) => [p.revisionId, p]));
  const coverMap = await resolveMediaMap(client, payloads.map((p) => p.coverMediaId));
  const settingsMap = new Map(settingsRows.map((s) => [s.eventItemId, s]));

  const orgByEvent = new Map();
  for (const t of tags) {
    if (t.kind !== "organizer") continue;
    const name = t.orgUnitLineage?.canonicalName ?? t.entity?.name ?? t.user?.name ?? null;
    if (!name) continue;
    const arr = orgByEvent.get(t.eventItemId) ?? [];
    arr.push(name);
    orgByEvent.set(t.eventItemId, arr);
  }
  const countByEvent = new Map();
  for (const g of regGroups) {
    const c = countByEvent.get(g.eventItemId) ?? { confirmed: 0, waitlisted: 0 };
    if (g.status === "confirmed") c.confirmed = g._count._all;
    else if (g.status === "waitlisted") c.waitlisted = g._count._all;
    countByEvent.set(g.eventItemId, c);
  }

  const cards = items.map((item) => {
    const p = payloadMap.get(item.publishedRevisionId) ?? null;
    const rev = revMap.get(item.publishedRevisionId) ?? null;
    const settings = shapeSettings(settingsMap.get(item.id) ?? null, item.id);
    const counts = countByEvent.get(item.id) ?? { confirmed: 0, waitlisted: 0 };
    return {
      id: item.id,
      slug: item.slug ?? null,
      pinned: !!item.pinned,
      title: rev?.title ?? null,
      summary: rev?.summary ?? null,
      category: p?.category ?? null,
      eventDate: p?.eventDate instanceof Date ? p.eventDate.toISOString() : p?.eventDate ?? null,
      coverUrl: p?.coverMediaId ? coverMap[p.coverMediaId] ?? null : null,
      organizers: orgByEvent.get(item.id) ?? [],
      registration: {
        confirmed: counts.confirmed,
        waitlisted: counts.waitlisted,
        capacity: settings.capacity,
        open: isRegistrationOpen(settings, now),
      },
    };
  });
  // soonest upcoming/undated first (as "upcoming"), then most-recent past.
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const isPast = (c) => c.eventDate && new Date(c.eventDate).getTime() < t;
  cards.sort((a, b) => {
    const ap = isPast(a), bp = isPast(b);
    if (ap !== bp) return ap ? 1 : -1;
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return ap ? ms(b.eventDate) - ms(a.eventDate) : ms(a.eventDate) - ms(b.eventDate);
  });
  return cards;
}

// ── detail ──
// One published event by slug (or id) with its full playground view. `userId` (the
// signed-in member) resolves their own registration status. Rankings computed from ONE
// event_score fetch (per-round + overall). Returns null when not found/unpublished.
export async function getPlaygroundEvent({ slug, id, userId, yearId, now = new Date(), client = prisma } = {}) {
  const year = yearId ?? (await getCurrentYearId(client));
  if (!year || (!slug && !id)) return null;
  const item = await client.contentItem.findFirst({
    where: { contentType: CONTENT_TYPE, academicYearId: year, status: "published", archivedAt: null, publishedRevisionId: { not: null }, ...(id ? { id } : { slug }) },
    select: { id: true, slug: true, pinned: true, publishedAt: true, publishedRevisionId: true, academicYearId: true },
  });
  if (!item) return null;

  const [rev, payload, rounds, tags, settingsRow, regGroups, scoreRows, myReg] = await Promise.all([
    client.contentRevision.findUnique({ where: { id: item.publishedRevisionId }, select: { title: true, summary: true } }),
    client.eventPayload.findUnique({ where: { revisionId: item.publishedRevisionId } }),
    client.eventRound.findMany({ where: { eventItemId: item.id }, orderBy: [{ sortOrder: "asc" }, { roundNo: "asc" }] }),
    client.eventOrganizer.findMany({
      where: { eventItemId: item.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { orgUnitLineage: { select: { lineageKey: true, canonicalName: true } }, entity: { select: { name: true, kind: true } }, user: { select: { name: true } } },
    }),
    client.eventSettings.findUnique({ where: { eventItemId: item.id } }),
    client.eventRegistration.groupBy({ by: ["status"], where: { eventItemId: item.id, status: { not: "cancelled" } }, _count: { _all: true } }),
    client.eventScore.findMany({ where: { eventItemId: item.id }, include: { user: { select: { id: true, name: true } } } }),
    userId ? getMyRegistration(item.id, userId, { client }) : Promise.resolve(null),
  ]);

  const mediaIds = [];
  if (payload?.coverMediaId) mediaIds.push(payload.coverMediaId);
  mediaIds.push(...blockMediaIds(payload?.blocks));
  const mediaMap = await resolveMediaMap(client, mediaIds);

  const counts = { confirmed: 0, waitlisted: 0 };
  for (const g of regGroups) {
    if (g.status === "confirmed") counts.confirmed = g._count._all;
    else if (g.status === "waitlisted") counts.waitlisted = g._count._all;
  }
  const settings = shapeSettings(settingsRow ?? null, item.id);

  // Rankings from the single score fetch (names only — PII-minimized).
  const nameById = new Map(scoreRows.map((s) => [s.userId, s.user?.name ?? null]));
  const overallSum = new Map();
  const byRound = new Map();
  for (const s of scoreRows) {
    overallSum.set(s.userId, (overallSum.get(s.userId) ?? 0) + (s.points ?? 0));
    if (s.roundId) {
      const arr = byRound.get(s.roundId) ?? [];
      arr.push({ userId: s.userId, name: s.user?.name ?? null, points: s.points ?? 0 });
      byRound.set(s.roundId, arr);
    }
  }
  // Rankings are PUBLIC display data → NAME + points + rank only (the app_user uuid is
  // used for rankEntries' stable tiebreak internally, then dropped; DL-082 PII parity).
  const stripId = (list) => list.map((e) => ({ name: e.name, points: e.points, rank: e.rank }));
  const overallRanking = stripId(rankEntries([...overallSum.entries()].map(([uid, points]) => ({ userId: uid, name: nameById.get(uid) ?? null, points }))));
  const roundRankings = rounds
    .filter((r) => byRound.has(r.id))
    .map((r) => ({ roundId: r.id, roundNo: r.roundNo, name: r.name, entries: stripId(rankEntries(byRound.get(r.id))) }));

  return {
    id: item.id,
    slug: item.slug ?? null,
    title: rev?.title ?? null,
    summary: rev?.summary ?? null,
    pinned: !!item.pinned,
    publishedAt: item.publishedAt instanceof Date ? item.publishedAt.toISOString() : item.publishedAt ?? null,
    category: payload?.category ?? null,
    eventDate: payload?.eventDate instanceof Date ? payload.eventDate.toISOString() : payload?.eventDate ?? null,
    location: payload?.location ?? null,
    body: payload?.body ?? null,
    problemStatement: payload?.problemStatement ?? null,
    eligibility: payload?.eligibility ?? null,
    coverUrl: payload?.coverMediaId ? mediaMap[payload.coverMediaId] ?? null : null,
    blocks: (Array.isArray(payload?.blocks) ? payload.blocks : []).map((b) => resolveBlock(b, mediaMap)).filter(Boolean),
    organizers: tags.map((t) => ({
      kind: t.kind,
      targetKind: t.orgUnitLineageKey ? "club" : t.entityId ? "entity" : "user",
      name: t.orgUnitLineage?.canonicalName ?? t.entity?.name ?? t.user?.name ?? null,
      orgUnitLineageKey: t.orgUnitLineageKey ?? null,
      role: t.role ?? null,
    })),
    rounds: rounds.map((r) => ({
      id: r.id,
      roundNo: r.roundNo,
      name: r.name,
      description: r.description ?? null,
      startsAt: r.startsAt instanceof Date ? r.startsAt.toISOString() : r.startsAt ?? null,
      endsAt: r.endsAt instanceof Date ? r.endsAt.toISOString() : r.endsAt ?? null,
    })),
    settings: { capacity: settings.capacity, registrationOpensAt: settings.registrationOpensAt, registrationClosesAt: settings.registrationClosesAt },
    registration: {
      confirmed: counts.confirmed,
      waitlisted: counts.waitlisted,
      capacity: settings.capacity,
      open: isRegistrationOpen(settings, now),
      // If the member registers now, would they be confirmed or waitlisted?
      nextOutcome: registrationOutcome(counts.confirmed, settings.capacity),
      mine: myReg ?? null,
    },
    rankings: { overall: overallRanking, rounds: roundRankings },
  };
}
