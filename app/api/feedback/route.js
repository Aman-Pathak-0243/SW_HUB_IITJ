import { NextResponse } from "next/server";
import { createFeedback } from "../../../lib/feedback/service.mjs";
import { assertFeatureEnabled, MEMBER_PLATFORM_FLAG } from "../../../lib/platform/flags.mjs";
import { assertSameOrigin, assertWithinRateLimit, feedbackLimiter, rateLimitKey, clientIp } from "../../../lib/http/guard.mjs";
import { getServerAuthSession } from "../../../lib/auth/session.mjs";
import { mapDbError } from "../../../lib/cms/errors.mjs";

// Public feedback / support-ticket endpoint (M7, DL-070). Creates a standalone
// ticket with a unique reference id. Only active when the member-platform plugin is
// ON (else 404). CSRF-checked + rate-limited. An authenticated submitter is LINKED
// by session id (server-side); the body's user fields are never trusted.
//   POST /api/feedback   body: { category, subject, body, component?, email? }
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    assertSameOrigin(req);
    await assertFeatureEnabled(MEMBER_PLATFORM_FLAG); // 404 when the plugin is off
    assertWithinRateLimit(feedbackLimiter, rateLimitKey("feedback.create", { ip: clientIp(req) }));
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status ?? 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "BAD_REQUEST" }, { status: 400 });
  }

  // Link an authenticated submitter (optional) — derived from the session, never the body.
  let submitterUserId = null;
  try {
    const session = await getServerAuthSession();
    submitterUserId = session?.user?.id ?? null;
  } catch {
    submitterUserId = null;
  }

  try {
    const { feedback } = await createFeedback(
      { category: body?.category, subject: body?.subject, body: body?.body, component: body?.component, email: body?.email },
      { submitterUserId }
    );
    return NextResponse.json({ ok: true, referenceId: feedback.referenceId });
  } catch (e) {
    const mapped = e?.status && e?.code ? e : mapDbError(e);
    if (mapped?.status >= 500) console.error("[POST /api/feedback] failed:", e?.message ?? e);
    return NextResponse.json({ error: mapped.message, code: mapped.code, details: e?.details }, { status: mapped.status ?? 500 });
  }
}
