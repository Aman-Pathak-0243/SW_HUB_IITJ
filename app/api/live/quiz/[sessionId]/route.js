import { NextResponse } from "next/server";
import { assertFeatureEnabled } from "../../../../../lib/platform/flags.mjs";
import { requireMember } from "../../../../../lib/auth/session.mjs";
import { getSessionState, joinSession } from "../../../../../lib/quiz/sessions.mjs";
import { sseResponse } from "../../../../../lib/realtime/sse.mjs";
import { channels } from "../../../../../lib/realtime/broadcast.mjs";
import { assertWithinRateLimit, liveStreamLimiter, rateLimitKey, clientIp } from "../../../../../lib/http/guard.mjs";

// Session 16 — LIVE quiz stream (DL-104..107). A signed-in member subscribes to a quiz
// session's channel: the opening snapshot is the authoritative state (status / current
// question WITHOUT correct answers while active / leaderboard on reveal+ended / the
// viewer's own answer), and subsequent host transitions + answer-progress ticks stream
// in. Connecting records the member in the lobby (joinSession). GET-only stream (no CSRF);
// Node runtime for the long-lived connection. Plugin-gated + requireMember + connection cap.
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
    assertWithinRateLimit(liveStreamLimiter, rateLimitKey("live.quiz", { userId: member.id, ip: clientIp(req) }));
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: { "Retry-After": String(e.retryAfterSeconds ?? 60) } });
  }

  const { sessionId } = await params;
  const snapshot = await getSessionState(sessionId, { userId: member.id, forHost: false });
  if (!snapshot) {
    return NextResponse.json({ error: "Quiz session not found.", code: "NOT_FOUND" }, { status: 404 });
  }
  // Record the member in the lobby (best-effort; publishes the updated player count).
  joinSession(sessionId, member.id).catch(() => {});

  return sseResponse({
    channels: channels.quiz(sessionId),
    signal: req.signal,
    // Re-read per-viewer so the snapshot carries THIS member's own answer/score.
    onOpen: async () => getSessionState(sessionId, { userId: member.id, forHost: false }),
  });
}
