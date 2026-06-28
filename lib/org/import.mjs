// Idempotent V1 → V2 org-content importer (Session 5, DATA_MIGRATION_REPORT §7).
// Stands up the 4 councils, ~30 clubs, 6 hostels and 5 messes as `org_unit` rows
// + bound `*_profile` content_items (through the CMS service) + the people and
// appointments that staff them — all scoped to one academic year (the current
// year by default).
//
// IDEMPOTENT by natural key, so it is safe to re-run (and to run after a partial
// failure): org_units by (year, slug); profile content_items by (content_type,
// year, org_unit); appointments by (year, unit, position, person); people by
// cleaned name. A second run creates nothing new (counts.*.created == 0). It is
// NOT one giant transaction (Neon latency, like the Transition Wizard — DL-031);
// each entity is created through its audited service call.
//
// Media: V1 image/logo refs become lightweight `media_asset` INVENTORY rows
// (external Cloudinary URLs as 'external'; "/public" paths as 'local' with
// original_path kept for the Session-7 Cloudinary migration). These are written
// on the audit-bypassing base client to avoid flooding the audit log with ~150
// per-image rows; the org/people/appointment/content writes stay fully audited.
//
// AUTH: pass a real `actor` (a developer / org_manager) to exercise RBAC, or rely
// on the default `{ system: true }` actor (seed/migration bypass), mirroring the
// seed. Run via `npm run db:import:org` (scripts/import-org.mjs).
import prisma, { prismaBase } from "../prisma.mjs";
import { getCurrentYearId } from "../year/context.mjs";
import { CmsValidationError } from "../cms/errors.mjs";
import { createDraft, publish as publishContent } from "../cms/content.mjs";
import { buildImportPlan, PLAN_POSITION_KEYS } from "./data/index.mjs";
import { classifyMedia, mediaKey, inferPersonType, toTimeDate } from "./normalize.mjs";
import { createOrgUnit, findOrgUnitBySlug, publishOrgUnit, resolveTypeId } from "./units.mjs";
import { upsertPerson } from "./people.mjs";
import { createAppointment, findAppointment, publishAppointment } from "./appointments.mjs";

const SYSTEM_ACTOR = { system: true };

function newCounts() {
  return {
    orgUnits: { created: 0, skipped: 0 },
    content: { created: 0, skipped: 0 },
    people: { created: 0, reused: 0 },
    appointments: { created: 0, skipped: 0 },
    media: { created: 0, reused: 0 },
  };
}

// Walk an org plan into the target year. opts:
//   { academicYearId?, publish=true, withMedia=true, plan? }
// `plan` defaults to the full V1 dataset (buildImportPlan()); pass a smaller plan
// of the same shape to import a subset (used by the live-DB test for bounded,
// safely-cleanable fixtures).
export async function importOrgData(opts = {}, actor = SYSTEM_ACTOR) {
  const academicYearId = opts.academicYearId ?? (await getCurrentYearId());
  if (!academicYearId) {
    throw new CmsValidationError("No academic year to import into (no current year and none provided).", {
      status: 409,
      code: "NO_CURRENT_YEAR",
    });
  }
  const publish = opts.publish !== false;
  const withMedia = opts.withMedia !== false;
  const counts = newCounts();

  // ── lookups ──
  const positions = await prisma.position.findMany({ select: { id: true, key: true, holderKind: true } });
  const positionByKey = new Map(positions.map((p) => [p.key, p]));
  const missing = PLAN_POSITION_KEYS.filter((k) => !positionByKey.has(k));
  if (missing.length) {
    throw new CmsValidationError(`Seed is missing required position(s): ${missing.join(", ")}. Run db:seed first.`);
  }
  const typeIds = {
    council: await resolveTypeId("council"),
    club: await resolveTypeId("club"),
    hostel: await resolveTypeId("hostel"),
    mess: await resolveTypeId("mess"),
  };
  for (const [k, v] of Object.entries(typeIds)) {
    if (!v) throw new CmsValidationError(`Seed is missing org_unit_type '${k}'. Run db:seed first.`);
  }

  // ── media inventory (audit-bypassing, deduped) ──
  const mediaCache = new Map();
  async function ensureMedia(ref) {
    if (!withMedia) return null;
    const c = classifyMedia(ref);
    if (!c) return null;
    const key = mediaKey(c);
    if (mediaCache.has(key)) {
      counts.media.reused += 1; // a repeated reference to an already-resolved asset
      return mediaCache.get(key);
    }
    const where = c.originalPath ? { originalPath: c.originalPath } : { url: c.url };
    let row = await prismaBase.mediaAsset.findFirst({ where });
    if (row) {
      counts.media.reused += 1;
    } else {
      row = await prismaBase.mediaAsset.create({
        data: { storageProvider: c.storageProvider, url: c.url, originalPath: c.originalPath, kind: c.kind },
      });
      counts.media.created += 1;
    }
    mediaCache.set(key, row.id);
    return row.id;
  }

  // ── helpers ──
  async function ensureUnit({ typeKey, slug, name, parentId = null, sortOrder = 0 }) {
    let unit = await findOrgUnitBySlug(academicYearId, slug);
    if (unit) {
      counts.orgUnits.skipped += 1;
      if (publish && unit.status !== "published") {
        ({ unit } = await publishOrgUnit(unit.id, actor));
      }
      return unit;
    }
    const res = await createOrgUnit(
      { academicYearId, typeKey, slug, name, parentId, sortOrder, status: publish ? "published" : "draft" },
      actor
    );
    counts.orgUnits.created += 1;
    return res.unit;
  }

  // Create a bound profile content_item ONCE per unit; re-runs skip it (so the
  // importer never spawns extra revisions — admin edits own the content after).
  // BUT if a prior partial run left it committed-as-draft (createDraft and the
  // separate publishContent are two transactions — DL-031), a resume re-publishes
  // it, mirroring ensureUnit/ensureAppointment, so it is never stranded invisible.
  async function ensureProfile(unit, contentType, title, payload) {
    const existing = await prisma.contentItem.findFirst({
      where: { contentType, academicYearId, orgUnitId: unit.id },
      select: { id: true, status: true, draftRevisionId: true },
    });
    if (existing) {
      counts.content.skipped += 1;
      if (publish && existing.status !== "published" && existing.draftRevisionId) {
        await publishContent(existing.id, {}, actor);
      }
      return existing;
    }
    const { item } = await createDraft(
      { contentType, academicYearId, orgUnitId: unit.id, lineageKey: unit.lineageKey, slug: unit.slug, title, payload },
      actor
    );
    if (publish) await publishContent(item.id, {}, actor);
    counts.content.created += 1;
    return item;
  }

  async function ensurePerson({ name, positionKey, scope, profileUrl = null, phone = null, photo = null }) {
    const fallback = positionByKey.get(positionKey)?.holderKind ?? "student";
    const personType = inferPersonType(name, fallback);
    const photoMediaId = await ensureMedia(photo);
    const res = await upsertPerson({ fullName: name, personType, profileUrl, phone, photoMediaId }, actor, { scope });
    if (res.created) counts.people.created += 1;
    else counts.people.reused += 1;
    return res.person;
  }

  async function ensureAppointment(unit, positionKey, person, { titleOverride = null, sortOrder = 0 } = {}) {
    const positionId = positionByKey.get(positionKey).id;
    const existing = await findAppointment(academicYearId, unit.id, positionId, person.id);
    if (existing) {
      counts.appointments.skipped += 1;
      if (publish && existing.status !== "published") await publishAppointment(existing.id, actor);
      return existing;
    }
    const res = await createAppointment(
      { orgUnitId: unit.id, positionId, personId: person.id, titleOverride, sortOrder, status: publish ? "published" : "draft" },
      actor
    );
    counts.appointments.created += 1;
    return res.appointment;
  }

  // RBAC scope of a unit (so people are authorized at the same scope as the
  // appointment that motivates them — a unit/year-scoped manager works too).
  const scopeOf = (u) => ({ academicYearId, orgUnitLineageKey: u.lineageKey });

  const plan = opts.plan ?? buildImportPlan();

  // ── councils + clubs ──
  let councilOrder = 0;
  for (const council of plan.councils) {
    const councilUnit = await ensureUnit({ typeKey: "council", slug: council.slug, name: council.name, sortOrder: councilOrder++ });
    await ensureProfile(councilUnit, "council_profile", council.name, {});
    if (council.secretary) {
      const person = await ensurePerson({ name: council.secretary.name, positionKey: "council_secretary", photo: council.secretary.photo, scope: scopeOf(councilUnit) });
      await ensureAppointment(councilUnit, "council_secretary", person, { titleOverride: council.secretary.titleOverride });
    }

    let clubOrder = 0;
    for (const club of council.clubs) {
      const clubUnit = await ensureUnit({ typeKey: "club", slug: club.slug, name: club.name, parentId: councilUnit.id, sortOrder: clubOrder++ });
      const logoMediaId = await ensureMedia(club.logo);
      await ensureProfile(clubUnit, "club_profile", club.name, {
        vision: club.vision,
        instagramUrl: club.instagram,
        logoMediaId,
        missionPoints: club.mission.map((text, i) => ({ text, sortOrder: i })),
      });
      if (club.pic) {
        const pic = await ensurePerson({ name: club.pic.name, positionKey: "pic", profileUrl: club.pic.profileUrl, photo: club.pic.photo, scope: scopeOf(clubUnit) });
        await ensureAppointment(clubUnit, "pic", pic, { sortOrder: 0 });
      }
      let coordOrder = 0;
      for (const c of club.coordinators) {
        const person = await ensurePerson({ name: c.name, positionKey: c.positionKey, photo: c.photo, scope: scopeOf(clubUnit) });
        await ensureAppointment(clubUnit, c.positionKey, person, { sortOrder: coordOrder++ });
      }
    }
  }

  // ── hostels ──
  let hostelOrder = 0;
  for (const hostel of plan.hostels) {
    const unit = await ensureUnit({ typeKey: "hostel", slug: hostel.slug, name: hostel.name, sortOrder: hostelOrder++ });
    const buildingMediaId = await ensureMedia(hostel.image);
    await ensureProfile(unit, "hostel_profile", hostel.name, { buildingMediaId, officeEmail: hostel.officeEmail });
    let roleOrder = 0;
    for (const r of hostel.roles) {
      const person = await ensurePerson({ name: r.name, positionKey: r.positionKey, phone: r.phone, photo: r.photo, scope: scopeOf(unit) });
      await ensureAppointment(unit, r.positionKey, person, { sortOrder: roleOrder++ });
    }
  }

  // ── messes (+ the campus-wide committee on the first mess unit — DL-035) ──
  let messOrder = 0;
  let firstMessUnit = null;
  for (const mess of plan.messes) {
    const unit = await ensureUnit({ typeKey: "mess", slug: mess.slug, name: mess.name, sortOrder: messOrder++ });
    if (!firstMessUnit) firstMessUnit = unit;
    const imageMediaId = await ensureMedia(mess.image);
    await ensureProfile(unit, "mess_profile", mess.name, {
      location: mess.location,
      capacity: mess.capacity,
      imageMediaId,
      // Convert canonical "HH:MM:SS" → the Date a Prisma @db.Time column expects.
      mealTimings: mess.mealTimings.map((t) => ({ meal: t.meal, startTime: toTimeDate(t.startTime), endTime: toTimeDate(t.endTime), wrapsMidnight: t.wrapsMidnight, sortOrder: t.sortOrder })),
    });
  }
  if (firstMessUnit) {
    let order = 0;
    for (const m of plan.messCommittee) {
      const person = await ensurePerson({ name: m.name, positionKey: m.positionKey, photo: m.photo, scope: scopeOf(firstMessUnit) });
      await ensureAppointment(firstMessUnit, m.positionKey, person, { titleOverride: m.titleOverride, sortOrder: order++ });
    }
  }

  return { academicYearId, publish, counts };
}
