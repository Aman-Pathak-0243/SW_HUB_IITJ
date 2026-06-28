// PUBLIC read layer for RESOURCES (Session 7) — per-org-unit PDFs / Drive links.
// A `resource` is year-scoped, org-bound CMS content (content_type='resource'), so
// its public visibility is the Session-3 rule applied to the bound unit's year:
// published AND current-year (overridable) AND not-archived AND has a published
// revision. This module does NOT re-implement that rule — it queries the spine the
// same way lib/org/public.mjs#loadProfile does and shapes the {item, payload}
// records into the flat objects the data-driven view renders (resolving the file
// media URL via the single delivery-URL resolver).
//
// Reads only — no mutation, no auth (anonymous). Mutations go through the CMS
// service (lib/cms/content.mjs); the V1 migration is lib/resources/import.mjs.
import prisma from "../prisma.mjs";
import { getCurrentYearId } from "../year/context.mjs";
import { getContentTypeHandler } from "../cms/content-types.mjs";
import { resolveDeliveryUrl } from "../media/cloudinary.mjs";

const CONTENT_TYPE = "resource";

// Shape a hydrated {item, payload, rev, file} record → the flat resource object
// the renderer consumes. PURE + exported for unit testing.
export function shapeResource({ item, payload = {}, rev = null, file = null }) {
  return {
    id: item.id,
    slug: item.slug,
    title: rev?.title ?? null,
    summary: rev?.summary ?? null,
    resourceKind: payload.resourceKind ?? null,
    externalUrl: payload.externalUrl ?? null,
    description: payload.description ?? null,
    fileUrl: file?.url ?? null,
    fileKind: file?.kind ?? null,
  };
}

// Hydrate a set of published resource content_items: their revision title/summary
// (batched), typed payloads (per item — only 1–2 resources per unit), and file
// media URLs (batched). Returns shaped resources. No N+1 across items.
async function hydrate(client, items) {
  const handler = getContentTypeHandler(CONTENT_TYPE);
  const revIds = [...new Set(items.map((i) => i.publishedRevisionId).filter(Boolean))];
  const revs = revIds.length
    ? await client.contentRevision.findMany({ where: { id: { in: revIds } }, select: { id: true, title: true, summary: true } })
    : [];
  const revMap = new Map(revs.map((r) => [r.id, r]));

  const payloads = await Promise.all(items.map((i) => (handler ? handler.readPayload(client, i.publishedRevisionId) : null)));
  const fileIds = [...new Set(payloads.map((p) => p?.fileMediaId).filter(Boolean))];
  const media = fileIds.length ? await client.mediaAsset.findMany({ where: { id: { in: fileIds } } }) : [];
  const mediaMap = new Map(media.map((m) => [m.id, m]));

  return items.map((item, i) => {
    const payload = payloads[i] ?? {};
    const asset = payload.fileMediaId ? mediaMap.get(payload.fileMediaId) : null;
    const file = asset ? { url: resolveDeliveryUrl(asset), kind: asset.kind } : null;
    return shapeResource({ item, payload, rev: revMap.get(item.publishedRevisionId) ?? null, file });
  });
}

const publishedResourceSelect = { id: true, slug: true, orgUnitId: true, publishedRevisionId: true };

// Publicly-visible resources bound to one org unit, for a year (current by
// default). Empty array when the unit/year has none or no current year.
export async function listResourcesForUnit(orgUnitId, { yearId, client = prisma } = {}) {
  if (!orgUnitId) return [];
  const year = yearId ?? (await getCurrentYearId(client));
  if (!year) return [];
  const items = await client.contentItem.findMany({
    where: { contentType: CONTENT_TYPE, academicYearId: year, orgUnitId, status: "published", archivedAt: null, publishedRevisionId: { not: null } },
    select: publishedResourceSelect,
    orderBy: { createdAt: "asc" },
  });
  if (!items.length) return [];
  return hydrate(client, items);
}

// Every publicly-visible resource for a year, grouped by org unit id — for a
// future "all resources" index page. { [orgUnitId]: [resource, …] }.
export async function listPublicResourcesByUnit({ yearId, client = prisma } = {}) {
  const year = yearId ?? (await getCurrentYearId(client));
  if (!year) return {};
  const items = await client.contentItem.findMany({
    where: {
      contentType: CONTENT_TYPE,
      academicYearId: year,
      status: "published",
      archivedAt: null,
      publishedRevisionId: { not: null },
      orgUnitId: { not: null },
      // Also require the BOUND unit to be publicly visible (same year, published,
      // not archived) — a resource's status is independent of its unit's, so without
      // this a resource on a draft/archived unit would leak here. listResourcesForUnit
      // doesn't need this: its only caller (getPublicOrgUnit) already gated the unit.
      orgUnit: { is: { status: "published", archivedAt: null, academicYearId: year } },
    },
    select: publishedResourceSelect,
    orderBy: { createdAt: "asc" },
  });
  if (!items.length) return {};
  const shaped = await hydrate(client, items);
  const byUnit = {};
  items.forEach((item, i) => {
    (byUnit[item.orgUnitId] ??= []).push(shaped[i]);
  });
  return byUnit;
}
