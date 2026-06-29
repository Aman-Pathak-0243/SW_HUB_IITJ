// PUBLIC read layer for the "news" content types — EVENTS and ANNOUNCEMENTS
// (Session 6). Both are year-scoped CMS content (content_type 'event' /
// 'announcement') with a publish window, so their public visibility is exactly
// the Session-3 rule (published AND current-year AND not-archived AND
// within publish_from/publish_until). This module does NOT re-implement that rule
// — it calls lib/cms/visibility.mjs (current year) and lib/year/public.mjs
// (archive years), then shapes the {item, payload} records into the flat objects
// the data-driven pages render (resolving the revision title + cover-image URL).
//
// AUDIENCE GATING: `audience_type` is the intended-recipient scope
// (public|students|faculty|staff|internal). Anonymous public reads here default
// to PUBLIC_AUDIENCES (['public']) so content an editor marked non-public is never
// surfaced to anonymous visitors. Callers (e.g. a future role-aware / admin view)
// may widen the allowed set via the `audiences` option. (DL-038.)
//
// Reads only — no mutation, no auth (anonymous). Mutations go through the CMS
// service (lib/cms/content.mjs); see lib/events/import.mjs for the V1 migration.
import prisma from "../prisma.mjs";
import { listPublicContent, getPublicItemBySlug } from "../cms/visibility.mjs";
import { listPublicContentForYear } from "../year/public.mjs";
import { cloudinaryAutoUrl } from "../media/cloudinary.mjs";

// The audience_type enum values (kept in sync with the Postgres enum). Exported
// so the write path (app/api/events) can validate caller input → friendly 422.
export const AUDIENCE_TYPES = ["public", "students", "faculty", "staff", "internal"];
// What an ANONYMOUS public reader is allowed to see.
export const PUBLIC_AUDIENCES = ["public"];

// ── hydration + shaping ──────────────────────────────────────────────────────

// Attach each record's published-revision title/summary and its cover-image URL
// in just two batched queries (no N+1 — Neon per-round-trip latency makes
// per-item awaits pathological). `recs` is [{ item, payload }] from the public
// read helpers; the title lives on content_revision (not the payload), the cover
// on media_asset.
async function hydrate(client, recs) {
  const revIds = [...new Set(recs.map((r) => r.item.publishedRevisionId).filter(Boolean))];
  const coverIds = [...new Set(recs.map((r) => r.payload?.coverMediaId).filter(Boolean))];
  const [revs, covers] = await Promise.all([
    revIds.length
      ? client.contentRevision.findMany({ where: { id: { in: revIds } }, select: { id: true, title: true, summary: true } })
      : [],
    coverIds.length
      ? client.mediaAsset.findMany({ where: { id: { in: coverIds } }, select: { id: true, url: true } })
      : [],
  ]);
  const revMap = new Map(revs.map((r) => [r.id, r]));
  // Covers are images → serve them through Cloudinary f_auto,q_auto (CWV); a
  // non-Cloudinary url (a /public path) passes through unchanged.
  const coverMap = new Map(covers.map((m) => [m.id, cloudinaryAutoUrl(m.url)]));
  return recs.map(({ item, payload }) => ({
    item,
    payload: payload ?? {},
    rev: revMap.get(item.publishedRevisionId) ?? null,
    coverUrl: payload?.coverMediaId ? coverMap.get(payload.coverMediaId) ?? null : null,
  }));
}

function shapeEvent(h) {
  const p = h.payload;
  return {
    id: h.item.id,
    slug: h.item.slug,
    pinned: h.item.pinned,
    publishedAt: h.item.publishedAt,
    title: h.rev?.title ?? null,
    summary: h.rev?.summary ?? null,
    body: p.body ?? null,
    eventDate: p.eventDate ?? null,
    location: p.location ?? null,
    audience: p.audience ?? "public",
    coverUrl: h.coverUrl,
  };
}

function shapeAnnouncement(h) {
  const p = h.payload;
  return {
    id: h.item.id,
    slug: h.item.slug,
    pinned: h.item.pinned,
    publishedAt: h.item.publishedAt,
    title: h.rev?.title ?? null,
    summary: h.rev?.summary ?? null,
    body: p.body ?? null,
    audience: p.audience ?? "public",
    coverUrl: h.coverUrl,
  };
}

// ── pure helpers ─────────────────────────────────────────────────────────────

const ms = (d) => (d ? new Date(d).getTime() : -Infinity);

// Keep only items whose audience is in the allowed set. PURE + exported so the
// anonymous-vs-widened audience gating is unit-testable without a DB.
export function filterByAudience(items, audiences = PUBLIC_AUDIENCES) {
  if (!audiences) return items;
  const allowed = new Set(audiences);
  return items.filter((x) => allowed.has(x.audience ?? "public"));
}

// Partition shaped events into { upcoming, past } by their eventDate vs `now`.
// PURE + exported so the past/upcoming split is unit-testable without a DB — and
// so the V1 `/past-events` contract bug (KNOWN_ISSUES #3: it read `data.success`/
// `data.events` off a bare array and was always empty) is replaced by one tested
// rule. An event with NO date (or a date >= now) is "upcoming/ongoing"; a strictly
// past date is "past". Upcoming is soonest-first (undated first as ongoing); past
// is most-recent-first.
export function splitEventsByDate(events, now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const upcoming = [];
  const past = [];
  for (const e of events ?? []) {
    const d = e.eventDate ? new Date(e.eventDate).getTime() : null;
    if (d != null && d < t) past.push(e);
    else upcoming.push(e);
  }
  upcoming.sort((a, b) => ms(a.eventDate) - ms(b.eventDate));
  past.sort((a, b) => ms(b.eventDate) - ms(a.eventDate));
  return { upcoming, past };
}

// ── events ───────────────────────────────────────────────────────────────────

// Publicly-visible events for the current year (windowed, audience-gated),
// pinned-first then most-recently-published. Use splitEventsByDate for the pages.
export async function listPublicEvents({ now = new Date(), currentYearId, audiences = PUBLIC_AUDIENCES, client = prisma } = {}) {
  const recs = await listPublicContent({ contentType: "event", now, currentYearId }, { client });
  return filterByAudience((await hydrate(client, recs)).map(shapeEvent), audiences);
}

// One publicly-visible event by slug (current year by default), or null.
export async function getPublicEventBySlug(slug, { now = new Date(), currentYearId, audiences = PUBLIC_AUDIENCES, client = prisma } = {}) {
  const rec = await getPublicItemBySlug("event", slug, { now, currentYearId, client });
  if (!rec) return null;
  const [shaped] = filterByAudience([shapeEvent((await hydrate(client, [rec]))[0])], audiences);
  return shaped ?? null;
}

// A chosen (past) year's published events — the archive view; the live publish
// window is NOT enforced for a past year (DL-032). Audience-gated.
export async function listEventsForYear(yearId, { now = new Date(), audiences = PUBLIC_AUDIENCES, client = prisma } = {}) {
  const recs = await listPublicContentForYear(yearId, { contentType: "event", now }, { client });
  return filterByAudience((await hydrate(client, recs)).map(shapeEvent), audiences);
}

// ── announcements ──────────────────────────────────────────────────────────────

// Publicly-visible announcements for the current year (windowed, audience-gated),
// PINNED-FIRST then most-recently-published (DL-010; ordering from visibility).
export async function listPublicAnnouncements({ now = new Date(), currentYearId, audiences = PUBLIC_AUDIENCES, client = prisma } = {}) {
  const recs = await listPublicContent({ contentType: "announcement", now, currentYearId }, { client });
  return filterByAudience((await hydrate(client, recs)).map(shapeAnnouncement), audiences);
}

// One publicly-visible announcement by slug (current year by default), or null.
export async function getPublicAnnouncementBySlug(slug, { now = new Date(), currentYearId, audiences = PUBLIC_AUDIENCES, client = prisma } = {}) {
  const rec = await getPublicItemBySlug("announcement", slug, { now, currentYearId, client });
  if (!rec) return null;
  const [shaped] = filterByAudience([shapeAnnouncement((await hydrate(client, [rec]))[0])], audiences);
  return shaped ?? null;
}

// A chosen (past) year's published announcements — the archive view. Audience-gated.
export async function listAnnouncementsForYear(yearId, { now = new Date(), audiences = PUBLIC_AUDIENCES, client = prisma } = {}) {
  const recs = await listPublicContentForYear(yearId, { contentType: "announcement", now }, { client });
  return filterByAudience((await hydrate(client, recs)).map(shapeAnnouncement), audiences);
}
