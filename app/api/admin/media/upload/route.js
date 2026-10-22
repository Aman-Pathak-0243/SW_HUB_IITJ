import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/auth/session.mjs";
import { withAuditContext } from "../../../../../lib/cms/audit-context.mjs";
import { uploadImageAsset, shapeAsset, UPLOAD_MAX_BYTES } from "../../../../../lib/media/service.mjs";
import { assertSameOrigin, assertWithinRateLimit, makeRateLimiter, rateLimitKey, clientIp } from "../../../../../lib/http/guard.mjs";
import { mapDbError } from "../../../../../lib/cms/errors.mjs";

// Admin image picker — UPLOAD a new image to Cloudinary (Session 15).
//
//   POST /api/admin/media/upload   (multipart/form-data: file, altText?)
//     → { ok, asset: { id, deliveryUrl, ... } }
//
// WHY a route of its own. Every other admin write posts JSON to the single
// /api/admin/action dispatcher; a file cannot ride in that body, so this is the
// one multipart endpoint. It carries the SAME boundary guards in the same order
// (same-origin → authenticate → rate limit) and delegates to the service, which
// authorizes media.upload and writes one audited media_asset row. No new business
// logic lives here.
//
// Its own, tighter rate limiter: an upload costs a Cloudinary credit and a network
// round trip, so it is not pooled with the 60/min of cheap admin actions.
export const dynamic = "force-dynamic";

const uploadLimiter = makeRateLimiter({ limit: 12, windowMs: 60_000 });

export async function POST(req) {
  try {
    assertSameOrigin(req);
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  }

  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status ?? 401 });
  }

  const ipAddress = clientIp(req);
  try {
    assertWithinRateLimit(uploadLimiter, rateLimitKey("admin.media.upload", { userId: user.id, ip: ipAddress }));
  } catch (e) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: e.status, headers: { "Retry-After": String(e.retryAfterSeconds ?? 60) } }
    );
  }

  // Reject an oversized body from the Content-Length header BEFORE buffering it,
  // so a 100MB post is refused rather than read into memory. The service re-checks
  // the real byte length, because the header is client-supplied and may lie.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared && declared > UPLOAD_MAX_BYTES * 1.1) {
    return NextResponse.json(
      { error: `That file is too large — the limit is ${UPLOAD_MAX_BYTES / 1024 / 1024}MB.`, code: "PAYLOAD_TOO_LARGE" },
      { status: 413 }
    );
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "No 'file' part was included.", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const altTextRaw = form.get("altText");
    const result = await withAuditContext(
      { actorUserId: user.id, ipAddress, userAgent: req.headers.get("user-agent") ?? null },
      () =>
        uploadImageAsset(
          {
            bytes,
            filename: file.name || "upload",
            mimeType: file.type || null,
            altText: typeof altTextRaw === "string" && altTextRaw.trim() ? altTextRaw.trim() : null,
          },
          { userId: user.id }
        )
    );
    return NextResponse.json({ ok: true, asset: shapeAsset(result.asset) });
  } catch (e) {
    const mapped = e?.status && e?.code ? e : mapDbError(e);
    if (mapped?.status >= 500) console.error("[POST /api/admin/media/upload] failed:", e?.message ?? e);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status ?? 500 });
  }
}
