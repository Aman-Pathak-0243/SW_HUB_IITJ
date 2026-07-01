import Link from "next/link";
import { notFound } from "next/navigation";
import "../account/account.css";
import { SignInCard } from "../account/_components/AuthClient";
import { loadMemberContext } from "../../lib/member/server.mjs";
import { listUserMemberships } from "../../lib/memberships/service.mjs";

// The MEMBER (normal) view (M1, DL-065/066). Minimal by design — the rich member
// pages (club memberships, profile, achievements) are M3/M6. This surface confirms
// who the member is, their access mode, and routes them to the back-office surface
// they're entitled to (admin / developer) when applicable. Gated behind the
// member_platform plugin (404 when off) + the live status/allow-normal-view checks
// (loadMemberContext never throws — it returns a state to branch on).
export const dynamic = "force-dynamic";
export const metadata = { title: "Member · Student Affairs IIT Jammu" };

export default async function MemberPage() {
  const ctx = await loadMemberContext();

  if (ctx.state === "plugin-off") notFound();

  if (ctx.state === "unauthenticated") {
    return (
      <div className="acc-root">
        <SignInCard callbackUrl="/member" showRequestLinks />
      </div>
    );
  }

  if (ctx.state === "revoked") {
    return (
      <div className="acc-root">
        <div className="acc-card">
          <h1>Access revoked</h1>
          <p className="acc-disabled-note">
            Your account no longer has access to the member area. You can still browse the public
            site. If you believe this is a mistake, contact a portal administrator.
          </p>
          <div className="acc-links"><Link href="/">Back to the site</Link></div>
        </div>
      </div>
    );
  }

  if (ctx.state === "view-disabled") {
    return (
      <div className="acc-root">
        <div className="acc-card">
          <h1>Member view not enabled</h1>
          <p className="acc-disabled-note">
            The member view has not been enabled for your account yet. Please check back later, or
            contact a portal administrator.
          </p>
          <div className="acc-links"><Link href="/">Back to the site</Link></div>
        </div>
      </div>
    );
  }

  const { member, surface, hasAdminAccess, access } = ctx;
  const statusClass = access.canParticipate ? "good" : "warn";

  // "My clubs" (M3) — the member's club/society/chapter memberships, resolved to the
  // current-year club name. Best-effort: a read failure degrades to an empty section.
  let clubs = [];
  try {
    clubs = await listUserMemberships(member.id);
  } catch {
    clubs = [];
  }

  return (
    <div className="acc-root">
      <div className="acc-card mbr-card">
        <h1>Welcome{member.name ? `, ${member.name}` : ""}</h1>
        <p className="acc-sub">{member.email}</p>

        <div className="mbr-row">
          <span className="mbr-label">Access mode</span>
          <span className={`mbr-badge ${statusClass}`}>{member.status}</span>
        </div>
        <p className="mbr-note">
          {access.canParticipate
            ? "Your account is active — you can browse the portal, see your achievements, and participate in events."
            : "Your account is inactive — you can browse the portal and see your achievements, but you cannot participate in events right now."}
        </p>

        {/* My profile (M6) — the member's roles, events, achievements & contribution. */}
        <div className="mbr-surfaces">
          <span className="mbr-label">Your profile</span>
          <div className="acc-links"><Link href="/member/profile">View my profile &amp; performance →</Link></div>
        </div>

        {/* My clubs (M3) — memberships across clubs/societies/chapters. */}
        <div className="mbr-clubs">
          <span className="mbr-label">My clubs &amp; societies</span>
          {clubs.length ? (
            <ul>
              {clubs.map((c) => (
                <li key={c.id} className="mbr-club">
                  <span className="mbr-club-name">
                    {c.unit?.slug ? (
                      <Link href={`/org/${c.unit.typeKey ?? "clubs"}/${c.unit.slug}`}>{c.unit.name}</Link>
                    ) : (
                      c.unit?.name ?? "A club"
                    )}
                  </span>
                  <span className="mbr-club-meta">
                    {c.role ? `${c.role} · ` : ""}
                    {c.status === "active" ? "Member" : "Inactive"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mbr-empty">You are not listed as a member of any club yet. A club coordinator can add you.</p>
          )}
        </div>

        {/* Surface routing (DL-066): show the back-office entry the member is entitled to. */}
        {(surface === "developer" || surface === "admin" || hasAdminAccess) && (
          <div className="mbr-surfaces">
            <span className="mbr-label">Your dashboards</span>
            <div className="acc-links">
              <Link href="/admin">{surface === "developer" ? "Developer & admin dashboard" : "Admin dashboard"}</Link>
            </div>
          </div>
        )}

        <div className="acc-links mbr-foot"><Link href="/">Back to the site</Link></div>
      </div>
    </div>
  );
}
