// M6 — the shared, SERVER-rendered member profile + contribution view (DL-090). Used by
// BOTH the self surface (/member/profile) and the admin surface (/admin/users/[id]). A
// Server Component (no "use client"): props stay on the server, only HTML ships — so the
// email/ids in `profile` are never serialized to the client (PII parity, DL-082). All
// derivation (split / category-map / totals) is the PURE lib/member/summary.mjs, mirrored
// exactly by the tests.
import Link from "next/link";
import "./MemberProfile.css";
import {
  splitMemberEvents,
  categoryBreakdown,
  participationSummary,
  formatIdentity,
  contributionTotals,
} from "../../lib/member/summary.mjs";

function fmtDate(v) {
  if (!v) return null;
  try {
    return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return null;
  }
}

function statusTone(status) {
  if (status === "active") return "good";
  if (status === "inactive") return "warn";
  return "muted";
}

function EventRow({ ev }) {
  const date = fmtDate(ev.eventDate);
  const meta = [];
  if (ev.category) meta.push(ev.category);
  if (date) meta.push(date);
  if (ev.registration?.status) meta.push(ev.registration.status);
  if (ev.attended) meta.push("attended");
  return (
    <li className="prof-item">
      <span className="prof-item-main">
        {ev.slug && ev.published ? <Link href={`/events/${ev.slug}`}>{ev.title ?? "Untitled event"}</Link> : ev.title ?? "Untitled event"}
      </span>
      <span className="prof-item-meta">
        {meta.map((m, i) => (
          <span key={i}>{m}</span>
        ))}
        {ev.points != null && (
          <span className="prof-metric">
            {ev.points} pts{ev.rank != null ? ` · rank #${ev.rank}` : ""}
          </span>
        )}
      </span>
    </li>
  );
}

// contribution is optional; when present, shows the year rollup for this member.
export default function MemberProfile({ profile, contribution = null, showEmail = true }) {
  if (!profile?.member) {
    return <p className="prof-empty">This profile could not be loaded.</p>;
  }
  const { member, roles = [], affiliations = [], syndicate = null, events = [], achievements = [] } = profile;
  const { upcoming, past } = splitMemberEvents(events);
  const categories = categoryBreakdown(past.length ? past : events);
  const summary = participationSummary(events);
  const identityLabel = formatIdentity(member.identity);
  const totals = contribution ? contributionTotals(contribution) : null;

  return (
    <div className="prof">
      <div className="prof-head">
        <h2>{member.name || "Member"}</h2>
        {identityLabel && <span className="prof-ident">{identityLabel}</span>}
        {showEmail && member.email && <span className="prof-email">{member.email}</span>}
        <span className={`prof-badge ${statusTone(member.status)}`}>{member.status}</span>
      </div>

      {/* Roles / category (DL-063) */}
      <div className="prof-card">
        <h3>Roles &amp; category</h3>
        {roles.length ? (
          <div className="prof-chips">
            {roles.map((r) => (
              <span key={r.assignmentId} className="prof-chip">
                {r.name || r.key}
                {r.scope?.unitName && <span className="prof-chip-scope">· {r.scope.unitName}</span>}
                {!r.scope?.unitName && r.scope?.academicYearLabel && <span className="prof-chip-scope">· {r.scope.academicYearLabel}</span>}
              </span>
            ))}
          </div>
        ) : (
          <p className="prof-empty">No roles assigned — a normal member.</p>
        )}
      </div>

      {/* Affiliations (clubs / societies / syndicates) — M3 club_membership */}
      <div className="prof-card">
        <h3>Clubs, societies &amp; syndicates</h3>
        {syndicate && (
          <p className="prof-sub prof-syndicate">
            Syndicate: <strong>{syndicate.name ?? "—"}</strong>
          </p>
        )}
        {affiliations.length ? (
          <ul className="prof-list">
            {affiliations.map((a) => (
              <li key={a.orgUnitLineageKey} className="prof-item">
                <span className="prof-item-main">
                  {a.slug ? <Link href={`/org/${a.typeKey ?? "clubs"}/${a.slug}`}>{a.name ?? "A unit"}</Link> : a.name ?? "A unit"}
                </span>
                <span className="prof-item-meta">
                  {a.typeName && <span>{a.typeName}</span>}
                  {a.role && <span>{a.role}</span>}
                  <span>{a.status === "active" ? "Member" : "Inactive"}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="prof-empty">Not listed as a member of any club yet.</p>
        )}
      </div>

      {/* Institute contribution (optional — the year rollup) */}
      {totals && (
        <div className="prof-card">
          <h3>Institute contribution{contribution.yearId ? "" : ""}</h3>
          <div className="prof-stats">
            <div className="prof-stat"><span className="n">{totals.touchpoints}</span><span className="l">Touchpoints</span></div>
            <div className="prof-stat"><span className="n">{totals.eventsOrganized}</span><span className="l">Organized</span></div>
            <div className="prof-stat"><span className="n">{totals.eventsParticipated}</span><span className="l">Participated</span></div>
            <div className="prof-stat"><span className="n">{totals.achievements}</span><span className="l">Achievements</span></div>
            <div className="prof-stat"><span className="n">{totals.roles}</span><span className="l">Roles</span></div>
          </div>
          {contribution.eventsOrganized?.items?.length ? (
            <ul className="prof-list" style={{ marginTop: 12 }}>
              {contribution.eventsOrganized.items.map((o) => (
                <li key={o.eventItemId} className="prof-item">
                  <span className="prof-item-main">{o.slug ? <Link href={`/events/${o.slug}`}>{o.title ?? "Untitled event"}</Link> : o.title ?? "Untitled event"}</span>
                  <span className="prof-item-meta">{o.kind && <span>{o.kind}</span>}{o.role && <span>{o.role}</span>}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {/* Participation — category-mapped + upcoming + past */}
      <div className="prof-card">
        <h3>Events</h3>
        <div className="prof-chips" style={{ marginBottom: 12 }}>
          <span className="prof-chip count"><b>{summary.total}</b>&nbsp;total</span>
          <span className="prof-chip count"><b>{summary.upcoming}</b>&nbsp;upcoming</span>
          <span className="prof-chip count"><b>{summary.attended}</b>&nbsp;attended</span>
          <span className="prof-chip count"><b>{summary.scored}</b>&nbsp;scored</span>
        </div>
        {categories.length ? (
          <>
            <p className="prof-sub">By category</p>
            <div className="prof-chips" style={{ marginBottom: 14 }}>
              {categories.map((c) => (
                <span key={c.category} className="prof-chip count"><b>{c.count}</b>&nbsp;{c.category}</span>
              ))}
            </div>
          </>
        ) : null}

        <p className="prof-sub">Registered &amp; upcoming</p>
        {upcoming.length ? (
          <ul className="prof-list">{upcoming.map((ev) => <EventRow key={ev.eventItemId} ev={ev} />)}</ul>
        ) : (
          <p className="prof-empty">No upcoming registrations.</p>
        )}

        <p className="prof-sub" style={{ marginTop: 12 }}>Participated</p>
        {past.length ? (
          <ul className="prof-list">{past.map((ev) => <EventRow key={ev.eventItemId} ev={ev} />)}</ul>
        ) : (
          <p className="prof-empty">No past events yet.</p>
        )}
      </div>

      {/* Achievements — the member's Wall-of-Fame slice (M4) */}
      <div className="prof-card">
        <h3>Achievements</h3>
        {achievements.length ? (
          <ul className="prof-list">
            {achievements.map((a) => (
              <li key={a.id} className="prof-item">
                <span className="prof-item-main">
                  <Link href="/wall-of-fame">{a.title ?? "An achievement"}</Link>
                </span>
                <span className="prof-item-meta">
                  {a.category && <span>{a.category}</span>}
                  {fmtDate(a.achievementDate) && <span>{fmtDate(a.achievementDate)}</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="prof-empty">No achievements recorded this year.</p>
        )}
      </div>
    </div>
  );
}
