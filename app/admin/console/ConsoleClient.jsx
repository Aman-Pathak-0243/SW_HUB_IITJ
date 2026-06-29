"use client";

import React, { useState } from "react";
import { Badge, Modal, Field, useAdminAction } from "../_components/ui";
import { hasPerm } from "../../../lib/admin/nav.mjs";
import { humanBytes } from "../../../lib/admin/view-models.mjs";

// The interactive part of the Developer Console: the backup_record ledger
// (record / verify) and the safe media-rollback dry-run recovery action. All post
// to /api/admin/action; the backups service self-gates (authorizeConsole).
export default function ConsoleClient({ backups, perms, canStatus }) {
  const { run, busy } = useAdminAction();
  const [recording, setRecording] = useState(false);

  const canRecord = hasPerm(perms, "backup.create") || canStatus;
  const canRestore = hasPerm(perms, "backup.restore") || canStatus;

  const verify = (b) => run("backup.verify", { id: b.id, verified: !b.verified }, { success: b.verified ? "Marked unverified" : "Marked verified" }).catch(() => {});
  const rollbackDryRun = () =>
    run("backup.rollbackMedia", { opts: { dryRun: true } }, { success: "Rollback plan computed", refresh: false, onSuccess: (r) => alert(`Media rollback dry-run: ${r?.plan?.length ?? 0} asset(s) would be reverted. No changes were made.`) }).catch(() => {});

  return (
    <div className="adm-section">
      <div className="adm-section-head">
        <h3>Backups &amp; recovery</h3>
        <div className="adm-actions">
          {canRestore && <button className="adm-btn ghost sm" disabled={busy} onClick={rollbackDryRun}>Media rollback (dry-run)</button>}
          {canRecord && <button className="adm-btn primary" onClick={() => setRecording(true)}>+ Record backup</button>}
        </div>
      </div>
      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead><tr><th>Scope</th><th>Location</th><th>Size</th><th>Verified</th><th></th></tr></thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.id}>
                <td>{b.scope} <span className="adm-code">{b.format}</span></td>
                <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.location}</td>
                <td style={{ color: "var(--adm-muted)" }}>{humanBytes(b.bytes)}</td>
                <td>{b.verified ? <Badge tone="good">verified</Badge> : <Badge tone="muted">no</Badge>}</td>
                <td>{canRecord && <button className="adm-btn ghost sm" disabled={busy} onClick={() => verify(b)}>{b.verified ? "Unverify" : "Verify"}</button>}</td>
              </tr>
            ))}
            {backups.length === 0 && <tr><td colSpan={5}><div className="adm-empty">No backup records yet.</div></td></tr>}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: "0.76rem", color: "var(--adm-faint)", marginTop: 10 }}>
        Backup artifacts are produced out-of-band by <span className="adm-code">scripts/backup.sh</span>; this ledger records that they exist + verified. Force-transition recovery lives in Academic Years → Transition Wizard (force).
      </p>

      {recording && <RecordBackupModal onClose={() => setRecording(false)} run={run} busy={busy} />}
    </div>
  );
}

function RecordBackupModal({ onClose, run, busy }) {
  const [form, setForm] = useState({ scope: "full", location: "", format: "zip", checksum: "", bytes: "", verified: false });
  const [err, setErr] = useState("");
  const submit = async () => {
    if (!form.scope || !form.location) return setErr("Scope and location are required.");
    setErr("");
    try {
      const input = { scope: form.scope, location: form.location, format: form.format, checksum: form.checksum || undefined, verified: form.verified };
      if (form.bytes !== "") input.bytes = Number(form.bytes);
      await run("backup.record", { input }, { success: "Backup recorded" });
      onClose();
    } catch {}
  };
  return (
    <Modal title="Record a backup artifact" onClose={onClose} footer={<>
      <button className="adm-btn ghost" onClick={onClose}>Cancel</button>
      <button className="adm-btn primary" onClick={submit} disabled={busy}>Record</button>
    </>}>
      <div className="adm-form">
        <Field label="Scope"><input className="adm-input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} placeholder="full / db / public" /></Field>
        <Field label="Location (path / URL)"><input className="adm-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="backups/backup-….zip" /></Field>
        <div style={{ display: "flex", gap: 12 }}>
          <Field label="Format"><input className="adm-input" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} /></Field>
          <Field label="Bytes (optional)"><input className="adm-input" type="number" value={form.bytes} onChange={(e) => setForm({ ...form, bytes: e.target.value })} /></Field>
        </div>
        <Field label="Checksum (optional)"><input className="adm-input" value={form.checksum} onChange={(e) => setForm({ ...form, checksum: e.target.value })} /></Field>
        <label className="adm-check"><input type="checkbox" checked={form.verified} onChange={(e) => setForm({ ...form, verified: e.target.checked })} /> Already verified</label>
        {err && <p className="adm-field-err">{err}</p>}
      </div>
    </Modal>
  );
}
