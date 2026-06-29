// Idempotent V1 → V2 resources importer (Session 7, DATA_MIGRATION_REPORT §7).
// Stands up the V1 per-unit infrastructure PDFs / Drive links (lib/resources/data.mjs)
// as `content_type='resource'` CMS content — one content_item + content_revision +
// resource_payload each, bound to its org_unit, scoped to one academic year
// (current by default), published.
//
// Like the Session-5/6 importers it is a CALLER of the Session-3 CMS service
// (createDraft → publish), NOT a new mutation pipeline. IDEMPOTENT by natural key
// (content_type='resource', year, slug): a re-run creates nothing
// (counts.resources.created == 0); a partial run resumes (a found-but-draft
// resource left by an interrupted run is re-published — DL-031). NOT one giant
// transaction (Neon latency), mirroring lib/org/import.mjs.
//
// PREREQUISITE: the org importer (npm run db:import:org) must have run first — a
// resource is org-bound, so it is SKIPPED (counted) when its target unit does not
// yet exist in the year, rather than fabricating a unit. The PDF file becomes a
// lightweight media_asset INVENTORY row (external Cloudinary URL → 'external'),
// reused across the three councils that share the Student Club Activities PDF.
//
// Run via `npm run db:import:resources` (scripts/import-resources.mjs).
import prisma from "../prisma.mjs";
import { getCurrentYearId } from "../year/context.mjs";
import { CmsValidationError } from "../cms/errors.mjs";
import { createDraft, publish as publishContent } from "../cms/content.mjs";
import { findOrCreateInventoryAsset } from "../media/service.mjs";
import { findOrgUnitBySlug } from "../org/units.mjs";
import { buildResourceImportPlan } from "./data.mjs";

const SYSTEM_ACTOR = { system: true };

// Import resources into the target year. opts:
//   { academicYearId?, publish=true, withMedia=true, plan? }
// `plan` defaults to the V1 resources (buildResourceImportPlan()); pass a smaller
// plan of the same shape for a bounded, cleanable test fixture.
export async function importResources(opts = {}, actor = SYSTEM_ACTOR) {
  const academicYearId = opts.academicYearId ?? (await getCurrentYearId());
  if (!academicYearId) {
    throw new CmsValidationError("No academic year to import into (no current year and none provided).", {
      status: 409,
      code: "NO_CURRENT_YEAR",
    });
  }
  const publish = opts.publish !== false;
  const withMedia = opts.withMedia !== false;
  const plan = opts.plan ?? buildResourceImportPlan();
  const counts = { resources: { created: 0, skipped: 0, missingUnit: 0 }, media: { created: 0, reused: 0 } };

  // Deduped media inventory (audit-bypassing) shared across the run, so the one
  // Student Club Activities PDF on three councils yields ONE media_asset row.
  const mediaCache = new Map();
  async function ensureMedia(ref) {
    if (!withMedia || !ref) return null;
    const m = await findOrCreateInventoryAsset(ref, { cache: mediaCache });
    if (!m) return null;
    if (m.created) counts.media.created += 1;
    else counts.media.reused += 1;
    return m.id;
  }

  for (const r of plan) {
    const unit = await findOrgUnitBySlug(academicYearId, r.unitSlug);
    if (!unit) {
      // The org import has not created this unit in this year yet — skip cleanly
      // (the operator runs db:import:org first; a later re-run picks it up).
      counts.resources.missingUnit += 1;
      continue;
    }

    const existing = await prisma.contentItem.findFirst({
      where: { contentType: "resource", academicYearId, slug: r.slug },
      select: { id: true, status: true, archivedAt: true, draftRevisionId: true },
    });
    if (existing) {
      counts.resources.skipped += 1;
      // Resume a partial run: publish a never-archived stranded draft (createDraft
      // and publish are two transactions — DL-031). Same accepted limitation as the
      // other importers (KNOWN_ISSUES #29): a deliberately-unpublished draft is
      // structurally indistinguishable from an interrupted one.
      if (publish && existing.status === "draft" && !existing.archivedAt && existing.draftRevisionId) {
        await publishContent(existing.id, {}, actor);
      }
      continue;
    }

    const fileMediaId = r.file ? await ensureMedia(r.file) : null;
    // NB: a resource gets its OWN content lineage (createDraft mints one) — it is
    // its own logical document, NOT tied to the unit's lineage. Reusing the unit's
    // lineageKey would trip content_item's UNIQUE(content_type, year, lineage_key)
    // and cap a unit at one resource. (Events follow the same pattern — DL-037.)
    const { item } = await createDraft(
      {
        contentType: "resource",
        academicYearId,
        orgUnitId: unit.id,
        slug: r.slug,
        title: r.title,
        payload: {
          resourceKind: r.resourceKind,
          fileMediaId,
          externalUrl: r.externalUrl,
          description: r.description,
        },
      },
      actor
    );
    if (publish) await publishContent(item.id, {}, actor);
    counts.resources.created += 1;
  }

  return { academicYearId, publish, counts };
}
