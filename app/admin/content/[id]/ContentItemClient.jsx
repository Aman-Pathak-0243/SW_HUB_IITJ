"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Field, useAdminAction } from "../../_components/ui";
import { hasPerm } from "../../../../lib/admin/nav.mjs";
import { statusTone, diffViews, buildDiffRows } from "../../../../lib/admin/view-models.mjs";

// Pretty field label: camelCase → "Camel case".
const labelize = (f) => f.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

export default function ContentItemClient({ data, fieldSpec, perms }) {
  const { item, contentType } = data;
  const { run, busy } = useAdminAction();

  // The editable draft view (draft if open, else the published one as a starting point).
  const base = data.draft ?? data.published ?? null;
  const [form, setForm] = useState(() => ({
    title: base?.title ?? "",
    summary: base?.summary ?? "",
    slug: item.slug ?? "",
    pinned: !!item.pinned,
    payload: Object.fromEntries((fieldSpec?.scalarFields ?? []).map((f) => [f, base?.payload?.[f] ?? ""])),
  }));

  const canEdit = hasPerm(perms, "content.update");
  const canPublish = hasPerm(perms, "content.publish");
  const canUnpublish = hasPerm(perms, "content.unpublish");
  const canArchive = hasPerm(perms, "content.archive");
  const canRestore = hasPerm(perms, "content.restore");

  const saveDraft = () => {
    const payload = {};
    for (const f of fieldSpec?.scalarFields ?? []) {
      const v = form.payload[f];
      if (v !== "" && v !== undefined) payload[f] = v;
    }
    return run(
      "content.edit",
      { itemId: item.id, patch: { title: form.title, summary: form.summary, slug: form.slug || null, pinned: form.pinned, payload } },
      { success: "Draft saved" }
    ).catch(() => {});
  };

  return (
    <>
      <div className="adm-section-head" style={{ marginBottom: 18 }}>
        <div className="adm-pagehead" style={{ marginBottom: 0 }}>
          <p className="adm-eyebrow">{fieldSpec?.label ?? contentType}</p>
          <h2>{form.title || "(untitled)"}</h2>
          <p><Badge tone={statusTone(item.status)}>{item.status}</Badge> {item.slug && <span className="adm-code">/{item.slug}</span>}</p>
        </div>
        <Link className="adm-btn ghost" href="/admin/content">← All content</Link>
      </div>

      {/* Lifecycle actions */}
      <div className="adm-toolbar">
        {canEdit && <button className="adm-btn primary" disabled={busy} onClick={saveDraft}>Save draft</button>}
        {canPublish && item.draftRevisionId && (
          <button className="adm-btn ghost" disabled={busy} onClick={() => run("content.publish", { itemId: item.id }, { success: "Published" }).catch(() => {})}>Publish draft</button>
        )}
        {canUnpublish && item.publishedRevisionId && (
          <button className="adm-btn ghost" disabled={busy} onClick={() => run("content.unpublish", { itemId: item.id }, { success: "Unpublished" }).catch(() => {})}>Unpublish</button>
        )}
        {canArchive && item.status !== "archived" && (
          <button className="adm-btn danger" disabled={busy} onClick={() => window.confirm("Archive this content?") && run("content.archive", { itemId: item.id }, { success: "Archived" }).catch(() => {})}>Archive</button>
        )}
      </div>

      <div className="adm-section adm-card">
        <h3 style={{ marginBottom: 14 }}>Draft</h3>
        {!canEdit ? (
          <p className="adm-empty">You don't have permission to edit this content.</p>
        ) : (
          <div className="adm-form">
            <Field label="Title"><input className="adm-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Summary"><textarea className="adm-textarea" value={form.summary ?? ""} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <Field label="Slug"><input className="adm-input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Field>
              <label className="adm-check" style={{ alignSelf: "flex-end", paddingBottom: 10 }}>
                <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Pinned
              </label>
            </div>
            {(fieldSpec?.scalarFields ?? []).map((f) => (
              <Field key={f} label={labelize(f) + (fieldSpec.requiredFields.includes(f) ? " *" : "")}>
                <input className="adm-input" value={form.payload[f] ?? ""} onChange={(e) => setForm({ ...form, payload: { ...form.payload, [f]: e.target.value } })} />
              </Field>
            ))}
            {(fieldSpec?.lists ?? []).length > 0 && (
              <p className="adm-banner info">List fields ({fieldSpec.lists.map((l) => l.key).join(", ")}) are edited via the importer / API in this version.</p>
            )}
          </div>
        )}
      </div>

      <VersionHistory revisions={data.revisions} canRestore={canRestore} itemId={item.id} run={run} busy={busy} />
    </>
  );
}

function VersionHistory({ revisions, canRestore, itemId, run, busy }) {
  const [a, setA] = useState(revisions[Math.max(0, revisions.length - 2)]?.id ?? "");
  const [b, setB] = useState(revisions[revisions.length - 1]?.id ?? "");

  const diffRows = useMemo(() => {
    if (!a || !b || a === b) return null;
    const va = revisions.find((r) => r.id === a)?.view;
    const vb = revisions.find((r) => r.id === b)?.view;
    if (!va || !vb) return null;
    return buildDiffRows(diffViews(va, vb));
  }, [a, b, revisions]);

  return (
    <div className="adm-section">
      <div className="adm-section-head"><h3>Version history</h3></div>
      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead><tr><th>#</th><th>Status</th><th>Title</th><th>Change note</th><th>When</th><th></th></tr></thead>
          <tbody>
            {revisions.slice().reverse().map((r) => (
              <tr key={r.id}>
                <td>{r.revisionNo}</td>
                <td><Badge tone={r.revisionStatus === "published" ? "good" : r.revisionStatus === "draft" ? "info" : "muted"}>{r.revisionStatus}</Badge></td>
                <td>{r.title}</td>
                <td style={{ color: "var(--adm-muted)" }}>{r.changeNote ?? (r.isRestoreOfRevisionId ? "(restore)" : "—")}</td>
                <td style={{ color: "var(--adm-faint)", fontSize: "0.78rem" }}>{new Date(r.createdAt).toLocaleString()}</td>
                <td>
                  {canRestore && (
                    <button className="adm-btn ghost sm" disabled={busy} onClick={() => window.confirm(`Restore revision ${r.revisionNo} into the open draft?`) && run("content.restore", { itemId, sourceRevisionId: r.id }, { success: `Restored revision ${r.revisionNo}` }).catch(() => {})}>Restore</button>
                  )}
                </td>
              </tr>
            ))}
            {revisions.length === 0 && <tr><td colSpan={6}><div className="adm-empty">No revisions.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {revisions.length >= 2 && (
        <div className="adm-card" style={{ marginTop: 16 }}>
          <div className="adm-section-head"><h3 style={{ fontSize: "0.95rem" }}>Compare revisions</h3></div>
          <div className="adm-toolbar">
            <select className="adm-select" style={{ maxWidth: 200 }} value={a} onChange={(e) => setA(e.target.value)}>
              {revisions.map((r) => <option key={r.id} value={r.id}>#{r.revisionNo} · {r.revisionStatus}</option>)}
            </select>
            <span>→</span>
            <select className="adm-select" style={{ maxWidth: 200 }} value={b} onChange={(e) => setB(e.target.value)}>
              {revisions.map((r) => <option key={r.id} value={r.id}>#{r.revisionNo} · {r.revisionStatus}</option>)}
            </select>
          </div>
          {diffRows == null ? (
            <p className="adm-empty">Pick two different revisions to compare.</p>
          ) : diffRows.length === 0 ? (
            <p className="adm-empty">No differences between these revisions.</p>
          ) : (
            <table className="adm-table">
              <thead><tr><th>Field</th><th>From</th><th>To</th></tr></thead>
              <tbody>
                {diffRows.map((d) => (
                  <tr key={d.field}><td><b>{d.field}</b></td><td style={{ color: "var(--adm-muted)" }}>{d.from}</td><td>{d.to}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
