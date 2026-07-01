// PUBLIC read layer for CLUB "Miscellaneous" MARKDOWN docs (M3, DL-076). A club doc
// is year-scoped, ORG-BOUND CMS content (content_type='club_doc') reusing
// page_block_payload (blockKind='markdown', body=markdown), so its public visibility
// is the Session-3 rule applied to the bound unit's year: published AND current-year
// (overridable) AND not-archived AND has a published revision. This module does NOT
// re-implement that rule — it queries the spine the same way lib/resources/public.mjs
// does and shapes the {item, payload} records into flat objects the Documents tab
// renders (the markdown body is rendered SAFELY client-side via lib/markdown/render).
//
// Reads only — no mutation, no auth (anonymous). Mutations go through the CMS service
// (lib/cms/content.mjs) scoped to the club's lineage (content.* + DL-066).
import prisma from "../prisma.mjs";
import { getCurrentYearId } from "../year/context.mjs";
import { getContentTypeHandler } from "../cms/content-types.mjs";

const CONTENT_TYPE = "club_doc";

// Shape a hydrated {item, payload, rev} record → the flat doc object the renderer
// consumes. PURE + exported for unit testing. `body` is RAW markdown (rendered safely
// at the presentation layer, never here).
export function shapeDoc({ item, payload = {}, rev = null }) {
  return {
    id: item.id,
    slug: item.slug ?? null,
    title: rev?.title ?? null,
    summary: rev?.summary ?? null,
    body: payload.body ?? null,
    updatedAt: item.publishedAt instanceof Date ? item.publishedAt.toISOString() : item.publishedAt ?? null,
  };
}

async function hydrate(client, items) {
  const handler = getContentTypeHandler(CONTENT_TYPE);
  const revIds = [...new Set(items.map((i) => i.publishedRevisionId).filter(Boolean))];
  const revs = revIds.length
    ? await client.contentRevision.findMany({ where: { id: { in: revIds } }, select: { id: true, title: true, summary: true } })
    : [];
  const revMap = new Map(revs.map((r) => [r.id, r]));
  const payloads = await Promise.all(items.map((i) => (handler ? handler.readPayload(client, i.publishedRevisionId) : null)));
  return items.map((item, i) => shapeDoc({ item, payload: payloads[i] ?? {}, rev: revMap.get(item.publishedRevisionId) ?? null }));
}

// Publicly-visible markdown docs bound to one org unit, for a year (current by
// default), most-recently-published first. Empty array when the unit/year has none.
export async function listClubDocs(orgUnitId, { yearId, client = prisma } = {}) {
  if (!orgUnitId) return [];
  const year = yearId ?? (await getCurrentYearId(client));
  if (!year) return [];
  const items = await client.contentItem.findMany({
    where: { contentType: CONTENT_TYPE, academicYearId: year, orgUnitId, status: "published", archivedAt: null, publishedRevisionId: { not: null } },
    select: { id: true, slug: true, publishedRevisionId: true, publishedAt: true },
    orderBy: { publishedAt: "desc" },
  });
  if (!items.length) return [];
  return hydrate(client, items);
}
