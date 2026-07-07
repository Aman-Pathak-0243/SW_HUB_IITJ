import { NextResponse } from "next/server";
import { createAccountRequest } from "../../../../lib/notifications/service.mjs";
import { assertFeatureEnabled, MEMBER_PLATFORM_FLAG } from "../../../../lib/platform/flags.mjs";
import { assertSameOrigin, assertWithinRateLimit, accountRequestLimiter, rateLimitKey, clientIp } from "../../../../lib/http/guard.mjs";
import { mapDbError } from "../../../../lib/cms/errors.mjs";

// Public "Request an account" endpoint (M0). Creates a centralized notification for
// the admin/dev Password Management tabs. Only active when the member-platform
// plugin is ON (else a 404). CSRF-checked + rate-limited; anonymous.
//   POST /api/account/request   body: { email, name?, message? }
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    assertSameOrigin(req);
    await assertFeatureEnabled(MEMBER_PLATFORM_FLAG); // 404 when the plugin is off
    assertWithinRateLimit(accountRequestLimiter, rateLimitKey("account.request", { ip: clientIp(req) }));
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
    const { notification } = await createAccountRequest({
      email: body?.email,
      name: body?.name,
      message: body?.message,
    });
    // Return the reference id so the requester can quote it; never reveal account state.
    return NextResponse.json({ ok: true, referenceId: notification.referenceId });
  } catch (e) {
    const mapped = e?.status && e?.code ? e : mapDbError(e);
    if (mapped?.status >= 500) console.error("[POST /api/account/request] failed:", e?.message ?? e);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status ?? 500 });
  }
}
