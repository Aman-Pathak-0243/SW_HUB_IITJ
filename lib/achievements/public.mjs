// PUBLIC read layer for the M4 Wall of Fame (achievements). An achievement is a
// year-scoped, NOT-org-bound CMS content item (content_type='achievement'), so its
// public visibility is the Session-3 rule (published AND current-year AND not-archived
// AND has a published revision). This module does NOT re-implement that rule — it
// queries the spine the same way lib/org/docs.mjs / lib/resources/public.mjs do, then
// shapes {item, payload, rev, credits, media} into the flat objects the /wall-of-fame
// page and the per-club Achievements tab render. Markdown blocks carry RAW markdown,
// rendered SAFELY at the presentation layer via lib/markdown/render.mjs (DL-077).
//
// PERFORMANCE (Neon per-round-trip latency): every list read is BATCHED — one query
// for the items, one for the payloads, one for the credits (+ user join), one to
// resolve the credited clubs' current-year names, and one to resolve all referenced
// media — never a per-item await loop.
//
// Reads only — no mutation, no auth (anonymous). Public output MINIMIZES PII: credited
// members appear by display NAME only (no email). Mutations flow through the CMS
// service (content.*) + lib/achievements/credits.mjs.
import prisma from "../prisma.mjs";
import { getCurrentYearId } from "../year/context.mjs";
import { cloudinaryAutoUrl } from "../media/cloudinary.mjs";
import { blockMediaIds } from "./forms.mjs";

const CONTENT_TYPE = "achievement";

const ms = (d) => (d ? new Date(d).getTime() : -Infinity);

// Order: pinned first, then most-recent achievementDate, then most-recent publish.
// PURE + exported so the ordering is unit-testable without a DB.
export function sortAchievements(list) {
  return [...(list ?? [])].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    const d = ms(b.achievementDate) - ms(a.achievementDate);
    if (d !== 0) return d;
    return ms(b.publishedAt) - ms(a.publishedAt);
  });
}

// Resolve one raw block's media ids → delivery URLs using a { id: url } map, dropping
// media that no longer resolve (archived/deleted) so a stale id never breaks a render.
// PURE + exported (tested). Returns the presentation-ready block (or null to drop it).
export function resolveBlock(block, mediaMap = {}) {
  if (!block || typeof block !== "object") return null;
  switch (block.kind) {
    case "markdown":
      return block.body ? { kind: "markdown", body: block.body } : null;
    case "markdown_image": {
      const imageUrl = block.mediaId ? mediaMap[block.mediaId] ?? null : null;
      // Degrade gracefully to a plain markdown block if the image is gone.
      if (!imageUrl) return block.body ? { kind: "markdown", body: block.body } : null;
      return { kind: "markdown_image", body: block.body ?? null, imagePosition: block.imagePosition === "left" ? "left" : "right", imageUrl };
    }
    case "banner": {
      const imageUrl = block.mediaId ? mediaMap[block.mediaId] ?? null : null;
      return imageUrl ? { kind: "banner", caption: block.caption ?? null, imageUrl } : null;
    }
    case "link":
      return block.url ? { kind: "link", url: block.url, label: block.label ?? null } : null;
    case "gallery": {
      const images = (Array.isArray(block.mediaIds) ? block.mediaIds : []).map((id) => mediaMap[id]).filter(Boolean);
      return images.length ? { kind: "gallery", caption: block.caption ?? null, images } : null;
    }
    default:
      return null;
  }
}

function resolveBlocks(blocks, mediaMap) {
  return (Array.isArray(blocks) ? blocks : []).map((b) => resolveBlock(b, mediaMap)).filter(Boolean);
}

// Resolve a set of image media ids → { id: cloudinaryAutoUrl(url) } in ONE query.
// Achievement media are images (heroes / banners / gallery) → served through
// Cloudinary f_auto,q_auto for CWV (DL-053); a non-Cloudinary url passes through.
async function resolveMediaMap(client, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const rows = await client.mediaAsset.findMany({ where: { id: { in: unique } }, select: { id: true, url: true, kind: true } });
  return Object.fromEntries(rows.map((m) => [m.id, m.kind === "image" ? cloudinaryAutoUrl(m.url) : m.url]));
}

// Hydrate a set of published achievement items → shaped records (title/summary +
// payload + resolved blocks + credits), all in batched queries. `year` scopes the
// credited-club name resolution to the current year's published units.
async function hydrate(client, items, year) {
  if (!items.length) return [];
  const itemIds = items.map((i) => i.id);
  const revIds = [...new Set(items.map((i) => i.publishedRevisionId).filter(Boolean))];

  const [revs, payloads, creditRows] = await Promise.all([
    revIds.length
      ? client.contentRevision.findMany({ where: { id: { in: revIds } }, select: { id: true, title: true, summary: true } })
      : [],
    revIds.length
      ? client.achievementPayload.findMany({ where: { revisionId: { in: revIds } } })
      : [],
    client.achievementCredit.findMany({
      where: { achievementItemId: { in: itemIds } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);
  const revMap = new Map(revs.map((r) => [r.id, r]));
  const payloadMap = new Map(payloads.map((p) => [p.revisionId, p]));

  // Resolve every credited club's current-year display name in ONE query.
  const lineageKeys = [...new Set(creditRows.map((c) => c.orgUnitLineageKey).filter(Boolean))];
  const units = lineageKeys.length && year
    ? await client.orgUnit.findMany({
        where: { lineageKey: { in: lineageKeys }, academicYearId: year, status: "published", archivedAt: null },
        select: { lineageKey: true, name: true, slug: true, orgUnitType: { select: { key: true } } },
      })
    : [];
  const unitByLineage = new Map(units.map((u) => [u.lineageKey, u]));

  // Resolve every referenced image (heroes + block media) in ONE query.
  const mediaIds = [];
  for (const p of payloads) {
    if (p.heroMediaId) mediaIds.push(p.heroMediaId);
    mediaIds.push(...blockMediaIds(p.blocks));
  }
  const mediaMap = await resolveMediaMap(client, mediaIds);

  // Group credits per achievement item.
  const creditsByItem = new Map();
  for (const c of creditRows) {
    if (!creditsByItem.has(c.achievementItemId)) creditsByItem.set(c.achievementItemId, { members: [], clubs: [] });
    const bucket = creditsByItem.get(c.achievementItemId);
    if (c.userId) {
      // PII minimization (DL-082): the PUBLIC wall/tab shows a credited member by
      // display NAME only. The whole club view is serialized to an anonymous browser
      // (getClubPageView → the CLIENT OrgUnitTabs), so we must NOT leak the member's
      // internal app_user (auth-account) uuid here — a member→achievement link for M6
      // is a separate, authenticated read, not this public shape. (Review-confirmed.)
      bucket.members.push({ name: c.user?.name ?? null, role: c.role ?? null });
    } else if (c.orgUnitLineageKey) {
      const u = unitByLineage.get(c.orgUnitLineageKey) ?? null;
      bucket.clubs.push({
        orgUnitLineageKey: c.orgUnitLineageKey,
        name: u?.name ?? null,
        slug: u?.slug ?? null,
        typeKey: u?.orgUnitType?.key ?? null,
        role: c.role ?? null,
      });
    }
  }

  return items.map((item) => {
    const p = item.publishedRevisionId ? payloadMap.get(item.publishedRevisionId) : null;
    const rev = item.publishedRevisionId ? revMap.get(item.publishedRevisionId) : null;
    return {
      id: item.id,
      slug: item.slug ?? null,
      title: rev?.title ?? null,
      summary: rev?.summary ?? null,
      pinned: !!item.pinned,
      publishedAt: item.publishedAt instanceof Date ? item.publishedAt.toISOString() : item.publishedAt ?? null,
      category: p?.category ?? null,
      achievementDate: p?.achievementDate instanceof Date ? p.achievementDate.toISOString() : p?.achievementDate ?? null,
      heroUrl: p?.heroMediaId ? mediaMap[p.heroMediaId] ?? null : null,
      blocks: resolveBlocks(p?.blocks, mediaMap),
      credits: creditsByItem.get(item.id) ?? { members: [], clubs: [] },
    };
  });
}

const itemSelect = { id: true, slug: true, pinned: true, publishedAt: true, publishedRevisionId: true };

// The full Wall of Fame for a year (current by default): every published, non-archived
// achievement, ordered pinned → most-recent. Optional `category` filter.
export async function listWallOfFame({ yearId, category, client = prisma } = {}) {
  const year = yearId ?? (await getCurrentYearId(client));
  if (!year) return [];
  const items = await client.contentItem.findMany({
    where: { contentType: CONTENT_TYPE, academicYearId: year, status: "published", archivedAt: null, publishedRevisionId: { not: null } },
    select: itemSelect,
    orderBy: { publishedAt: "desc" },
  });
  if (!items.length) return [];
  let shaped = await hydrate(client, items, year);
  if (category) shaped = shaped.filter((a) => (a.category ?? "").toLowerCase() === String(category).toLowerCase());
  return sortAchievements(shaped);
}

// One published achievement by slug (current year by default), or null.
export async function getAchievementBySlug(slug, { yearId, client = prisma } = {}) {
  if (!slug) return null;
  const year = yearId ?? (await getCurrentYearId(client));
  if (!year) return null;
  const item = await client.contentItem.findFirst({
    where: { contentType: CONTENT_TYPE, academicYearId: year, slug, status: "published", archivedAt: null, publishedRevisionId: { not: null } },
    select: itemSelect,
  });
  if (!item) return null;
  const [shaped] = await hydrate(client, [item], year);
  return shaped ?? null;
}

// The per-CLUB Wall-of-Fame slice (M4) — the achievements CREDITED to one club's
// lineage, published + current-year, most-recent first. Fills the M3 club page's
// Achievements tab. `orgUnitLineageKey` is the durable logical-unit id.
export async function listClubAchievements(orgUnitLineageKey, { yearId, client = prisma } = {}) {
  if (!orgUnitLineageKey) return [];
  const year = yearId ?? (await getCurrentYearId(client));
  if (!year) return [];
  const credits = await client.achievementCredit.findMany({
    where: { orgUnitLineageKey },
    select: { achievementItemId: true },
  });
  const itemIds = [...new Set(credits.map((c) => c.achievementItemId))];
  if (!itemIds.length) return [];
  // Only the club's credited achievements that are actually publicly visible this year.
  const items = await client.contentItem.findMany({
    where: { id: { in: itemIds }, contentType: CONTENT_TYPE, academicYearId: year, status: "published", archivedAt: null, publishedRevisionId: { not: null } },
    select: itemSelect,
  });
  if (!items.length) return [];
  return sortAchievements(await hydrate(client, items, year));
}
