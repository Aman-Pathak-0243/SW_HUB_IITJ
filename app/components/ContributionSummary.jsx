// M6 — the shared, SERVER-rendered per-stakeholder INSTITUTE CONTRIBUTION summary
// (DL-090). Renders a member / club / entity contribution rollup (from
// lib/member/contribution.mjs) with the PURE contributionTotals headline. Reuses the
// MemberProfile.css classes. A Server Component (props stay server-side).
import Link from "next/link";
import "./MemberProfile.css";
import { contributionTotals } from "../../lib/member/summary.mjs";

const KIND_LABEL = { member: "Member", club: "Club / council", entity: "Custom entity" };

export default function ContributionSummary({ contribution }) {
  if (!contribution) return <p className="prof-empty">No stakeholder selected, or nothing found.</p>;
  const totals = contributionTotals(contribution);
  const subj = contribution.subject ?? {};
  const kind = contribution.kind;

  // Per-kind stat tiles (touchpoints is always first).
  const tiles = [{ n: totals.touchpoints, l: "Touchpoints" }, { n: totals.eventsOrganized, l: "Events organized" }];
  if (kind === "member") {
    tiles.push({ n: totals.eventsParticipated, l: "Participated" }, { n: totals.achievements, l: "Achievements" }, { n: totals.roles, l: "Roles" });
  } else if (kind === "club") {
    tiles.push({ n: totals.achievements, l: "Achievements" }, { n: totals.members, l: "Members" }, { n: totals.participantsReached, l: "Participants reached" });
  } else {
    tiles.push({ n: totals.participantsReached, l: "Participants reached" });
  }

  return (
    <div className="prof">
      <div className="prof-head">
        <h2>{subj.name || "—"}</h2>
        <span className="prof-badge muted">{KIND_LABEL[kind] ?? kind}</span>
        {subj.typeKey && <span className="prof-ident">{subj.typeKey}</span>}
        {subj.entityKind && <span className="prof-ident">{subj.entityKind}</span>}
        {subj.email && <span className="prof-email">{subj.email}</span>}
      </div>

      <div className="prof-card">
        <h3>Contribution this year</h3>
        <div className="prof-stats">
          {tiles.map((t, i) => (
            <div className="prof-stat" key={i}>
              <span className="n">{t.n}</span>
              <span className="l">{t.l}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="prof-card">
        <h3>Events organized</h3>
        {contribution.eventsOrganized?.items?.length ? (
          <ul className="prof-list">
            {contribution.eventsOrganized.items.map((o) => (
              <li key={o.eventItemId} className="prof-item">
                <span className="prof-item-main">{o.slug ? <Link href={`/events/${o.slug}`}>{o.title ?? "Untitled event"}</Link> : o.title ?? "Untitled event"}</span>
                <span className="prof-item-meta">{o.kind && <span>{o.kind}</span>}{o.role && <span>{o.role}</span>}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="prof-empty">No events organized in this year.</p>
        )}
      </div>

      {kind === "member" && (
        <div className="prof-card">
          <h3>Events participated</h3>
          {contribution.eventsParticipated?.items?.length ? (
            <ul className="prof-list">
              {contribution.eventsParticipated.items.map((p) => (
                <li key={p.eventItemId} className="prof-item">
                  <span className="prof-item-main">{p.slug ? <Link href={`/events/${p.slug}`}>{p.title ?? "Untitled event"}</Link> : p.title ?? "Untitled event"}</span>
                  <span className="prof-item-meta">{p.status && <span>{p.status}</span>}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="prof-empty">No events participated in this year.</p>
          )}
        </div>
      )}

      {contribution.achievements?.items?.length ? (
        <div className="prof-card">
          <h3>Achievements credited</h3>
          <ul className="prof-list">
            {contribution.achievements.items.map((a) => (
              <li key={a.id} className="prof-item">
                <span className="prof-item-main"><Link href="/wall-of-fame">{a.title ?? "An achievement"}</Link></span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
