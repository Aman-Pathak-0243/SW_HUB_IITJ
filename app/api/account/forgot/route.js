import { NextResponse } from "next/server";
import { createPasswordResetRequest } from "../../../../lib/notifications/service.mjs";
import { assertFeatureEnabled, MEMBER_PLATFORM_FLAG } from "../../../../lib/platform/flags.mjs";
import { assertSameOrigin, assertWithinRateLimit, accountRequestLimiter, rateLimitKey, clientIp } from "../../../../lib/http/guard.mjs";
import { CmsValidationError, mapDbError } from "../../../../lib/cms/errors.mjs";

// Public "Forgot password" endpoint (M0). Creates a password-reset notification in
// the admin & developer Password Management tabs (admin-mediated reset, DL-058 — no
// self-serve email link). Active only when the member-platform plugin is ON.
//
// Account-existence is NOT leaked: a well-formed email always returns a generic
// success regardless of whether an account exists (the queue row records the match
// for the fulfilling stakeholder). A malformed email is a 422 (format, not existence).
//   POST /api/account/forgot   body: { email }
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    assertSameOrigin(req);
    await assertFeatureEnabled(MEMBER_PLATFORM_FLAG);
    assertWithinRateLimit(accountRequestLimiter, rateLimitKey("account.forgot", { ip: clientIp(req) }));
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status ?? 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "BAD_REQUEST" }, { status: 400 });
  }

  try {
    await createPasswordResetRequest({ email: body?.email });
  } catch (e) {
    // Surface only a format-validation error; everything else degrades to the same
    // generic success so existence/internal state never leaks.
    if (e instanceof CmsValidationError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    const mapped = mapDbError(e);
    if (mapped?.status >= 500) console.error("[POST /api/account/forgot] failed:", e?.message ?? e);
  }
  return NextResponse.json({
    ok: true,
    message: "If an account exists for that email, a reset request has been sent to the portal team.",
  });
}
