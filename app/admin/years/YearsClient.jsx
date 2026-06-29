"use client";

import React, { useState } from "react";
import { Badge, Modal, Field, useAdminAction } from "../_components/ui";
import { hasPerm } from "../../../lib/admin/nav.mjs";
import { validateYearForm } from "../../../lib/admin/forms.mjs";

export default function YearsClient({ years, transitions, perms }) {
  const { run, busy } = useAdminAction();
  const [creating, setCreating] = useState(false);
  const [wizard, setWizard] = useState(false);

  const canCreate = hasPerm(perms, "year.create");
  const canSetCurrent = hasPerm(perms, "year.update");
  const canLock = hasPerm(perms, "year.lock");
  const canTransition = hasPerm(perms, "year.transition");

  const setCurrent = (y) => run("year.setCurrent", { yearId: y.id }, { success: `${y.label} is now the current year` }).catch(() => {});
  const lock = (y) => run("year.lock", { yearId: y.id }, { success: `Locked ${y.label}` }).catch(() => {});
  const unlock = (y) => run("year.unlock", { yearId: y.id }, { success: `Unlocked ${y.label}` }).catch(() => {});

  return (
    <>
      <div className="adm-section-head" style={{ marginBottom: 22 }}>
        <div className="adm-pagehead" style={{ marginBottom: 0 }}>
          <p className="adm-eyebrow">Temporal spine</p><h2>Academic Years</h2>
          <p>The current year scopes all live content. Lock past years to make them read-only; carry structure forward with the Transition Wizard.</p>
        </div>
        <div className="adm-actions">
          {canTransition && <button className="adm-btn ghost" onClick={() => setWizard(true)}>Transition Wizard</button>}
          {canCreate && <button className="adm-btn primary" onClick={() => setCreating(true)}>+ New year</button>}
        </div>
      </div>

      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead><tr><th>Year</th><th>Status</th><th>Dates</th><th>Content</th><th></th></tr></thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.id}>
                <td>{y.label} {y.isCurrent && <Badge tone="good">current</Badge>}</td>
                <td><Badge tone={y.statusTone}>{y.status}</Badge></td>
                <td style={{ color: "var(--adm-muted)" }}>{y.startDate} → {y.endDate}</td>
                <td style={{ color: "var(--adm-muted)" }}>{y.counts ? `${y.counts.contentItems} content · ${y.counts.orgUnits} units · ${y.counts.appointments} roles` : "—"}</td>
                <td>
                  <div className="adm-actions">
                    {canSetCurrent && !y.isCurrent && y.status !== "locked" && <button className="adm-btn ghost sm" disabled={busy} onClick={() => setCurrent(y)}>Set current</button>}
                    {canLock && !y.isCurrent && y.status !== "locked" && <button className="adm-btn ghost sm" disabled={busy} onClick={() => lock(y)}>Lock</button>}
                    {canLock && y.status === "locked" && <button className="adm-btn ghost sm" disabled={busy} onClick={() => unlock(y)}>Unlock</button>}
                  </div>
                </td>
              </tr>
            ))}
            {years.length === 0 && <tr><td colSpan={5}><div className="adm-empty">No academic years.</div></td></tr>}
          </tbody>
        </table>
      </div>

      <div className="adm-section" style={{ marginTop: 28 }}>
        <div className="adm-section-head"><h3>Transition history</h3></div>
        <div className="adm-tablewrap">
          <table className="adm-table">
            <thead><tr><th>Status</th><th>Options</th><th>Counts</th><th>When</th></tr></thead>
            <tbody>
              {(transitions.runs ?? []).map((r) => (
                <tr key={r.id}>
                  <td><Badge tone={r.status === "completed" ? "good" : r.status === "failed" ? "muted" : "info"}>{r.status}</Badge></td>
                  <td style={{ color: "var(--adm-muted)" }}>{[r.copyStructure && "structure", r.copyAppointments && "roster", r.copyContent && "content", r.copyRoleAssignments && "roles"].filter(Boolean).join(", ")}</td>
                  <td style={{ color: "var(--adm-muted)" }}>{r.counts ? `+${r.counts.orgUnits?.copied ?? 0} units, +${r.counts.contentItems?.copied ?? 0} content` : "—"}</td>
                  <td style={{ color: "var(--adm-faint)", fontSize: "0.78rem" }}>{r.completedAt ? new Date(r.completedAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
              {(transitions.runs ?? []).length === 0 && <tr><td colSpan={4}><div className="adm-empty">No transition runs yet.</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {creating && <CreateYearModal onClose={() => setCreating(false)} run={run} busy={busy} />}
      {wizard && <WizardModal years={years} onClose={() => setWizard(false)} run={run} busy={busy} />}
    </>
  );
}

function CreateYearModal({ onClose, run, busy }) {
  const [form, setForm] = useState({ label: "", startDate: "", endDate: "" });
  const [errors, setErrors] = useState({});
  const submit = async () => {
    const v = validateYearForm(form);
    setErrors(v.errors);
    if (!v.ok) return;
    try { await run("year.create", { input: v.value }, { success: `Created ${v.value.label}` }); onClose(); } catch {}
  };
  return (
    <Modal title="New academic year" onClose={onClose} footer={<>
      <button className="adm-btn ghost" onClick={onClose}>Cancel</button>
      <button className="adm-btn primary" onClick={submit} disabled={busy}>Create</button>
    </>}>
      <div className="adm-form">
        <Field label="Label (YYYY-YY)" error={errors.label}><input className="adm-input" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="2026-27" /></Field>
        <Field label="Start date" error={errors.startDate}><input className="adm-input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></Field>
        <Field label="End date" error={errors.endDate}><input className="adm-input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></Field>
        <p style={{ fontSize: "0.78rem", color: "var(--adm-muted)" }}>New years start as <b>planning</b>; use “Set current” to make one live.</p>
      </div>
    </Modal>
  );
}

function WizardModal({ years, onClose, run, busy }) {
  const [form, setForm] = useState({ sourceYearId: "", targetYearId: "", copyStructure: true, copyAppointments: false, copyContent: false, copyRoleAssignments: false, force: false });
  const [err, setErr] = useState("");
  const submit = async () => {
    if (!form.sourceYearId || !form.targetYearId) return setErr("Choose both a source and target year.");
    if (form.sourceYearId === form.targetYearId) return setErr("Source and target must differ.");
    setErr("");
    try {
      await run("year.transition", { input: form }, { success: "Transition complete" });
      onClose();
    } catch {}
  };
  return (
    <Modal title="Transition Wizard" onClose={onClose} footer={<>
      <button className="adm-btn ghost" onClick={onClose}>Cancel</button>
      <button className="adm-btn primary" onClick={submit} disabled={busy}>Run transition</button>
    </>}>
      <div className="adm-form">
        <p style={{ fontSize: "0.82rem", color: "var(--adm-muted)" }}>Copies a source year forward into a target year. Idempotent &amp; resumable — re-running is safe.</p>
        <Field label="Source year"><select className="adm-select" value={form.sourceYearId} onChange={(e) => setForm({ ...form, sourceYearId: e.target.value })}><option value="">Choose…</option>{years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select></Field>
        <Field label="Target year"><select className="adm-select" value={form.targetYearId} onChange={(e) => setForm({ ...form, targetYearId: e.target.value })}><option value="">Choose…</option>{years.filter((y) => y.status !== "locked").map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select></Field>
        <div className="adm-check-group">
          <h4>What to copy</h4>
          <label className="adm-check"><input type="checkbox" checked={form.copyStructure} onChange={(e) => setForm({ ...form, copyStructure: e.target.checked })} /> Structure (org units)</label>
          <label className="adm-check"><input type="checkbox" checked={form.copyAppointments} onChange={(e) => setForm({ ...form, copyAppointments: e.target.checked })} /> Appointments (roster)</label>
          <label className="adm-check"><input type="checkbox" checked={form.copyContent} onChange={(e) => setForm({ ...form, copyContent: e.target.checked })} /> Content (as drafts)</label>
          <label className="adm-check"><input type="checkbox" checked={form.copyRoleAssignments} onChange={(e) => setForm({ ...form, copyRoleAssignments: e.target.checked })} /> Role assignments</label>
          <label className="adm-check" style={{ marginTop: 6 }}><input type="checkbox" checked={form.force} onChange={(e) => setForm({ ...form, force: e.target.checked })} /> Force re-sync into a completed run</label>
        </div>
        {err && <p className="adm-field-err">{err}</p>}
      </div>
    </Modal>
  );
}
