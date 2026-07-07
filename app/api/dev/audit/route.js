import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/auth/session.mjs";
import { listAuditLog, getAuditStats } from "../../../../lib/devconsole/audit.mjs";

// Developer Console — audit-log VIEWER (Session 8). READ-ONLY over `audit_log`
// (populated centrally by DL-028; no writer added here). Gated at the boundary with
// requirePermission('audit.read') — the SAME dedicated key the reader re-asserts, so
// the boundary and service authorize identically (the audit log carries PII, so it
// is NOT opened to a broad dev.console grant).
//
//   GET /api/dev/audit?actorUserId=&entityType=&entityId=&action=&academicYearId=
//                      &from=&to=&search=&take=&cursor=    → newest-first page
//   GET /api/dev/audit?...&stats=1                         → counts by action/entity
//
// A bad ?action= / ?cursor= surfaces as a friendly 422 (CmsValidationError).
export const dynamic = "force-dynamic";

function readFilters(searchParams) {
  const g = (k) => searchParams.get(k) ?? undefined;
  return {
    actorUserId: g("actorUserId"),
    entityType: g("entityType"),
    entityId: g("entityId"),
    action: g("action"),
    academicYearId: g("academicYearId"),
    from: g("from"),
    to: g("to"),
    search: g("search"),
    take: g("take"),
    cursor: g("cursor"),
  };
}

export async function GET(req) {
  try {
    const { user } = await requirePermission("audit.read");
    const actor = { userId: user.id };
    const { searchParams } = new URL(req.url);
    const filters = readFilters(searchParams);

    if (searchParams.get("stats") === "1") {
      const stats = await getAuditStats(filters, actor);
      return NextResponse.json({ stats });
    }
    const result = await listAuditLog(filters, actor);
    return NextResponse.json(result);
  } catch (e) {
    if (e?.status && e?.code) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    console.error("[GET /api/dev/audit] failed:", e?.message ?? e);
    return NextResponse.json({ error: "Audit log is temporarily unavailable." }, { status: 500 });
  }
}
