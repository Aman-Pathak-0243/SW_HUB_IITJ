import "./admin.css";
import { loadAdminContext } from "../../lib/admin/server.mjs";
import { resolveCurrentYear } from "../../lib/year/context.mjs";
import AdminShell from "./_components/AdminShell";
import { SignInGate, AccessDenied } from "./_components/SignInGate";

// The Admin Panel layout (Session 9) — the authentication + admin-access boundary
// for every /admin/* page. Loads the viewer's context server-side (never throws),
// renders the sign-in / no-access state when appropriate, otherwise the shell with
// a permission-filtered nav. Each module page additionally checks its own module
// access (lib/admin/server.mjs#loadModuleContext) and gates its mutations at the
// /api/admin/action route — this is the outer guard, not the only one.
export const dynamic = "force-dynamic";

export const metadata = { title: "Admin · Student Affairs IIT Jammu" };

export default async function AdminLayout({ children }) {
  const ctx = await loadAdminContext();

  if (ctx.state === "unauthenticated") return <SignInGate />;
  if (ctx.state === "inactive") return <AccessDenied email={ctx.user?.email} reason="inactive" />;
  if (ctx.state === "no-access") return <AccessDenied email={ctx.user?.email} reason="no-access" />;

  // Best-effort current-year chip (a misconfigured deployment with no current year
  // is shown as a warning, never crashes the shell).
  let currentYearLabel = null;
  try {
    currentYearLabel = (await resolveCurrentYear())?.label ?? null;
  } catch {
    currentYearLabel = null;
  }

  return (
    <div className="adm-root">
      <AdminShell nav={ctx.nav} user={ctx.user} currentYearLabel={currentYearLabel}>
        {children}
      </AdminShell>
    </div>
  );
}
