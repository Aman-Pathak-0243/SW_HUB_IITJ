import { NextResponse } from "next/server";
import { isIP } from "node:net";
import { requireUser } from "../../../../lib/auth/session.mjs";
import { dispatchAdminAction } from "../../../../lib/admin/handlers.mjs";
import { mapDbError } from "../../../../lib/cms/errors.mjs";
import { assertSameOrigin, assertWithinRateLimit, adminActionLimiter, rateLimitKey } from "../../../../lib/http/guard.mjs";

// Admin Panel — the ONE mutation endpoint (Session 9). Every admin write posts
// `{ action, args }` here; the dispatcher (lib/admin/handlers.mjs) authorizes the
// action FIRST (an institute-wide permission at the boundary, or requireUser() +
// the service's own scope gate for content/org ops) and delegates to the EXISTING
// service inside an audit context, so each mutation writes one attributed audit row.
//
//   POST /api/admin/action   body: { "action": "user.create", "args": { ... } }
export const dynamic = "force-dynamic";

// Best-effort client IP for the audit row's inet column. x-forwarded-for may be a
// comma list; take the first token and only pass it if it is a STRUCTURALLY VALID
// IPv4/IPv6 address (net.isIP), so a malformed header can't make the inet insert
// fail and silently drop the audit row.
function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  const candidate = (xff ? xff.split(",")[0] : req.headers.get("x-real-ip") || "").trim();
  return candidate && isIP(candidate) !== 0 ? candidate : null;
}

export async function POST(req) {
  // CSRF defense-in-depth: reject a cross-origin browser POST before doing any
  // work (NextAuth's SameSite=Lax cookie is the first line; this is the second).
  try {
    assertSameOrigin(req);
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  }

  let user;
  try {
    user = await requireUser(); // authentication + live active-account check (401/403)
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status ?? 401 });
  }

  // Best-effort per-account rate limit (coarse abuse dampener; see lib/http/guard).
  try {
    assertWithinRateLimit(adminActionLimiter, rateLimitKey("admin.action", { userId: user.id, ip: clientIp(req) }));
  } catch (e) {
    return NextResponse.json(
      { error: e.message, code: e.code },
      { status: e.status, headers: { "Retry-After": String(e.retryAfterSeconds ?? 60) } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "BAD_REQUEST" }, { status: 400 });
  }

  const { action, args } = body ?? {};
  if (!action || typeof action !== "string") {
    return NextResponse.json({ error: "An 'action' is required.", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    const result = await dispatchAdminAction(action, args ?? {}, {
      user,
      ipAddress: clientIp(req),
      userAgent: req.headers.get("user-agent") ?? null,
    });
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    // Service errors are already HTTP-shaped CmsErrors / auth errors; map anything
    // else (a raw DB guard) into a friendly, consistent shape (DL-029).
    const mapped = e?.status && e?.code ? e : mapDbError(e);
    if (mapped?.status >= 500) console.error(`[POST /api/admin/action ${action}] failed:`, e?.message ?? e);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status ?? 500 });
  }
}
