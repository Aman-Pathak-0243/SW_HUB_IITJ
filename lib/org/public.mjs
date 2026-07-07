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
import { listClubDocs } from "./docs.mjs";
import { listClubEvents, listClubAnnouncements, splitEventsByDate, groupByWindow } from "../events/public.mjs";
import { getMembershipCountForUnit } from "../memberships/service.mjs";
import { listClubAchievements } from "../achievements/public.mjs";
import { cloudinaryAutoUrl } from "../media/cloudinary.mjs";

// Unit types that get the expanded, tabbed club/council experience (M3): events,
// announcements, documents, achievements. Hostels/messes keep the base view.
export const EXPANDED_UNIT_TYPES = new Set(["council", "club"]);

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
  lineageKey: true,
  academicYearId: true,
  orgUnitType: { select: { key: true, name: true } },
};

function shapeUnit(u) {
  // lineageKey (M3) is the durable logical-unit id — needed to read the club's
  // membership count and to scope membership management; it is an internal uuid
  // (already used for RBAC scope), not sensitive PII.
  return { id: u.id, slug: u.slug, name: u.name, sortOrder: u.sortOrder, parentId: u.parentId, lineageKey: u.lineageKey, typeKey: u.orgUnitType?.key ?? null, typeName: u.orgUnitType?.name ?? null };
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
  // `id` (the profile content_item id) is exposed so an authorized viewer can inline-edit
  // the profile on the public page (Session 15, DL-103); it is an internal uuid used for the
  // gated content.edit call, not sensitive.
  return { id: item.id, contentType, title: rev?.title ?? unit.name, summary: rev?.summary ?? null, payload };
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
      const [profile, roster] = await Promise.all([loadProfile(client, u), loadRoster(client, u)]);
      const media = await resolveMedia(client, payloadMediaIds(profile?.payload));
      // The unit's HEADS for the listing card — the Associate Dean(s) + the lead
      // (council SECRETARY / hostel WARDEN / mess SECRETARY). Roster is rank-ordered, so
      // the AD (rank 90) shows before the secretary (rank 50).
      const heads = roster
        .filter((r) => r.isLead || r.positionKey === "associate_dean")
        .map((r) => ({ name: r.person.name, title: r.title, photoUrl: r.person.photoUrl, profileUrl: r.person.profileUrl }));
      return { unit: shapeUnit(u), profile, media, heads };
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

  // Published children (e.g. a council's clubs) — each with its profile (logo) + PIC +
  // coordinators, so a council page can render the SAME enriched club cards as /org/clubs.
  const childRows = await client.orgUnit.findMany({ where: publicUnitWhere(year, { parentId: unit.id }), select: unitSelect, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const children = await Promise.all(childRows.map(async (c) => {
    const [cProfile, cRoster] = await Promise.all([loadProfile(client, c), loadRoster(client, c)]);
    const picRow = cRoster.find((r) => r.positionKey === "pic") ?? null;
    const coords = cRoster.filter((r) => r.positionKey === "coordinator" || r.positionKey === "co_coordinator");
    return {
      unit: shapeUnit(c),
      profile: cProfile,
      pic: picRow ? { name: picRow.person.name, photoUrl: picRow.person.photoUrl } : null,
      coordinators: coords.map((r) => ({ name: r.person.name, photoUrl: r.person.photoUrl })),
    };
  }));

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
          // Load the profile + roster so each card can show the club's PIC + coordinator(s).
          const [profile, roster] = await Promise.all([loadProfile(client, club), loadRoster(client, club)]);
          const media = await resolveMedia(client, payloadMediaIds(profile?.payload));
          const picRow = roster.find((r) => r.positionKey === "pic") ?? null;
          const coordinators = roster.filter((r) => r.positionKey === "coordinator" || r.positionKey === "co_coordinator");
          return {
            unit: shapeUnit(club),
            profile,
            media,
            pic: picRow ? { name: picRow.person.name, photoUrl: picRow.person.photoUrl } : null,
            coordinators: coordinators.map((c) => ({ name: c.person.name, role: c.positionName, photoUrl: c.person.photoUrl })),
          };
        })
      );
      return { council: shapeUnit(c), clubs };
    })
  );
}

// The FULL tabbed detail view for a club/council (M3) — the base public view
// (unit + profile + roster + resources + children + media) PLUS the expanded tabs:
// past/upcoming events organized, club announcements (grouped past/current/upcoming),
// markdown documents, and the members count. The extra reads run CONCURRENTLY after
// the base view (which yields the unit id + lineage) so Neon round-trips are batched.
// For non-expanded types (hostel/mess) it returns the base view with empty tab data,
// so ONE renderer serves every unit. Null when the unit is not publicly visible.
export async function getClubPageView(slug, { yearId, now = new Date() } = {}, { client = prisma } = {}) {
  const base = await getPublicOrgUnit(slug, { yearId }, { client });
  if (!base) return null;
  const expanded = EXPANDED_UNIT_TYPES.has(base.unit.typeKey);
  if (!expanded) {
    return { ...base, expanded: false, events: { past: [], upcoming: [] }, announcements: { past: [], current: [], upcoming: [] }, docs: [], achievements: [], memberCount: 0 };
  }
  const year = base.year;
  const [clubEvents, clubAnnouncements, docs, achievements, memberCount] = await Promise.all([
    listClubEvents(base.unit.id, { yearId: year, lineageKey: base.unit.lineageKey, now, client }),
    listClubAnnouncements(base.unit.id, { yearId: year, now, client }),
    listClubDocs(base.unit.id, { yearId: year, client }),
    // The per-club Wall-of-Fame slice (M4) — achievements credited to this club's
    // DURABLE lineage (not the per-year unit id), so it survives a year rollover.
    listClubAchievements(base.unit.lineageKey, { yearId: year, client }),
    getMembershipCountForUnit(base.unit.lineageKey, { client }),
  ]);
  return {
    ...base,
    expanded: true,
    events: splitEventsByDate(clubEvents, now),
    announcements: groupByWindow(clubAnnouncements, { now, fromKey: "publishFrom", untilKey: "publishUntil" }),
    docs,
    achievements,
    memberCount,
  };
}
