import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/auth/session.mjs";
import { assertPermission } from "../../../../../lib/rbac/authorize.mjs";
import { searchStaticImages } from "../../../../../lib/media/static-index.mjs";
import { assertSameOrigin, assertWithinRateLimit, adminActionLimiter, rateLimitKey, clientIp } from "../../../../../lib/http/guard.mjs";
import { mapDbError } from "../../../../../lib/cms/errors.mjs";

// Admin image picker — SEARCH the images already shipped in public/ (Session 15).
//
//   GET /api/admin/media/static?q=nitin&limit=20
//     → { ok, results: [{ path, bytes }] }
//
// A READ-ONLY companion to the one admin mutation endpoint (/api/admin/action),
// which takes JSON and so cannot serve a debounced type-ahead cheaply. The index
// itself is cached in-process for 60s (lib/media/static-index.mjs), so a burst of
// keystrokes costs one directory walk, not one per request.
//
// Gated on media.read at GLOBAL scope: the result is the list of files already
// publicly served from public/, so this exposes nothing a visitor could not
// enumerate — but it is still an admin surface, so it authenticates like one.
export const dynamic = "force-dynamic";

export async function GET(req) {
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

  try {
    assertWithinRateLimit(adminActionLimiter, rateLimitKey("admin.media.static", { userId: user.id, ip: clientIp(req) }));
  } catch (e) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: e.status, headers: { "Retry-After": String(e.retryAfterSeconds ?? 60) } }
    );
  }

  try {
    await assertPermission(user.id, "media.read", {});
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? "";
    // Clamp the page size: the picker shows a short list, and an unbounded limit
    // would let one request serialize the whole index.
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 20, 1), 50);
    const results = await searchStaticImages(q, { limit });
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const mapped = e?.status && e?.code ? e : mapDbError(e);
    if (mapped?.status >= 500) console.error("[GET /api/admin/media/static] failed:", e?.message ?? e);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status ?? 500 });
  }
}
