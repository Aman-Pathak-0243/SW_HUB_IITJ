// Idempotent V1 → V2 events importer (Session 6, DATA_MIGRATION_REPORT §2/§7).
// Migrates the 3 backed-up Mongo `events` documents (lib/events/data.mjs) into
// Postgres as `content_type='event'` CMS content — one content_item +
// content_revision + event_payload each — scoped to one academic year (the
// current year by default), published.
//
// It is a CALLER of the Session-3 CMS service (createDraft → publish), NOT a new
// mutation pipeline: the draft/publish lifecycle, the audit write, and the
// publish-window CHECK are all the CMS service's job (NEXT_TASK guard rails).
//
// IDEMPOTENT by natural key (content_type='event', year, slug): a re-run creates
// nothing (counts.events.created == 0), and a partial run is resumable (a
// found-but-draft event left by an interrupted run — createDraft and publish are
// two transactions, DL-031 — is re-published). It is NOT one giant transaction
// (Neon latency), mirroring lib/org/import.mjs.
//
// Media: a V1 `image` ref becomes a lightweight `media_asset` INVENTORY row, never
// an inline blob (KNOWN_ISSUES #5). All three backed-up events have an EMPTY image
// so zero media rows are created in practice; base64 `data:` images (if any) are
// recorded as placeholders flagged for the Session-7 Cloudinary upload
// (classifyMedia). Inventory rows are written on the audit-bypassing base client.
//
// Run via `npm run db:import:events` (scripts/import-events.mjs).
import prisma, { prismaBase } from "../prisma.mjs";
import { getCurrentYearId } from "../year/context.mjs";
import { CmsValidationError } from "../cms/errors.mjs";
import { createDraft, publish as publishContent } from "../cms/content.mjs";
import { buildEventImportPlan } from "./data.mjs";
import { classifyMedia, mediaKey } from "../org/normalize.mjs";

const SYSTEM_ACTOR = { system: true };

// Import a list of events into the target year. opts:
//   { academicYearId?, publish=true, withMedia=true, plan? }
// `plan` defaults to the backed-up V1 events (buildEventImportPlan()); pass a
// smaller plan of the same shape for a bounded, cleanable test fixture.
export async function importEvents(opts = {}, actor = SYSTEM_ACTOR) {
  const academicYearId = opts.academicYearId ?? (await getCurrentYearId());
  if (!academicYearId) {
    throw new CmsValidationError("No academic year to import into (no current year and none provided).", {
      status: 409,
      code: "NO_CURRENT_YEAR",
    });
  }
  const publish = opts.publish !== false;
  const withMedia = opts.withMedia !== false;
  const plan = opts.plan ?? buildEventImportPlan();
  const counts = { events: { created: 0, skipped: 0 }, media: { created: 0, reused: 0 } };

  // media inventory (audit-bypassing, deduped by natural key; base64 placeholders
  // are intentionally NOT deduped — each is a distinct Session-7 reconciliation).
  const mediaCache = new Map();
  async function ensureMedia(ref) {
    if (!withMedia) return null;
    const c = classifyMedia(ref);
    if (!c) return null;
    if (!c.isBase64) {
      const key = mediaKey(c);
      if (mediaCache.has(key)) {
        counts.media.reused += 1;
        return mediaCache.get(key);
      }
      const where = c.originalPath ? { originalPath: c.originalPath } : { url: c.url };
      const existing = await prismaBase.mediaAsset.findFirst({ where });
      if (existing) {
        counts.media.reused += 1;
        mediaCache.set(key, existing.id);
        return existing.id;
      }
    }
    const row = await prismaBase.mediaAsset.create({
      data: { storageProvider: c.storageProvider, url: c.url, originalPath: c.originalPath, kind: c.kind },
    });
    counts.media.created += 1;
    if (!c.isBase64) mediaCache.set(mediaKey(c), row.id);
    return row.id;
  }

  for (const ev of plan) {
    const existing = await prisma.contentItem.findFirst({
      where: { contentType: "event", academicYearId, slug: ev.slug },
      select: { id: true, status: true, draftRevisionId: true },
    });
    if (existing) {
      counts.events.skipped += 1;
      // Resume a partial run: finish a draft left un-published by an interrupted
      // run (createDraft committed, publish never ran → status='draft'). Restrict
      // to a never-archived 'draft' so a deliberately ARCHIVED event is never
      // auto-undone (an admin-unpublished draft is structurally indistinguishable
      // from an interrupted one — accepted, KNOWN_ISSUES; the importer is a
      // one-shot migration, not a continuous publisher).
      if (publish && existing.status === "draft" && !existing.archivedAt && existing.draftRevisionId) {
        await publishContent(existing.id, {}, actor);
      }
      continue;
    }

    const coverMediaId = await ensureMedia(ev.image);
    const { item } = await createDraft(
      {
        contentType: "event",
        academicYearId,
        slug: ev.slug,
        title: ev.title,
        payload: {
          body: ev.body,
          eventDate: ev.eventDate,
          audience: ev.audience,
          publishFrom: ev.publishFrom,
          publishUntil: ev.publishUntil,
          coverMediaId,
        },
      },
      actor
    );
    if (publish) await publishContent(item.id, {}, actor);
    counts.events.created += 1;
  }

  return { academicYearId, publish, counts };
}
