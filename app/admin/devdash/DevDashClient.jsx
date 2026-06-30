"use client";

import React, { useState } from "react";
import { Badge, ConfirmButton, useAdminAction } from "../_components/ui";
import { hasPerm } from "../../../lib/admin/nav.mjs";

function humanBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = b / 1024, i = 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}

// Trigger a client-side download of returned export content.
function download(filename, content, contentType) {
  const blob = new Blob([content ?? ""], { type: contentType || "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename || "export.txt";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export default function DevDashClient({ storage, thresholds, usage, actionLog, perms }) {
  const { run, busy } = useAdminAction();
  const canStorage = hasPerm(perms, "storage.manage");
  const canAudit = hasPerm(perms, "audit.read") || hasPerm(perms, "dev.console");
  const [thresholdInput, setThresholdInput] = useState({}); // tableName -> MB string

  const exportAudit = async (format) => {
    try {
      const res = await run("audit.export", { format }, { success: `Exported action log (${format})` });
      if (res?.content) download(res.filename, res.content, res.contentType);
    } catch { /* toast */ }
  };
  const exportTable = async (tableName, format) => {
    try {
      const res = await run("storage.export", { tableName, format }, { success: `Exported ${tableName}` });
      if (res?.content) download(res.filename, res.content, res.contentType);
    } catch { /* toast */ }
  };
  const setThreshold = (tableName) => {
    const mb = Number(thresholdInput[tableName]);
    if (!Number.isFinite(mb) || mb < 0) return;
    run("storage.setThreshold", { tableName, thresholdBytes: Math.floor(mb * 1024 * 1024) }, { success: `Threshold set for ${tableName}` }).catch(() => {});
  };
  const truncate = (tableName) =>
    run("storage.truncate", { tableName, confirm: true }, { success: `Truncated ${tableName}` }).catch(() => {});

  return (
    <>
      <div className="adm-pagehead">
        <p className="adm-eyebrow">Member platform · M8</p>
        <h2>Developer Dashboard</h2>
        <p>Cross-domain action log (exportable), hidden usage analytics, and per-table storage
          monitoring with developer-set thresholds. Threshold flags are non-blocking — the site and
          every feature keep working past a warning.</p>
      </div>

      {/* Action Log / Change History */}
      {actionLog && (
        <section className="adm-card">
          <div className="adm-toolbar" style={{ alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>Action Log / Change History</h3>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button className="adm-btn ghost sm" disabled={busy} onClick={() => exportAudit("json")}>Export JSON</button>
              <button className="adm-btn ghost sm" disabled={busy} onClick={() => exportAudit("csv")}>Export CSV</button>
            </div>
          </div>
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Summary</th></tr></thead>
              <tbody>
                {(actionLog.entries ?? []).map((e) => (
                  <tr key={e.id}>
                    <td style={{ fontSize: "0.78rem", color: "var(--adm-faint)" }}>{new Date(e.createdAt).toLocaleString()}</td>
                    <td style={{ fontSize: "0.8rem" }}>{e.actor?.email ?? "system"}</td>
                    <td><Badge tone="info">{e.action}</Badge></td>
                    <td style={{ fontSize: "0.8rem" }}>{e.entityType}</td>
                    <td style={{ fontSize: "0.82rem" }}>{e.summary}</td>
                  </tr>
                ))}
                {(actionLog.entries ?? []).length === 0 && <tr><td colSpan={5}><div className="adm-empty">No recent actions.</div></td></tr>}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: "0.78rem", color: "var(--adm-faint)", marginTop: 6 }}>Showing the 15 most recent. Export pulls up to 5000 matching the current filters (full filtering is in the Developer Console).</p>
        </section>
      )}

      {/* Usage analytics */}
      {usage && (
        <section className="adm-card" style={{ marginTop: 16 }}>
          <h3>Usage (last {usage.windowDays} days)</h3>
          <p style={{ color: "var(--adm-muted)" }}>{usage.totalVisits} recorded visits.</p>
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead><tr><th>Section</th><th style={{ textAlign: "right" }}>Visits</th></tr></thead>
              <tbody>
                {usage.bySection.map((s) => <tr key={s.key}><td>{s.key}</td><td style={{ textAlign: "right" }}>{s.count}</td></tr>)}
                {usage.bySection.length === 0 && <tr><td colSpan={2}><div className="adm-empty">No usage recorded yet.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Storage + thresholds */}
      {storage && (
        <section className="adm-card" style={{ marginTop: 16 }}>
          <h3>Table storage {storage.flagged?.length ? <Badge tone="warn">{storage.flagged.length} over threshold</Badge> : null}</h3>
          <p style={{ color: "var(--adm-muted)" }}>Total: {humanBytes(storage.totalBytes)}. Thresholds are non-blocking warnings.</p>
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead><tr><th>Table</th><th style={{ textAlign: "right" }}>Size</th><th>Threshold</th><th></th></tr></thead>
              <tbody>
                {(storage.rows ?? []).map((r) => (
                  <tr key={r.tableName} style={r.exceeded ? { background: "rgba(180,120,0,0.08)" } : undefined}>
                    <td><span className="adm-code">{r.tableName}</span> {r.exceeded && <Badge tone="warn">over</Badge>}</td>
                    <td style={{ textAlign: "right" }}>{humanBytes(r.bytes)}</td>
                    <td style={{ fontSize: "0.8rem" }}>{r.threshold != null ? humanBytes(r.threshold) : "—"}</td>
                    <td>
                      {canStorage && (
                        <div className="adm-actions" style={{ gap: 6, flexWrap: "wrap" }}>
                          <input className="adm-input" style={{ width: 70 }} placeholder="MB" value={thresholdInput[r.tableName] ?? ""} onChange={(e) => setThresholdInput({ ...thresholdInput, [r.tableName]: e.target.value })} />
                          <button className="adm-btn ghost sm" disabled={busy} onClick={() => setThreshold(r.tableName)}>Set</button>
                          <button className="adm-btn ghost sm" disabled={busy} onClick={() => exportTable(r.tableName, "json")}>Export</button>
                          <ConfirmButton className="adm-btn danger sm" confirm={`Truncate "${r.tableName}"? This is irreversible — export first. (Only allowlisted log tables can be truncated.)`} busy={busy} onConfirm={() => truncate(r.tableName)}>Truncate</ConfirmButton>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!actionLog && !usage && !storage && <div className="adm-empty">You don't have access to any developer-dashboard section.</div>}
    </>
  );
}
