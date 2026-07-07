import { NextResponse } from "next/server";
import { assertFeatureEnabled } from "../../../../lib/platform/flags.mjs";
import { requireUser } from "../../../../lib/auth/session.mjs";
import { exportEventCsv } from "../../../../lib/events/downloads.mjs";
import { mapDbError } from "../../../../lib/cms/errors.mjs";

// M5 — event CSV DOWNLOADS (DL-087) for organizers / admin / staff / developer:
// participants / scores / attendance / ranking, round-wise + overall. GATED: the plugin
// flag (404 when off) + requireUser (authenticated, active) + the service's
// assertEventManage seam (a coordinator of an organizing club, or staff/admin) — a member
// with no event.manage gets 403. GET so the browser downloads the file directly.
//   GET /api/events/export?eventItemId=&kind=participants|scores|attendance|ranking&roundId=
export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    await assertFeatureEnabled("member_platform");
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: e.status ?? 404 });
  }
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    return NextResponse.json({ error: e.message, code: e.code ?? "UNAUTHENTICATED" }, { status: e.status ?? 401 });
  }
  const { searchParams } = new URL(req.url);
  const eventItemId = searchParams.get("eventItemId");
  const kind = searchParams.get("kind") ?? "participants";
  const roundParam = searchParams.get("roundId");
  // roundId: absent/blank = all rounds; "overall" = the overall (round_id NULL) rows;
  // else a uuid. A blank or malformed value used to reach the DB as an invalid uuid and
  // 500 (consolidation review B7) — validate it here and return a friendly 422 instead.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let roundId;
  if (roundParam == null || roundParam.trim() === "") roundId = undefined;
  else if (roundParam === "overall") roundId = null;
  else if (UUID_RE.test(roundParam)) roundId = roundParam;
  else return NextResponse.json({ error: "Invalid roundId.", code: "BAD_ROUND_ID" }, { status: 422 });

  try {
    const { filename, contentType, content } = await exportEventCsv(eventItemId, kind, { userId: user.id }, { roundId });
    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": `${contentType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e?.status && e?.code) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    const mapped = mapDbError(e);
    return NextResponse.json({ error: mapped.message, code: mapped.code }, { status: mapped.status ?? 500 });
  }
}
