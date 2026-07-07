import { NextResponse } from "next/server";
import { assertFeatureEnabled } from "../../../../../lib/platform/flags.mjs";
import { requireMember } from "../../../../../lib/auth/session.mjs";
import { getRegistrationCounts } from "../../../../../lib/events/registration.mjs";
import { loadEventOrThrow } from "../../../../../lib/events/authz.mjs";
import { sseResponse } from "../../../../../lib/realtime/sse.mjs";
import { channels } from "../../../../../lib/realtime/broadcast.mjs";
import { assertWithinRateLimit, liveStreamLimiter, rateLimitKey, clientIp } from "../../../../../lib/http/guard.mjs";

// Session 16 — LIVE registration leaderboard (DL-108), the cheap first step on the SSE
// transport. A signed-in member subscribes to an event's registration counts; every
// register/cancel (already DB-concurrency-safe) publishes the fresh PII-free counts.
// GET-only (a stream); no CSRF (it changes no state). Node runtime for the long-lived
// connection (systemRequirements §7/§8). Plugin-gated + requireMember + a connection cap.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req, { params }) {
  try {
    await assertFeatureEnabled("member_platform");
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status ?? 404 });
  }
  let member;
  try {
    member = await requireMember();
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code ?? "UNAUTHENTICATED" }, { status: e.status ?? 401 });
  }
  try {
    assertWithinRateLimit(liveStreamLimiter, rateLimitKey("live.registration", { userId: member.id, ip: clientIp(req) }));
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: { "Retry-After": String(e.retryAfterSeconds ?? 60) } });
  }

  const { eventItemId } = await params;
  try {
    await loadEventOrThrow(eventItemId); // 404 on a non-event / missing id
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code ?? "NOT_FOUND" }, { status: e.status ?? 404 });
  }

  return sseResponse({
    channels: channels.registration(eventItemId),
    signal: req.signal,
    onOpen: async () => {
      const counts = await getRegistrationCounts(eventItemId);
      return { type: "counts", ...counts };
    },
  });
}
