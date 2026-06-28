// Cross-year HISTORY queries (capability 5 — Historical Archives). Read the
// content, org structure, and appointments of ANY academic year (current or
// past) by filtering on academic_year_id, and follow a logical org unit across
// years through its org_unit_lineage row.
//
// These are READ-ONLY. Past years are write-protected by the `lock_guard`
// trigger (a locked year rejects INSERT/UPDATE/DELETE on its structure/content);
// reads are never blocked, so historical archives stay fully browsable. Any
// WRITE to a locked year surfaces the friendly YEAR_LOCKED error (lib/cms/errors).
//
// The PUBLIC (anonymous) read path is lib/year/public.mjs (visibility rule
// applied for a chosen year). This module is the admin/editor history view: it
// can return drafts and unpublished rows, so route handlers gate it behind
// `year.read` / `content.read`.
import prisma from "../prisma.mjs";
import { getContentTypeHandler } from "../cms/content-types.mjs";

// All content items belonging to a year. `includeArchived` and `status` refine
// the set; `contentType` / `orgUnitId` narrow it. Newest-published first.
export async function listContentForYear(
  yearId,
  { contentType, orgUnitId, status, includeArchived = false } = {},
  { client = prisma } = {}
) {
  if (!yearId) return [];
  return client.contentItem.findMany({
    where: {
      academicYearId: yearId,
      ...(contentType ? { contentType } : {}),
      ...(orgUnitId ? { orgUnitId } : {}),
      ...(status ? { status } : {}),
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }, { createdAt: "desc" }],
  });
}

// All org units of a year (the structural skeleton for that year). Ordered for
// a stable tree render (parents and sort order). Excludes archived by default.
export async function listOrgUnitsForYear(
  yearId,
  { orgUnitTypeId, status, includeArchived = false } = {},
  { client = prisma } = {}
) {
  if (!yearId) return [];
  return client.orgUnit.findMany({
    where: {
      academicYearId: yearId,
      ...(orgUnitTypeId ? { orgUnitTypeId } : {}),
      ...(status ? { status } : {}),
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

// All appointments (roster) of a year, optionally for one org unit. Includes the
// person + position so a roster can be rendered without N+1 lookups.
export async function listAppointmentsForYear(
  yearId,
  { orgUnitId, status, includeArchived = false } = {},
  { client = prisma } = {}
) {
  if (!yearId) return [];
  return client.appointment.findMany({
    where: {
      academicYearId: yearId,
      ...(orgUnitId ? { orgUnitId } : {}),
      ...(status ? { status } : {}),
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    include: {
      person: { select: { id: true, fullName: true, personType: true, email: true } },
      position: { select: { id: true, key: true, name: true, isLead: true, rank: true } },
    },
    orderBy: [{ position: { rank: "desc" } }, { sortOrder: "asc" }],
  });
}

// Follow a logical org unit across ALL years via its org_unit_lineage row: one
// row per year the unit existed, oldest→newest, each annotated with its year. The
// org_unit.lineage_key is a REAL FK (DL-007), so this never dangles.
export async function followLineage(lineageKey, { client = prisma } = {}) {
  if (!lineageKey) return [];
  const units = await client.orgUnit.findMany({
    where: { lineageKey },
    include: {
      academicYear: { select: { id: true, label: true, status: true, startDate: true, isCurrent: true } },
      orgUnitType: { select: { key: true, name: true } },
    },
    orderBy: [{ academicYear: { startDate: "asc" } }],
  });
  return units.map((u) => ({
    year: u.academicYear,
    orgUnit: {
      id: u.id,
      name: u.name,
      slug: u.slug,
      status: u.status,
      orgUnitTypeId: u.orgUnitTypeId,
      orgUnitType: u.orgUnitType,
      archivedAt: u.archivedAt,
    },
  }));
}

// Full history of a logical unit: each year's org_unit PLUS that year's roster
// for the unit. Useful for a "this club over the years" archive page.
export async function getUnitHistory(lineageKey, { includeArchived = false } = {}, { client = prisma } = {}) {
  const timeline = await followLineage(lineageKey, { client });
  return Promise.all(
    timeline.map(async (entry) => ({
      ...entry,
      appointments: await listAppointmentsForYear(
        entry.year.id,
        { orgUnitId: entry.orgUnit.id, includeArchived },
        { client }
      ),
    }))
  );
}

// Read one revision's full content for a past year (spine + typed payload). Thin
// convenience over the content-type handler so a history view can show exactly
// what a document looked like in a given year without importing the CMS service.
export async function getYearRevisionView(revisionId, { client = prisma } = {}) {
  const revision = await client.contentRevision.findUnique({
    where: { id: revisionId },
    include: { contentItem: { select: { contentType: true, academicYearId: true } } },
  });
  if (!revision) return null;
  const handler = getContentTypeHandler(revision.contentItem.contentType);
  const payload = handler ? await handler.readPayload(client, revisionId) : null;
  return {
    id: revision.id,
    contentItemId: revision.contentItemId,
    contentType: revision.contentItem.contentType,
    academicYearId: revision.contentItem.academicYearId,
    revisionNo: revision.revisionNo,
    revisionStatus: revision.revisionStatus,
    title: revision.title,
    payload,
  };
}
