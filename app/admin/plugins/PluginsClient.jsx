"use client";

import React from "react";
import { Badge, useAdminAction } from "../_components/ui";

// Developer-controlled plugin toggles. Turning `member_platform` on activates the
// Session 11+ features; off restores the Sessions 1–10 behavior. Only a developer
// can toggle (the switch is disabled otherwise; the server also enforces it).
export default function PluginsClient({ flags, viewerIsDeveloper }) {
  const { run, busy } = useAdminAction();

  const toggle = (flag) =>
    run(
      "plugin.set",
      { key: flag.key, enabled: !flag.enabled },
      { success: `${flag.name} ${!flag.enabled ? "enabled" : "disabled"}` }
    ).catch(() => {});

  return (
    <>
      <div className="adm-pagehead">
        <p className="adm-eyebrow">Platform</p>
        <h2>Plugins</h2>
        <p>
          Feature flags that gate optional modules. The <strong>Member Platform</strong> plugin
          activates the Session 11+ features (member sign-in, account/password-reset requests,
          forced first-login password change). Toggling is <strong>developer-only</strong>.
        </p>
      </div>

      {!viewerIsDeveloper && (
        <p className="adm-banner info">
          You can view plugin state, but only a <strong>developer</strong> can turn a plugin on or off.
        </p>
      )}

      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead>
            <tr><th>Plugin</th><th>State</th><th>Last changed</th><th></th></tr>
          </thead>
          <tbody>
            {flags.map((f) => (
              <tr key={f.key}>
                <td>
                  <div style={{ fontWeight: 600 }}>{f.name} <span className="adm-code">{f.key}</span></div>
                  {f.description && <div style={{ fontSize: "0.8rem", color: "var(--adm-muted)", marginTop: 3 }}>{f.description}</div>}
                </td>
                <td><Badge tone={f.enabled ? "good" : "muted"}>{f.enabled ? "ON" : "OFF"}</Badge></td>
                <td style={{ fontSize: "0.8rem", color: "var(--adm-faint)" }}>
                  {f.updatedAt ? new Date(f.updatedAt).toLocaleString() : "—"}
                  {f.updatedByEmail ? <div>{f.updatedByEmail}</div> : null}
                </td>
                <td>
                  <button
                    className={`adm-btn sm ${f.enabled ? "danger" : "primary"}`}
                    disabled={busy || !viewerIsDeveloper}
                    title={viewerIsDeveloper ? "" : "Developer-only"}
                    onClick={() => toggle(f)}
                  >
                    {f.enabled ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
            {flags.length === 0 && <tr><td colSpan={4}><div className="adm-empty">No plugins registered.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
