import { NextResponse } from "next/server";
import { assertFeatureEnabled } from "../../../../../lib/platform/flags.mjs";
import { requireMember } from "../../../../../lib/auth/session.mjs";
import { submitAnswer } from "../../../../../lib/quiz/answers.mjs";
import { mapDbError } from "../../../../../lib/cms/errors.mjs";
import { assertSameOrigin, assertWithinRateLimit, liveAnswerLimiter, rateLimitKey, clientIp } from "../../../../../lib/http/guard.mjs";

// Session 16 — LIVE quiz ANSWER submission (DL-104/106). LOGIN-ONLY member self-service,
// like event participation: plugin gate (404 when off) → same-origin CSRF → requireMember
// → per-account rate limit → submitAnswer, which enforces the M1 active-only
// assertCanParticipate seam AND the SERVER-authoritative time window. The response never
// carries correctness/points (anti-cheat) — the player learns the result at reveal via SSE.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req) {
  try {
    await assertFeatureEnabled("member_platform");
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status ?? 404 });
  }
  try {
    assertSameOrigin(req);
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  }
  let member;
  try {
    member = await requireMember();
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code ?? "UNAUTHENTICATED" }, { status: e.status ?? 401 });
  }
  try {
    assertWithinRateLimit(liveAnswerLimiter, rateLimitKey("live.answer", { userId: member.id, ip: clientIp(req) }));
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: { "Retry-After": String(e.retryAfterSeconds ?? 60) } });
  }

  const body = await req.json().catch(() => ({}));
  const actor = { userId: member.id };
  try {
    const res = await submitAnswer(
      { sessionId: body.sessionId, questionId: body.questionId, selectedOptionIds: body.selectedOptionIds ?? body.selected },
      member,
      actor
    );
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    if (e?.status && e?.code) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    const mapped = mapDbError(e);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status ?? 500 });
  }
}
