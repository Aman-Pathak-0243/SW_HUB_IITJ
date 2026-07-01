"use client";

// Scoped-coordinator MEMBERS client (Session 13, DL-096). Add / remove / re-status a
// unit's members and bulk-import a CSV, posting the SCOPED membership.* actions to the
// shared /api/admin/action route (each re-authorizes membership.manage at the unit's
// lineage). Re-imports are non-destructive (a manually-set role/status is preserved,
// consolidation review B5). The unit lineage is fixed by the server (the page validated
// it against the coordinator's manageable set).
import React, { useState } from "react";
import { useAdminAction, Field, ConfirmButton, Badge } from "../../admin/_components/ui";

const STATUSES = ["active", "inactive"];

export default function CoordinatorMembersClient({ orgUnitLineageKey, clubName, roster = [] }) {
  const { run, busy } = useAdminAction();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [csv, setCsv] = useState("");

  const add = () => {
    if (!email.trim()) return;
    run("membership.add", { input: { orgUnitLineageKey, email: email.trim(), role: role.trim() || undefined } }, { success: "Member added." })
      .then(() => { setEmail(""); setRole(""); })
      .catch(() => {});
  };
  const importCsv = () => {
    if (!csv.trim()) return;
    run("membership.import", { input: { orgUnitLineageKey, csv } }, { success: "Members imported (see counts)." })
      .then((res) => {
        if (res?.summary) alert(`Imported for ${clubName}: +${res.summary.created} new, ~${res.summary.updated} updated, ${res.summary.missing} missing account(s), ${res.summary.failed} failed.`);
        setCsv("");
      })
      .catch(() => {});
  };

  return (
    <div>
      <div className="adm-card" style={{ marginBottom: 18 }}>
        <h3>Roster</h3>
        {roster.length ? (
          <div className="coord-tablewrap">
            <table className="adm-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {roster.map((m) => (
                  <tr key={m.id}>
                    <td>{m.userName ?? "—"}</td>
                    <td>{m.userEmail ?? "—"}</td>
                    <td>{m.role ?? "—"}</td>
                    <td><Badge tone={m.status === "active" ? "good" : "muted"}>{m.status}</Badge></td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <select className="adm-select" defaultValue={m.status} style={{ maxWidth: 130 }}
                        onChange={(e) => run("membership.setStatus", { id: m.id, status: e.target.value }, { success: "Status updated." })}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <ConfirmButton confirm={`Remove ${m.userEmail ?? "this member"} from ${clubName}?`} busy={busy}
                        onConfirm={() => run("membership.remove", { id: m.id }, { success: "Member removed." })}>
                        Remove
                      </ConfirmButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="coord-hint">No members yet.</p>
        )}
      </div>

      <div className="adm-card" style={{ marginBottom: 18 }}>
        <h3>Add a member</h3>
        <div className="coord-grid">
          <Field label="Member email"><input className="adm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="2023ume0243@iitjammu.ac.in" /></Field>
          <Field label="Role in the club (optional)"><input className="adm-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Core, Volunteer" /></Field>
        </div>
        <button className="adm-btn primary" onClick={add} disabled={busy || !email.trim()}>Add member</button>
      </div>

      <div className="adm-card">
        <h3>Bulk import (CSV)</h3>
        <p className="coord-hint">One email per line (optionally <code>email,role</code>). Existing members are updated non-destructively; a missing account is reported, not created.</p>
        <textarea className="coord-sheet" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"2023ume0243@iitjammu.ac.in\n2023ume0244@iitjammu.ac.in,Core"} />
        <button className="adm-btn primary" onClick={importCsv} disabled={busy || !csv.trim()}>Import members</button>
      </div>
    </div>
  );
}
