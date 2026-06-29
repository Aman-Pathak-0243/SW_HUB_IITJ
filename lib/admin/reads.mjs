// Admin Panel read composition (Session 9) — SERVER-ONLY gated reads that the
// admin Server Components render. These COMPOSE existing readers
// (lib/year/history.mjs, lib/cms/content.mjs, prisma) and hydrate the display
// fields a list/editor needs (e.g. a content_item's title, which lives on
// content_revision). Each asserts its module's READ permission (defense-in-depth;
// the page also gated the module) — a `system` actor bypasses.
//
// No mutation, no new business logic — pure read + shape over the spine.
import prisma from "../prisma.mjs";
import { assertActorPermission } from "../year/context.mjs";
import { listContentForYear, listOrgUnitsForYear, listAppointmentsForYear } from "../year/history.mjs";
import { getItem, listRevisions, getRevision } from "../cms/content.mjs";
import { shapeContentRow } from "./view-models.mjs";

// Content rows for a year (incl. drafts), titles resolved in one batched query.
export async function loadAdminContent({ yearId, contentType, includeArchived = false } = {}, actor = {}) {
  await assertActorPermission(actor, "content.read");
  if (!yearId) return [];
  const items = await listContentForYear(yearId, { contentType, includeArchived }, { client: prisma });
  // Resolve each item's display title from its published-or-draft revision in ONE query.
  const revIds = [...new Set(items.map((i) => i.publishedRevisionId ?? i.draftRevisionId).filter(Boolean))];
  const revs = revIds.length
    ? await prisma.contentRevision.findMany({ where: { id: { in: revIds } }, select: { id: true, title: true } })
    : [];
  const titleById = new Map(revs.map((r) => [r.id, r.title]));
  return items.map((i) => shapeContentRow(i, { title: titleById.get(i.publishedRevisionId ?? i.draftRevisionId) }));
}

// One content item with its full revision history AND each revision's view (so the
// editor can diff two revisions entirely client-side — see view-models#diffViews).
export async function loadAdminContentItem(itemId, actor = {}) {
  await assertActorPermission(actor, "content.read");
  const item = await getItem(itemId, { client: prisma });
  if (!item) return null;
  const revisionMetas = await listRevisions(itemId, { client: prisma });
  const views = await Promise.all(revisionMetas.map((r) => getRevision(r.id, { client: prisma })));
  const viewById = new Map(views.filter(Boolean).map((v) => [v.id, v]));
  return {
    item: item.item,
    contentType: item.item.contentType,
    draft: item.draft,
    published: item.published,
    revisions: revisionMetas.map((m) => ({ ...m, view: viewById.get(m.id) ?? null })),
  };
}

// Org units of a year (incl. drafts), shaped lightly with type + parent for a tree.
export async function loadAdminOrgUnits({ yearId, includeArchived = false } = {}, actor = {}) {
  await assertActorPermission(actor, "org_unit.read");
  if (!yearId) return [];
  const units = await prisma.orgUnit.findMany({
    where: { academicYearId: yearId, ...(includeArchived ? {} : { archivedAt: null }) },
    include: { orgUnitType: { select: { key: true, name: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return units.map((u) => ({
    id: u.id,
    name: u.name,
    slug: u.slug,
    status: u.status,
    parentId: u.parentId,
    lineageKey: u.lineageKey,
    sortOrder: u.sortOrder,
    orgUnitTypeId: u.orgUnitTypeId,
    typeKey: u.orgUnitType?.key ?? null,
    typeName: u.orgUnitType?.name ?? null,
  }));
}

function shapeApptRow(a) {
  return {
    id: a.id,
    orgUnitId: a.orgUnitId,
    status: a.status,
    titleOverride: a.titleOverride ?? null,
    personId: a.personId,
    personName: a.person?.fullName ?? null,
    positionId: a.positionId,
    positionName: a.position?.name ?? null,
    isLead: a.position?.isLead ?? false,
  };
}

// One unit's roster (appointments incl. drafts) with person + position joined.
export async function loadAdminRoster(orgUnitId, actor = {}) {
  await assertActorPermission(actor, "org_unit.read");
  const unit = await prisma.orgUnit.findUnique({ where: { id: orgUnitId }, select: { academicYearId: true } });
  if (!unit) return [];
  const appts = await listAppointmentsForYear(unit.academicYearId, { orgUnitId }, { client: prisma });
  return appts.map(shapeApptRow);
}

// Every appointment of a year (incl. drafts), grouped by org unit id — ONE query
// (the per-unit alternative is pathological under Neon latency for ~40 units).
export async function loadRosterByUnit({ yearId } = {}, actor = {}) {
  await assertActorPermission(actor, "org_unit.read");
  if (!yearId) return {};
  const appts = await listAppointmentsForYear(yearId, { includeArchived: true }, { client: prisma });
  const byUnit = {};
  for (const a of appts) (byUnit[a.orgUnitId] ??= []).push(shapeApptRow(a));
  return byUnit;
}

// Position definitions (for the appointment form's position select), optionally by
// the unit type a position applies to.
export async function loadPositions({ appliesToTypeKey } = {}, actor = {}) {
  await assertActorPermission(actor, "org_unit.read");
  let appliesToTypeId;
  if (appliesToTypeKey) {
    const t = await prisma.orgUnitType.findUnique({ where: { key: appliesToTypeKey }, select: { id: true } });
    appliesToTypeId = t?.id;
  }
  const rows = await prisma.position.findMany({
    where: { status: "active", ...(appliesToTypeId ? { appliesToTypeId } : {}) },
    orderBy: [{ rank: "desc" }, { name: "asc" }],
    select: { id: true, key: true, name: true, appliesToTypeId: true, maxHolders: true, isLead: true },
  });
  return rows;
}

// Org-unit types (for the create-unit form's type select).
export async function loadOrgUnitTypes(actor = {}) {
  await assertActorPermission(actor, "org_unit.read");
  return prisma.orgUnitType.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, key: true, name: true } });
}

// The directory of people (for the appointment form's person select / dedup view).
export async function loadPeople({ search, take = 300 } = {}, actor = {}) {
  await assertActorPermission(actor, "org_unit.read");
  const rows = await prisma.person.findMany({
    where: { archivedAt: null, ...(search ? { fullName: { contains: search, mode: "insensitive" } } : {}) },
    orderBy: { fullName: "asc" },
    take,
    select: { id: true, fullName: true, personType: true, email: true },
  });
  return rows;
}
