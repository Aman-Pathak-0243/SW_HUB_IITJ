// Presentational helpers usable from Server Components (no hooks, no "use client").
// The interactive Badge/Modal/etc. live in ui.jsx (client); these are static markup
// shared by the server-rendered pages.
import React from "react";

export function PageHead({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="adm-section-head" style={{ marginBottom: 22 }}>
      <div className="adm-pagehead" style={{ marginBottom: 0 }}>
        {eyebrow && <p className="adm-eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="adm-actions">{actions}</div>}
    </div>
  );
}

// Static badge (server-safe). Tone matches the .adm-badge.<tone> CSS classes.
export function SBadge({ tone = "neutral", children }) {
  return <span className={`adm-badge ${tone}`}>{children}</span>;
}

export function ModuleDenied({ module = "this module" }) {
  return (
    <>
      <PageHead title="No access" subtitle={`Your roles don't grant access to ${module}.`} />
      <div className="adm-card">
        <p>Ask a portal administrator to grant you a role that includes the relevant permissions.</p>
      </div>
    </>
  );
}

export function EmptyState({ children }) {
  return <div className="adm-empty">{children}</div>;
}
