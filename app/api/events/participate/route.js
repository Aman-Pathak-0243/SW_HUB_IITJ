import { NextResponse } from "next/server";
import { assertFeatureEnabled } from "../../../../lib/platform/flags.mjs";
import { requireMember } from "../../../../lib/auth/session.mjs";
import { registerForEvent, cancelRegistration } from "../../../../lib/events/registration.mjs";
import { mapDbError } from "../../../../lib/cms/errors.mjs";
import { assertSameOrigin, assertWithinRateLimit, eventsWriteLimiter, rateLimitKey, clientIp } from "../../../../lib/http/guard.mjs";

// M5 — MEMBER self-service event participation (LOGIN-ONLY, DL-086). A signed-in member
// registers for / cancels an event. Gated: the member_platform plugin (fail-closed 404
// when off), a same-origin (CSRF) check, and a per-account rate limit — then requireMember
// (admits active+inactive; rejects revoked / view-disabled) hands the service the member,
// whose assertCanParticipate() blocks an INACTIVE account with a 403 PARTICIPATION_DISABLED.
// Management (rounds/scores/attendance/organizers) is the /api/admin/action registry.
export const dynamic = "force-dynamic";

export async function POST(req) {
  // 0) Plugin gate — the whole playground is invisible when the flag is off (404).
  try {
    await assertFeatureEnabled("member_platform");
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status ?? 404 });
  }
  // 1) CSRF defense-in-depth.
  try {
    assertSameOrigin(req);
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
  }
  // 2) Authenticate as a MEMBER (live status + allow-normal-view re-check).
  let member;
  try {
    member = await requireMember();
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code ?? "UNAUTHENTICATED" }, { status: e.status ?? 401 });
  }
  // 3) Rate limit per account.
  try {
    assertWithinRateLimit(eventsWriteLimiter, rateLimitKey("events.participate", { userId: member.id, ip: clientIp(req) }));
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: { "Retry-After": String(e.retryAfterSeconds ?? 60) } });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? "register");
  const eventItemId = body.eventItemId;
  const actor = { userId: member.id };
  try {
    if (action === "cancel") {
      const res = await cancelRegistration({ eventItemId }, member, actor);
      return NextResponse.json({ ok: true, ...res });
    }
    if (action === "register") {
      const res = await registerForEvent({ eventItemId, teamName: body.teamName, note: body.note }, member, actor);
      return NextResponse.json({ ok: true, ...res });
    }
    return NextResponse.json({ error: `Unknown action '${action}'.`, code: "UNKNOWN_ACTION" }, { status: 400 });
  } catch (e) {
    if (e?.status && e?.code) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    const mapped = mapDbError(e);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status ?? 500 });
  }
}
