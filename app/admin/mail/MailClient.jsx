"use client";

import React, { useState } from "react";
import { Badge, ConfirmButton, useAdminAction } from "../_components/ui";
import { hasPerm } from "../../../lib/admin/nav.mjs";
import { normalizeRecipients, mailProgress } from "../../../lib/mail/progress.mjs";

export default function MailClient({ senders, perms }) {
  const { run, busy } = useAdminAction();
  const canManage = hasPerm(perms, "mail.manage");
  const canSend = hasPerm(perms, "mail.send");
  const activeSenders = senders.filter((s) => s.active);

  const [newSender, setNewSender] = useState({ email: "", name: "" });
  const [compose, setCompose] = useState({ from: activeSenders[0]?.email ?? "", subject: "", text: "", recipients: "" });
  const [result, setResult] = useState(null);

  const addSender = () =>
    run("mail.addSender", { input: { email: newSender.email, name: newSender.name } }, { success: `Authorized ${newSender.email}` })
      .then(() => setNewSender({ email: "", name: "" })).catch(() => {});
  const removeSender = (s) => run("mail.removeSender", { id: s.id }, { success: `Removed ${s.email}` }).catch(() => {});

  const recipientPreview = normalizeRecipients(compose.recipients.split(/[\n,;]+/));
  const send = async () => {
    setResult(null);
    try {
      const res = await run(
        "mail.sendBulk",
        { input: { from: compose.from, subject: compose.subject, text: compose.text, recipients: recipientPreview.valid } },
        { success: "Send complete" }
      );
      setResult(res ?? null);
    } catch { /* toast shown by run */ }
  };

  return (
    <>
      <div className="adm-pagehead">
        <p className="adm-eyebrow">Member platform · M8</p>
        <h2>Mail</h2>
        <p>Bulk, rate-limited mail from an authorized sender. Delivery uses nodemailer on the
          institute VM (needs <span className="adm-code">MAIL_HOST</span> configured) — initial
          account passwords still go via the institute's external mail, never here.</p>
      </div>

      <section className="adm-card">
        <h3>Authorized senders</h3>
        {senders.length === 0 && <div className="adm-empty">No authorized senders yet.</div>}
        <div className="adm-tablewrap">
          <table className="adm-table">
            <tbody>
              {senders.map((s) => (
                <tr key={s.id}>
                  <td><span className="adm-code">{s.email}</span> {!s.active && <Badge tone="muted">inactive</Badge>}</td>
                  <td>{s.name ?? "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    {canManage && <ConfirmButton className="adm-btn danger sm" confirm={`Remove ${s.email}?`} busy={busy} onConfirm={() => removeSender(s)}>Remove</ConfirmButton>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canManage && (
          <div className="adm-toolbar" style={{ gap: 8, marginTop: 10 }}>
            <input className="adm-input" placeholder="sender@iitjammu.ac.in" value={newSender.email} onChange={(e) => setNewSender({ ...newSender, email: e.target.value })} />
            <input className="adm-input" placeholder="Name (optional)" value={newSender.name} onChange={(e) => setNewSender({ ...newSender, name: e.target.value })} />
            <button className="adm-btn primary" disabled={busy || !newSender.email} onClick={addSender}>Authorize</button>
          </div>
        )}
      </section>

      {canSend && (
        <section className="adm-card" style={{ marginTop: 16 }}>
          <h3>Compose</h3>
          <div className="adm-form">
            <div className="adm-field">
              <label>From</label>
              <select className="adm-select" value={compose.from} onChange={(e) => setCompose({ ...compose, from: e.target.value })}>
                <option value="">Select an authorized sender…</option>
                {activeSenders.map((s) => <option key={s.id} value={s.email}>{s.email}</option>)}
              </select>
            </div>
            <div className="adm-field">
              <label>Subject</label>
              <input className="adm-input" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
            </div>
            <div className="adm-field">
              <label>Message (plain text)</label>
              <textarea className="adm-input" rows={5} value={compose.text} onChange={(e) => setCompose({ ...compose, text: e.target.value })} />
            </div>
            <div className="adm-field">
              <label>Recipients (one per line / comma-separated) — {recipientPreview.valid.length} valid{recipientPreview.invalid.length ? `, ${recipientPreview.invalid.length} invalid` : ""}</label>
              <textarea className="adm-input" rows={4} value={compose.recipients} onChange={(e) => setCompose({ ...compose, recipients: e.target.value })} />
            </div>
            <button className="adm-btn primary" disabled={busy || !compose.from || !compose.subject || !compose.text || recipientPreview.valid.length === 0} onClick={send}>
              {busy ? "Sending…" : `Send to ${recipientPreview.valid.length}`}
            </button>
            {result && (
              <p className="adm-banner good" style={{ marginTop: 10 }}>
                Sent {result.sent}/{result.total}{result.failed ? `, ${result.failed} failed` : ""} ({mailProgress(result).percent}%).
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
