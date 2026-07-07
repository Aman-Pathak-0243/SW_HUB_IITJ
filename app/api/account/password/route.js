import { NextResponse } from "next/server";
import { requireLoggedInAccount } from "../../../../lib/auth/session.mjs";
import { changeOwnPassword } from "../../../../lib/users/admin.mjs";
import { withAuditContext } from "../../../../lib/cms/audit-context.mjs";
import { assertFeatureEnabled, MEMBER_PLATFORM_FLAG } from "../../../../lib/platform/flags.mjs";
import { assertSameOrigin, assertWithinRateLimit, accountRequestLimiter, rateLimitKey, clientIp } from "../../../../lib/http/guard.mjs";
import { mapDbError } from "../../../../lib/cms/errors.mjs";

// Self-service password change (M0) — the forced first-login change target and a
// normal "change my password" path. Authenticated; the user changes their OWN
// credential (verifies the current password, enforces the policy on the new one,
// clears must_change_password). Active only when the member-platform plugin is ON.
//   POST /api/account/password   body: { currentPassword, newPassword }
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    assertSameOrigin(req);
    await assertFeatureEnabled(MEMBER_PLATFORM_FLAG);
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status ?? 400 });
  }

  let user;
  try {
    // Admit any LOGINABLE account (active OR inactive) — an inactive account is
    // force-redirected here by the must-change middleware and must be able to complete
    // its OWN forced change. The active-only requireUser() 403'd such accounts into a
    // permanent lockout (consolidation review B1); requireLoggedInAccount() still rejects
    // `revoked` and does not gate on the member-view toggle (a credential op, not a view).
    user = await requireLoggedInAccount();
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status ?? 401 });
  }

  try {
    assertWithinRateLimit(accountRequestLimiter, rateLimitKey("account.password", { userId: user.id, ip: clientIp(req) }));
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

  try {
    const result = await withAuditContext(
      { actorUserId: user.id, ipAddress: clientIp(req), userAgent: req.headers.get("user-agent") ?? null },
      () => changeOwnPassword(user.id, { currentPassword: body?.currentPassword, newPassword: body?.newPassword }, { userId: user.id })
    );
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    const mapped = e?.status && e?.code ? e : mapDbError(e);
    if (mapped?.status >= 500) console.error("[POST /api/account/password] failed:", e?.message ?? e);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status ?? 500 });
  }
}
