import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/auth/session.mjs";
import { assertPermission } from "../../../lib/rbac/authorize.mjs";
import { prismaBase } from "../../../lib/prisma.mjs";
import { listPublicEvents, AUDIENCE_TYPES } from "../../../lib/events/public.mjs";
import { createDraft, publish as publishContent } from "../../../lib/cms/content.mjs";
import { requireCurrentYear } from "../../../lib/year/context.mjs";
import { classifyMedia, slugify } from "../../../lib/org/normalize.mjs";
import { mapDbError } from "../../../lib/cms/errors.mjs";
import { isIP } from "node:net";
import { assertSameOrigin, assertWithinRateLimit, eventsWriteLimiter, rateLimitKey } from "../../../lib/http/guard.mjs";

function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  const candidate = (xff ? xff.split(",")[0] : req.headers.get("x-real-ip") || "").trim();
  return candidate && isIP(candidate) !== 0 ? candidate : null;
}

// V2 events API — fully CMS-backed on PostgreSQL/Prisma (Session 6), REPLACING
// the V1 Mongo/Mongoose write path (DATA_MIGRATION_REPORT: Mongoose retired;
// closes KNOWN_ISSUES #2 auth, #5 base64 images, #9 validation, #16 edit/delete).
// It is a thin CALLER of the Session-3 CMS service, not a new mutation pipeline.
//
//   GET  — public: published, current-year, in-window, public-audience events
//          (Postgres). Returns a self-describing { events } object (the V1
//          bare-array shape caused the /past-events contract bug #3); the V2 pages
//          read the DB layer directly.
//   POST — authenticated + authorized (content.create, scoped to the current year)
//          → creates (and, unless {publish:false}, publishes) an `event`
//          content_item via the CMS service. Inline base64 images are REJECTED (#5)
//          — upload via the Media tool (Session 7) and pass a URL. Rich event
//          editing/deletion is the Session-9 admin panel (same CMS service:
//          editDraft / unpublish / archive / restore).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const events = await listPublicEvents();
    return NextResponse.json({ events });
  } catch (e) {
    console.error("[GET /api/events] failed:", e?.message ?? e);
    return NextResponse.json({ error: "Events are temporarily unavailable." }, { status: 500 });
  }
}

export async function POST(req) {
  // 0) CSRF defense-in-depth: reject a cross-origin browser POST up front.
  try {
    assertSameOrigin(req);
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  }

  // 1) Authenticate (live account-status re-check; 401/403).
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code ?? "UNAUTHENTICATED" }, { status: e.status ?? 401 });
  }

  // Best-effort rate limit on the write path (per account, else per IP).
  try {
    assertWithinRateLimit(eventsWriteLimiter, rateLimitKey("events.write", { userId: user.id, ip: clientIp(req) }));
  } catch (e) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: e.status, headers: { "Retry-After": String(e.retryAfterSeconds ?? 60) } }
    );
  }

  // 2) Validate caller input BEFORE any write (friendly 422; no DB round-trip).
  const data = await req.json().catch(() => ({}));
  const title = String(data.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "A title is required.", code: "CMS_VALIDATION" }, { status: 422 });
  }
  if (data.audience && !AUDIENCE_TYPES.includes(data.audience)) {
    return NextResponse.json(
      { error: `Unknown audience '${data.audience}'. Allowed: ${AUDIENCE_TYPES.join(", ")}.`, code: "CMS_VALIDATION" },
      { status: 422 }
    );
  }
  // Reject inline base64 images regardless of whether a coverMediaId is also given
  // (KNOWN_ISSUES #5) — never silently accept a data: URL.
  const imageRef = data.coverUrl ?? data.image ?? null;
  if (imageRef && classifyMedia(imageRef)?.isBase64) {
    return NextResponse.json(
      {
        error: "Inline (base64) image uploads are no longer accepted. Upload the image with the Media tool and pass its URL.",
        code: "UNSUPPORTED_IMAGE",
      },
      { status: 422 }
    );
  }

  // 3) Authorize (scoped to the current year) then create — cleaning up an orphaned
  //    cover media_asset if the CMS write fails afterwards (#2/#10).
  let createdMediaId = null;
  try {
    const year = await requireCurrentYear();
    await assertPermission(user.id, "content.create", { academicYearId: year.id });

    let coverMediaId = data.coverMediaId ?? null;
    if (!coverMediaId && imageRef) {
      const classified = classifyMedia(imageRef);
      if (classified) {
        // Inventory row only (no inline blob); written on the audit-bypassing base
        // client, consistent with the importer (avoids a misattributed audit row).
        const asset = await prismaBase.mediaAsset.create({
          data: {
            storageProvider: classified.storageProvider,
            url: classified.url,
            originalPath: classified.originalPath,
            kind: classified.kind,
            uploadedById: user.id,
          },
        });
        coverMediaId = asset.id;
        createdMediaId = asset.id;
      }
    }

    const actor = { userId: user.id };
    const rawEventDate = data.eventDate ?? data.date ?? null;
    const payload = {
      body: data.body ?? data.description ?? null,
      eventDate: rawEventDate ? new Date(rawEventDate) : null,
      location: data.location ?? null,
      publishFrom: data.publishFrom ? new Date(data.publishFrom) : null,
      publishUntil: data.publishUntil ? new Date(data.publishUntil) : null,
      coverMediaId,
    };
    if (data.audience) payload.audience = data.audience;

    const { item } = await createDraft(
      { contentType: "event", academicYearId: year.id, slug: slugify(data.slug ?? title), title, summary: data.summary ?? null, payload },
      actor
    );

    const doPublish = data.publish !== false;
    if (doPublish) await publishContent(item.id, {}, actor);

    return NextResponse.json({ id: item.id, slug: item.slug, status: doPublish ? "published" : "draft" }, { status: 201 });
  } catch (e) {
    // Don't strand a cover media_asset created just before a failed CMS write.
    if (createdMediaId) {
      await prismaBase.mediaAsset.delete({ where: { id: createdMediaId } }).catch(() => {});
    }
    // Auth / validation / already-mapped CMS errors carry status + code; raw DB
    // errors go through mapDbError for a friendly shape.
    if (e?.status && e?.code) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    const mapped = mapDbError(e);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status ?? 500 });
  }
}
