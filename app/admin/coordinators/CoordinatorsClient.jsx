"use client";

// Coordinators mapping UI: one row per club (current academic year) showing its assigned
// coordinator(s), with assign-by-email + remove. Enforces "one coordinator → one club" — the
// grant is rejected server-side (grantRole, 409 COORDINATOR_ONE_CLUB) and pre-flagged here.
// Posts the shared role.grant / role.revoke actions; refreshes on success.
import React, { useMemo, useState } from "react";
import { useAdminAction, Field, Badge, ConfirmButton } from "../_components/ui";

const BORDER = "var(--adm-border, #e3e6ef)";
const MUTED = "var(--adm-muted, #6b7280)";

export default function CoordinatorsClient({ clubs = [], coordinatorsByLineage = {}, yearId, yearLabel, noYear }) {
  const { run, busy } = useAdminAction();
  const [q, setQ] = useState("");

  // Which club (by lineage) an email already coordinates — powers the "one club" pre-warning.
  const emailToLineage = useMemo(() => {
    const m = new Map();
    for (const list of Object.values(coordinatorsByLineage)) for (const g of list) if (g.userEmail) m.set(g.userEmail.toLowerCase(), g.orgUnitLineageKey);
    return m;
  }, [coordinatorsByLineage]);
  const clubNameByLineage = useMemo(() => new Map(clubs.map((c) => [c.lineageKey, c.name])), [clubs]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return clubs;
    return clubs.filter((c) => c.name.toLowerCase().includes(s) || (c.councilName || "").toLowerCase().includes(s));
  }, [clubs, q]);

  const mappedCount = Object.values(coordinatorsByLineage).reduce((n, l) => n + l.length, 0);

  if (noYear) {
    return (
      <>
        <Head />
        <div className="adm-card"><div className="adm-empty">No current academic year is set. Create/activate one in Academic Years first.</div></div>
      </>
    );
  }

  return (
    <>
      <Head yearLabel={yearLabel} />
      <section className="adm-card">
        <div className="adm-field">
          <label>Find a club</label>
          <input className="adm-input" placeholder="Search by club or council…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p style={{ fontSize: "0.82rem", color: MUTED, marginTop: 6 }}>
          {clubs.length} club{clubs.length === 1 ? "" : "s"} · {mappedCount} coordinator mapping{mappedCount === 1 ? "" : "s"} this year.
          A coordinator can be mapped to <strong>one club only</strong> — assigning a second is blocked.
        </p>
      </section>

      {clubs.length === 0 ? (
        <div className="adm-card"><div className="adm-empty">No clubs for this year yet. Import/create clubs in the Organization module first.</div></div>
      ) : filtered.length === 0 ? (
        <div className="adm-card"><div className="adm-empty">No clubs match your search.</div></div>
      ) : (
        filtered.map((club) => (
          <ClubRow
            key={club.id}
            club={club}
            coordinators={coordinatorsByLineage[club.lineageKey] ?? []}
            yearId={yearId}
            run={run}
            busy={busy}
            emailToLineage={emailToLineage}
            clubNameByLineage={clubNameByLineage}
          />
        ))
      )}
    </>
  );
}

function Head({ yearLabel }) {
  return (
    <div className="adm-pagehead">
      <p className="adm-eyebrow">Member platform · RBAC</p>
      <h2>Coordinators</h2>
      <p>Map each coordinator to a club{yearLabel ? ` for ${yearLabel}` : ""}. This grants the club-scoped <strong>coordinator</strong> role (so they can run their club&apos;s events). A person can coordinate only one club per year — revoke first to move them.</p>
    </div>
  );
}

function ClubRow({ club, coordinators, yearId, run, busy, emailToLineage, clubNameByLineage }) {
  const [email, setEmail] = useState("");

  const assign = () => {
    const e = email.trim();
    if (!e) return;
    run(
      "role.grant",
      { input: { email: e, roleKey: "coordinator", orgUnitLineageKey: club.lineageKey, academicYearId: yearId } },
      { success: `Mapped ${e} as coordinator of ${club.name}.` }
    ).then(() => setEmail("")).catch(() => {});
  };
  const remove = (assignmentId, who) =>
    run("role.revoke", { assignmentId }, { success: `Removed ${who} as coordinator of ${club.name}.` }).catch(() => {});

  // Pre-warn if the typed email already coordinates a DIFFERENT club (the server will reject it).
  const typed = email.trim().toLowerCase();
  const otherLineage = typed ? emailToLineage.get(typed) : null;
  const conflict = otherLineage && otherLineage !== club.lineageKey ? (clubNameByLineage.get(otherLineage) || "another club") : null;

  return (
    <section className="adm-card" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0 }}>{club.name}</h3>
        {club.councilName && <span style={{ fontSize: "0.8rem", color: MUTED }}>· {club.councilName}</span>}
        {club.status !== "published" && <Badge tone="muted">{club.status}</Badge>}
      </div>

      <div style={{ marginTop: 10, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
        {coordinators.length === 0 ? (
          <div className="adm-empty" style={{ padding: 10 }}>No coordinator mapped yet.</div>
        ) : (
          coordinators.map((c) => (
            <div key={c.assignmentId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderTop: `1px solid ${BORDER}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{c.userName || "—"}</div>
                <div style={{ fontSize: "0.78rem", color: MUTED }}>{c.userEmail}</div>
              </div>
              {c.userStatus && c.userStatus !== "active" && <Badge tone="muted">{c.userStatus}</Badge>}
              <ConfirmButton className="adm-btn danger sm" confirm={`Remove ${c.userEmail} as coordinator of ${club.name}?`} busy={busy} onConfirm={() => remove(c.assignmentId, c.userEmail)}>Remove</ConfirmButton>
            </div>
          ))
        )}
      </div>

      <div className="adm-checks" style={{ gridTemplateColumns: "1fr 150px", alignItems: "end", marginTop: 10 }}>
        <Field label="Assign a coordinator (member email)" error={conflict ? `Already coordinates ${conflict} — will be rejected. Remove that first.` : undefined}>
          <input className="adm-input" placeholder="member@iitjammu.ac.in" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <button className="adm-btn primary" disabled={busy || !email.trim() || !!conflict} onClick={assign}>Map to this club</button>
      </div>
    </section>
  );
}
