import { NextResponse } from "next/server";
import { requirePermission } from "../../../../lib/auth/session.mjs";
import { getSystemStatus } from "../../../../lib/devconsole/status.mjs";
import { getDevConsoleReports } from "../../../../lib/devconsole/reports.mjs";

// Developer Console — system status + testing/cost reports (Session 8). READ-ONLY.
// Gated at the boundary with requirePermission('dev.console') (authentication +
// live RBAC; developer/grants_all short-circuits); the readers re-assert the same
// gate (defense-in-depth). The rich console UI is the Session-9 admin panel — this
// route is the backend it (and operators) read.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user } = await requirePermission("dev.console");
    const actor = { userId: user.id };
    // Settle independently: getSystemStatus is deliberately resilient (a cold Neon
    // is reported as a STATE, not thrown), so an unexpected rejection in reports
    // must not discard the health payload (Session-8 review). Auth already passed,
    // so neither call rejects with a 401/403 here.
    const [statusR, reportsR] = await Promise.allSettled([getSystemStatus(actor), getDevConsoleReports(actor)]);
    return NextResponse.json({
      status: statusR.status === "fulfilled" ? statusR.value : { error: statusR.reason?.message ?? "Status check failed." },
      reports: reportsR.status === "fulfilled" ? reportsR.value : { error: reportsR.reason?.message ?? "Reports unavailable." },
    });
  } catch (e) {
    if (e?.status && e?.code) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
    }
    console.error("[GET /api/dev/status] failed:", e?.message ?? e);
    return NextResponse.json({ error: "Developer console status is unavailable." }, { status: 500 });
  }
}
