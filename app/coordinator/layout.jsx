import "../admin/admin.css";
import "./coordinator.css";
import Link from "next/link";
import { loadCoordinatorContext } from "../../lib/coordinator/server.mjs";
import { SignInCard } from "../account/_components/AuthClient";
import CoordinatorShell from "./_components/CoordinatorShell";

// The /coordinator surface layout (Session 13, DL-096) — the authentication + scoped-
// access boundary for a club/council coordinator who is NOT a global admin. It is a
// STANDALONE surface (not nested under the global /admin gate, which resolves permissions
// globally and would 'no-access' a purely-scoped grant — KNOWN_ISSUES #43). Never throws:
// loadCoordinatorContext returns a state to branch on. Management still re-authorizes at
// the true scope inside every service via assertEventManage / assertActorPermission.
export const dynamic = "force-dynamic";
export const metadata = { title: "Coordinator · Student Affairs IIT Jammu" };

// Server-safe denied notice (no hooks) — sign-out is a client action, so we just link
// the coordinator back to the member surface / public site.
function CoordinatorNotice({ reason, email }) {
  return (
    <div className="adm-root">
      <div className="adm-denied">
        <div className="adm-denied-card">
          <div style={{ fontSize: "2.2rem", marginBottom: 10 }}>{reason === "inactive" ? "⛔" : "🔑"}</div>
          <h1>{reason === "inactive" ? "Account not active" : "No coordinator access"}</h1>
          <p>
            {reason === "inactive"
              ? "Your account is not active, so you can't manage a unit right now. Contact a portal administrator."
              : "You don't coordinate any club or council yet. A portal administrator can grant you a coordinator (or secretary) role scoped to your unit."}
          </p>
          {email && <p style={{ color: "var(--adm-faint)", fontSize: "0.78rem" }}>{email}</p>}
          <p style={{ marginTop: 12, fontSize: "0.85rem" }}>
            <Link href="/member">Go to the member area</Link> · <Link href="/">Back to the site</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default async function CoordinatorLayout({ children }) {
  const ctx = await loadCoordinatorContext();

  if (ctx.state === "unauthenticated") {
    return (
      <div className="acc-root">
        <SignInCard callbackUrl="/coordinator" showRequestLinks />
      </div>
    );
  }
  if (ctx.state === "inactive") return <CoordinatorNotice reason="inactive" email={ctx.user?.email} />;
  if (ctx.state === "no-access") return <CoordinatorNotice reason="no-access" email={ctx.user?.email} />;

  const anyEvents = ctx.clubs.some((c) => c.permissions.events);
  const anyMembers = ctx.clubs.some((c) => c.permissions.members);
  const nav = [
    { key: "dashboard", href: "/coordinator", icon: "home", label: "My units" },
    ...(anyEvents ? [{ key: "events", href: "/coordinator/events", icon: "calendar", label: "Events" }] : []),
    ...(anyMembers ? [{ key: "members", href: "/coordinator/members", icon: "users", label: "Members" }] : []),
    { key: "contribution", href: "/coordinator/contribution", icon: "gauge", label: "Contribution" },
  ];

  return (
    <div className="adm-root">
      <CoordinatorShell nav={nav} user={ctx.user}>
        {children}
      </CoordinatorShell>
    </div>
  );
}
