"use client";

import React, { useState } from "react";
import { Badge, Modal, useAdminAction } from "../_components/ui";
import { hasPerm } from "../../../lib/admin/nav.mjs";

const TYPE_LABEL = { account_request: "Account request", password_reset: "Password reset" };
const STATUS_TONE = { open: "info", assigned: "warn", resolved: "good", dismissed: "muted" };

export default function RequestsClient({ notifications, counts, perms, viewerId }) {
  const { run, busy } = useAdminAction();
  const [filter, setFilter] = useState("open"); // open | all
  const [generated, setGenerated] = useState(null); // { email, password, referenceId }

  const canAssign = hasPerm(perms, "notification.assign");
  const canResolve = hasPerm(perms, "notification.resolve");
  const canUpdateUser = hasPerm(perms, "user.update");

  const rows = notifications.filter((n) => (filter === "open" ? n.status === "open" || n.status === "assigned" : true));

  const take = (n) => run("notification.assign", { id: n.id }, { success: `Took ${n.referenceId}` }).catch(() => {});
  const dismiss = (n) =>
    run("notification.resolve", { id: n.id, status: "dismissed", note: "Dismissed" }, { success: `Dismissed ${n.referenceId}` }).catch(() => {});
  const resolve = (n) =>
    run("notification.resolve", { id: n.id, status: "resolved", note: "Resolved" }, { success: `Resolved ${n.referenceId}` }).catch(() => {});

  const fulfil = async (n) => {
    try {
      const res = await run("notification.fulfilReset", { id: n.id }, { success: `Reset ${n.subjectEmail}` });
      if (res?.generatedPassword) setGenerated({ email: res.userEmail ?? n.subjectEmail, password: res.generatedPassword, referenceId: n.referenceId });
    } catch { /* toast shown */ }
  };

  return (
    <>
      <div className="adm-pagehead">
        <p className="adm-eyebrow">Member platform · M0</p>
        <h2>Password Management</h2>
        <p>
          Account-creation and password-reset requests. <strong>Take</strong> a request to assign it
          to yourself (audited), then fulfil a reset (generates a temporary password the user must
          change) or dismiss it. Initial / reset passwords are delivered via the institute's
          external email — never by the app.
        </p>
      </div>

      <div className="adm-toolbar" style={{ gap: 10, alignItems: "center" }}>
        <button className={`adm-btn ${filter === "open" ? "primary" : "ghost"}`} onClick={() => setFilter("open")}>
          Open ({counts.openTotal ?? 0})
        </button>
        <button className={`adm-btn ${filter === "all" ? "primary" : "ghost"}`} onClick={() => setFilter("all")}>All</button>
        <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--adm-faint)" }}>
          {counts.resolved ?? 0} resolved · {counts.dismissed ?? 0} dismissed
        </span>
      </div>

      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead>
            <tr><th>Ref</th><th>Type</th><th>Subject</th><th>Status</th><th>Assigned</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((n) => {
              const accountExists = n.data?.accountExists;
              return (
                <tr key={n.id}>
                  <td><span className="adm-code">{n.referenceId}</span></td>
                  <td>{TYPE_LABEL[n.type] ?? n.type}</td>
                  <td>
                    {n.subjectEmail}
                    {n.type === "account_request" && n.data?.name && <div style={{ fontSize: "0.78rem", color: "var(--adm-muted)" }}>{n.data.name}</div>}
                    {n.type === "password_reset" && accountExists === false && <div style={{ fontSize: "0.78rem", color: "var(--adm-warn)" }}>no matching account</div>}
                  </td>
                  <td><Badge tone={STATUS_TONE[n.status] ?? "neutral"}>{n.status}</Badge></td>
                  <td style={{ fontSize: "0.8rem", color: "var(--adm-faint)" }}>{n.assignedToEmail ?? "—"}</td>
                  <td>
                    <div className="adm-actions">
                      {canAssign && (n.status === "open" || (n.status === "assigned" && n.assignedToUserId !== viewerId)) && (
                        <button className="adm-btn ghost sm" disabled={busy} onClick={() => take(n)}>Take</button>
                      )}
                      {n.type === "password_reset" && canUpdateUser && canResolve && n.status !== "resolved" && n.status !== "dismissed" && accountExists !== false && (
                        <button className="adm-btn primary sm" disabled={busy} onClick={() => fulfil(n)}>Generate &amp; set</button>
                      )}
                      {n.type === "account_request" && canResolve && n.status !== "resolved" && n.status !== "dismissed" && (
                        <button className="adm-btn ghost sm" disabled={busy} onClick={() => resolve(n)} title="Create the account in Users & Roles, then mark resolved">Mark resolved</button>
                      )}
                      {canResolve && n.status !== "resolved" && n.status !== "dismissed" && (
                        <button className="adm-btn danger sm" disabled={busy} onClick={() => dismiss(n)}>Dismiss</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={6}><div className="adm-empty">No requests.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {generated && (
        <Modal title="Temporary password generated" onClose={() => setGenerated(null)} footer={<button className="adm-btn primary" onClick={() => setGenerated(null)}>Done</button>}>
          <div className="adm-form">
            <p className="adm-banner warn">
              Deliver this password to <strong>{generated.email}</strong> via the institute's external
              email. It is shown only once and is never stored in plaintext. The user must change it on
              first login.
            </p>
            <div className="adm-field">
              <label>Temporary password</label>
              <input className="adm-input adm-code" readOnly value={generated.password} onFocus={(e) => e.target.select()} />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
