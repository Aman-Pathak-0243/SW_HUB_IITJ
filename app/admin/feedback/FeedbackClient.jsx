"use client";

import React, { useState } from "react";
import { Badge, Modal, useAdminAction } from "../_components/ui";
import { hasPerm } from "../../../lib/admin/nav.mjs";

const CAT_LABEL = { bug: "Bug", issue: "Issue", query: "Question", suggestion: "Suggestion" };
const STATUS_TONE = { open: "info", triaged: "warn", in_progress: "warn", resolved: "good", dismissed: "muted" };

export default function FeedbackClient({ page, counts, perms, viewerId }) {
  const { run, busy } = useAdminAction();
  const [filter, setFilter] = useState("open"); // open | all
  const [detail, setDetail] = useState(null);

  const canResolve = hasPerm(perms, "feedback.resolve");
  const open = (t) => ["open", "triaged", "in_progress"].includes(t.status);
  const rows = (page?.entries ?? []).filter((t) => (filter === "open" ? open(t) : true));

  const take = (t) => run("feedback.assign", { id: t.id }, { success: `Took ${t.referenceId}` }).catch(() => {});
  const setStatus = (t, status, note) =>
    run("feedback.setStatus", { id: t.id, status, note }, { success: `${t.referenceId} → ${status}` }).then(() => setDetail(null)).catch(() => {});

  return (
    <>
      <div className="adm-pagehead">
        <p className="adm-eyebrow">Member platform · M7</p>
        <h2>Feedback &amp; Support</h2>
        <p>Bug reports, questions and suggestions from the public feedback form. <strong>Take</strong> a
          ticket to assign it to yourself (audited), then move it through triage → in progress →
          resolved, or dismiss it. Each ticket carries a unique reference id.</p>
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
            <tr><th>Ref</th><th>Category</th><th>Subject</th><th>Status</th><th>Assigned</th><th></th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td><span className="adm-code">{t.referenceId}</span></td>
                <td>{CAT_LABEL[t.category] ?? t.category}</td>
                <td>
                  {t.subject}
                  {t.component && <div style={{ fontSize: "0.78rem", color: "var(--adm-muted)" }}>{t.component}</div>}
                </td>
                <td><Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status.replace("_", " ")}</Badge></td>
                <td style={{ fontSize: "0.8rem", color: "var(--adm-faint)" }}>{t.assignedToEmail ?? "—"}</td>
                <td>
                  <div className="adm-actions">
                    {canResolve && open(t) && (t.assignedToUserId !== viewerId) && (
                      <button className="adm-btn ghost sm" disabled={busy} onClick={() => take(t)}>Take</button>
                    )}
                    {canResolve && <button className="adm-btn ghost sm" onClick={() => setDetail(t)}>Manage</button>}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6}><div className="adm-empty">No tickets.</div></td></tr>}
          </tbody>
        </table>
      </div>
      {page?.hasMore && <p style={{ fontSize: "0.8rem", color: "var(--adm-faint)", marginTop: 8 }}>Showing the most recent {rows.length}. Older tickets are paginated (keyset).</p>}

      {detail && (
        <Modal title={`${detail.referenceId} · ${CAT_LABEL[detail.category] ?? detail.category}`} onClose={() => setDetail(null)}>
          <div className="adm-form">
            <h3 style={{ margin: "0 0 4px" }}>{detail.subject}</h3>
            <p style={{ whiteSpace: "pre-wrap", color: "var(--adm-muted)" }}>{detail.body}</p>
            <p style={{ fontSize: "0.8rem", color: "var(--adm-faint)" }}>
              {detail.submitterEmail ? `From ${detail.submitterEmail}` : "Anonymous"}
              {detail.component ? ` · ${detail.component}` : ""} · <Badge tone={STATUS_TONE[detail.status]}>{detail.status.replace("_", " ")}</Badge>
            </p>
            {canResolve && (
              <div className="adm-actions" style={{ flexWrap: "wrap", gap: 6 }}>
                <button className="adm-btn ghost sm" disabled={busy} onClick={() => setStatus(detail, "triaged")}>Triaged</button>
                <button className="adm-btn ghost sm" disabled={busy} onClick={() => setStatus(detail, "in_progress")}>In progress</button>
                <button className="adm-btn primary sm" disabled={busy} onClick={() => setStatus(detail, "resolved", "Resolved")}>Resolve</button>
                <button className="adm-btn danger sm" disabled={busy} onClick={() => setStatus(detail, "dismissed", "Dismissed")}>Dismiss</button>
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
