import { NextResponse } from "next/server";
import { recordPageVisit } from "../../../lib/devconsole/usage.mjs";
import { isMemberPlatformEnabled } from "../../../lib/platform/flags.mjs";
import { assertSameOrigin, assertWithinRateLimit, usageBeaconLimiter, rateLimitKey, clientIp } from "../../../lib/http/guard.mjs";
import { getServerAuthSession } from "../../../lib/auth/session.mjs";

// Hidden usage-analytics beacon (M8, DL-071). A best-effort page-visit recorder for
// the developer dashboard. Same-origin + rate-limited; only records while the
// member-platform plugin is ON. NEVER throws / never blocks — returns 204 regardless
// (analytics must not affect the page). An authenticated visit links the user id.
//   POST /api/usage   body: { path, section? }
export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    assertSameOrigin(req);
    assertWithinRateLimit(usageBeaconLimiter, rateLimitKey("usage.beacon", { ip: clientIp(req) }));
  } catch {
    // A cross-origin or rate-limited beacon is silently ignored (no error surface).
    return new NextResponse(null, { status: 204 });
  }
  try {
    if (!(await isMemberPlatformEnabled())) return new NextResponse(null, { status: 204 });
    const body = await req.json().catch(() => ({}));
    let userId = null;
    try {
      const session = await getServerAuthSession();
      userId = session?.user?.id ?? null;
    } catch {
      userId = null;
    }
    await recordPageVisit({ path: body?.path, section: body?.section, userId });
  } catch {
    /* swallow — analytics is best-effort */
  }
  return new NextResponse(null, { status: 204 });
}
