import Link from "next/link";
import { loadCoordinatorContext } from "../../lib/coordinator/server.mjs";
import { PageHead, SBadge } from "../admin/_components/parts";

// Coordinator landing (Session 13, DL-096) — "My units": the clubs/councils the signed-in
// coordinator manages (scoped event.manage / membership.manage), each with quick links to
// the scoped tools. The layout already gated to 'ok', so ctx.clubs is non-empty here.
export const dynamic = "force-dynamic";

export default async function CoordinatorHome() {
  const ctx = await loadCoordinatorContext();
  if (ctx.state !== "ok") return null; // the layout renders the denied/sign-in state

  return (
    <>
      <PageHead
        eyebrow="Scoped coordinator"
        title="My units"
        subtitle="Manage the clubs and councils you coordinate — their events and members. Central actions (organizer tagging, closure review) stay with staff/admin."
      />
      <div className="coord-banner">
        You’re seeing this surface because you hold a <strong>coordinator</strong> or <strong>secretary</strong> role
        scoped to the unit(s) below. Everything you do here is authorized at that unit’s scope and recorded in the
        audit log, exactly like the central admin panel.
      </div>

      <div className="coord-clubs">
        {ctx.clubs.map((c) => (
          <div className="coord-club-card" key={c.orgUnitLineageKey}>
            <div>
              <h3>{c.name ?? "A unit"}</h3>
              <div className="coord-club-type">
                {c.typeName ?? c.typeKey ?? "Unit"}
                {!c.publishedThisYear && " · not published this year"}
              </div>
            </div>
            <div className="coord-caps">
              {c.permissions.events && <SBadge tone="good">Events</SBadge>}
              {c.permissions.members && <SBadge tone="neutral">Members</SBadge>}
            </div>
            <div className="coord-club-links">
              {c.permissions.events && (
                <Link className="adm-btn ghost sm" href="/coordinator/events">Events →</Link>
              )}
              {c.permissions.members && (
                <Link className="adm-btn ghost sm" href={`/coordinator/members?lineage=${encodeURIComponent(c.orgUnitLineageKey)}`}>Members →</Link>
              )}
              <Link className="adm-btn ghost sm" href={`/coordinator/contribution?lineage=${encodeURIComponent(c.orgUnitLineageKey)}`}>Contribution →</Link>
              {c.slug && c.typeKey && (
                <Link className="adm-btn ghost sm" href={`/org/${c.typeKey}/${c.slug}`}>Public page →</Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
