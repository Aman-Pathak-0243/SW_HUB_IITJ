// PUBLIC org read layer (capabilities 2 + 6) — the data-access functions the
// anonymous, data-driven org pages render from. ONE set of helpers serves every
// unit kind (council / club / hostel / mess), which is what lets a single
// <OrgUnitPage> replace the four near-identical V1 Clubs pages (KNOWN_ISSUES #13).
//
// Public org rule (parallels lib/cms/visibility.mjs, applied to the org_unit's
// own status): a unit is public iff status='published' AND academic_year_id =
// the resolved year (current by default) AND archived_at IS NULL. Its bound
// profile content follows the SAME CMS visibility rule (published current-year
// revision). Its roster is the published, non-archived appointments. Year can be
// overridden to read a past year's archive (lib/year/public.mjs selectability).
//
// Reads only — no mutation, no auth (anonymous). Admin/editor reads that see
// drafts go through lib/cms/content.mjs + lib/year/history.mjs.
import prisma from "../prisma.mjs";
import { getCurrentYearId } from "../year/context.mjs";
import { getContentTypeHandler } from "../cms/content-types.mjs";
import { listResourcesForUnit } from "../resources/public.mjs";
import { cloudinaryAutoUrl } from "../media/cloudinary.mjs";

// org_unit_type key → its bound profile content_type.
export const PROFILE_TYPE_BY_UNIT_TYPE = {
  council: "council_profile",
  club: "club_profile",
  hostel: "hostel_profile",
  mess: "mess_profile",
};

async function resolveYear(yearId, client) {
  return yearId ?? (await getCurrentYearId(client));
}

// Prisma `where` for a publicly-visible org_unit in `yearId`.
function publicUnitWhere(yearId, { typeId, parentId, slug } = {}) {
  return {
    academicYearId: yearId,
    status: "published",
    archivedAt: null,
    ...(typeId ? { orgUnitTypeId: typeId } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
    ...(slug ? { slug } : {}),
  };
}

const unitSelect = {
  id: true,
  slug: true,
  name: true,
  sortOrder: true,
  parentId: true,
  academicYearId: true,
  orgUnitType: { select: { key: true, name: true } },
};

function shapeUnit(u) {
  return { id: u.id, slug: u.slug, name: u.name, sortOrder: u.sortOrder, parentId: u.parentId, typeKey: u.orgUnitType?.key ?? null, typeName: u.orgUnitType?.name ?? null };
}

// Collect every "*MediaId" value off a payload object (logo/hero/building/image/
// infrastructure pdf) so the referenced media URLs can be resolved in one query.
function payloadMediaIds(payload) {
  const ids = [];
  if (!payload) return ids;
  for (const [k, v] of Object.entries(payload)) {
    if (k.endsWith("MediaId") && v) ids.push(v);
  }
  return ids;
}

// Resolve a set of media ids → { id: { url, kind } } in one query.
async function resolveMedia(client, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const rows = await client.mediaAsset.findMany({ where: { id: { in: unique } }, select: { id: true, url: true, kind: true } });
  // Org profile media are images (logos/heroes/buildings/photos) → serve through
  // Cloudinary f_auto,q_auto for CWV. A pdf/raw asset (rare here) keeps its raw url
  // so a delivered file isn't rasterized; non-Cloudinary urls pass through.
  return Object.fromEntries(
    rows.map((m) => [m.id, { url: m.kind === "image" ? cloudinaryAutoUrl(m.url) : m.url, kind: m.kind }])
  );
}

// The unit's bound profile content (published current-year revision) or null.
async function loadProfile(client, unit) {
  const contentType = PROFILE_TYPE_BY_UNIT_TYPE[unit.orgUnitType?.key];
  if (!contentType) return null;
  const item = await client.contentItem.findFirst({
    where: { contentType, academicYearId: unit.academicYearId, orgUnitId: unit.id, status: "published", archivedAt: null, publishedRevisionId: { not: null } },
    select: { id: true, contentType: true, slug: true, publishedRevisionId: true },
  });
  if (!item) return null;
  const handler = getContentTypeHandler(contentType);
  const payload = handler ? await handler.readPayload(client, item.publishedRevisionId) : null;
  const rev = await client.contentRevision.findUnique({ where: { id: item.publishedRevisionId }, select: { title: true, summary: true } });
  return { contentType, title: rev?.title ?? unit.name, summary: rev?.summary ?? null, payload };
}

// The unit's published, non-archived roster (people in positions), lead-first.
async function loadRoster(client, unit) {
  const appts = await client.appointment.findMany({
    where: { orgUnitId: unit.id, academicYearId: unit.academicYearId, status: "published", archivedAt: null },
    select: {
      id: true,
      titleOverride: true,
      sortOrder: true,
      position: { select: { key: true, name: true, isLead: true, rank: true } },
      person: { select: { id: true, fullName: true, personType: true, profileUrl: true, photo: { select: { url: true } } } },
    },
    orderBy: [{ position: { rank: "desc" } }, { sortOrder: "asc" }],
  });
  return appts.map((a) => ({
    id: a.id,
    title: a.titleOverride ?? a.position?.name ?? null,
    positionKey: a.position?.key ?? null,
    positionName: a.position?.name ?? null,
    isLead: a.position?.isLead ?? false,
    person: { id: a.person?.id, name: a.person?.fullName, type: a.person?.personType, profileUrl: a.person?.profileUrl ?? null, photoUrl: a.person?.photo?.url ?? null },
  }));
}

// List publicly-visible units of a type for a year, each with its profile + lead
// (for a tiles/list page). `yearId` defaults to the current year.
export async function listPublicOrgUnits(typeKey, { yearId } = {}, { client = prisma } = {}) {
  const year = await resolveYear(yearId, client);
  if (!year) return [];
  const typeId = typeKey ? (await client.orgUnitType.findUnique({ where: { key: typeKey }, select: { id: true } }))?.id : undefined;
  if (typeKey && !typeId) return [];
  const units = await client.orgUnit.findMany({ where: publicUnitWhere(year, { typeId }), select: unitSelect, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  // Resolve each unit's profile + media concurrently — sequential awaits here are
  // pathologically slow under Neon's per-round-trip latency (a 30-unit list page).
  return Promise.all(
    units.map(async (u) => {
      const profile = await loadProfile(client, u);
      const media = await resolveMedia(client, payloadMediaIds(profile?.payload));
      return { unit: shapeUnit(u), profile, media };
    })
  );
}

// One unit's full public view by slug: unit + profile + roster + (for councils)
// published child units, with all referenced media URLs resolved. Null when the
// unit is not publicly visible in the resolved year.
export async function getPublicOrgUnit(slug, { yearId } = {}, { client = prisma } = {}) {
  const year = await resolveYear(yearId, client);
  if (!year) return null;
  const unit = await client.orgUnit.findFirst({ where: publicUnitWhere(year, { slug }), select: unitSelect });
  if (!unit) return null;

  const [profile, roster, resources] = await Promise.all([
    loadProfile(client, unit),
    loadRoster(client, unit),
    // Per-unit Resources (PDFs / Drive links) — published, current-year (Session 7).
    listResourcesForUnit(unit.id, { yearId: year, client }),
  ]);

  // Published children (e.g. a council's clubs), lightweight + with their lead.
  const childRows = await client.orgUnit.findMany({ where: publicUnitWhere(year, { parentId: unit.id }), select: unitSelect, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const children = await Promise.all(childRows.map(async (c) => ({ unit: shapeUnit(c), profile: await loadProfile(client, c) })));

  // Resolve media for the profile, every child profile, and each roster photo.
  const ids = [
    ...payloadMediaIds(profile?.payload),
    ...children.flatMap((c) => payloadMediaIds(c.profile?.payload)),
  ];
  const media = await resolveMedia(client, ids);

  return { year, unit: shapeUnit(unit), profile, roster, children, resources, media };
}

// The council → clubs structure for the clubs landing page (published units in
// the resolved year). Councils sorted, each with its published clubs + leads.
export async function getPublicOrgStructure({ yearId } = {}, { client = prisma } = {}) {
  const year = await resolveYear(yearId, client);
  if (!year) return [];
  const councilTypeId = (await client.orgUnitType.findUnique({ where: { key: "council" }, select: { id: true } }))?.id;
  if (!councilTypeId) return [];
  const councils = await client.orgUnit.findMany({ where: publicUnitWhere(year, { typeId: councilTypeId }), select: unitSelect, orderBy: [{ sortOrder: "asc" }] });
  // Resolve councils (and each council's clubs) concurrently — see listPublicOrgUnits.
  return Promise.all(
    councils.map(async (c) => {
      const childRows = await client.orgUnit.findMany({ where: publicUnitWhere(year, { parentId: c.id }), select: unitSelect, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
      const clubs = await Promise.all(
        childRows.map(async (club) => {
          const profile = await loadProfile(client, club);
          const media = await resolveMedia(client, payloadMediaIds(profile?.payload));
          return { unit: shapeUnit(club), profile, media };
        })
      );
      return { council: shapeUnit(c), clubs };
    })
  );
}
