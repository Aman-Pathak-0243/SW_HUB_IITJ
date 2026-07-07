"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Modal, Field, useAdminAction } from "../_components/ui";
import { hasPerm } from "../../../lib/admin/nav.mjs";
import { validateMediaForm, MEDIA_KINDS } from "../../../lib/admin/forms.mjs";
import { humanBytes } from "../../../lib/admin/view-models.mjs";

export default function MediaClient({ assets, migration, perms, filter }) {
  const router = useRouter();
  const { run, busy } = useAdminAction();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  const canUpload = hasPerm(perms, "media.upload");
  const canUpdate = hasPerm(perms, "media.update");
  const canDelete = hasPerm(perms, "media.delete");

  const setFilter = (patch) => {
    const next = { ...filter, ...patch };
    const qs = new URLSearchParams();
    if (next.archived) qs.set("archived", "1");
    if (next.kind) qs.set("kind", next.kind);
    if (next.q) qs.set("q", next.q);
    router.push(`/admin/media${qs.toString() ? `?${qs}` : ""}`);
  };

  const archive = (a) => window.confirm("Archive this media asset?") && run("media.archive", { id: a.id }, { success: "Archived" }).catch(() => {});

  return (
    <>
      <div className="adm-section-head" style={{ marginBottom: 22 }}>
        <div className="adm-pagehead" style={{ marginBottom: 0 }}>
          <p className="adm-eyebrow">Media library</p><h2>Media</h2>
          <p>{assets.length} asset{assets.length === 1 ? "" : "s"} · images, PDFs, logos &amp; avatars.</p>
        </div>
        {canUpload && <button className="adm-btn primary" onClick={() => setCreating(true)}>+ Register media</button>}
      </div>

      {migration && (
        <div className={`adm-banner ${migration.fullyMigrated ? "info" : "warn"}`}>
          Migration: {migration.counts.pendingPublic} /public pending · {migration.counts.base64Pending} base64 pending · {migration.counts.alreadyMigrated} on Cloudinary
          {migration.fullyMigrated ? " — fully migrated." : " — run `npm run db:migrate:media -- --apply` (operator)."}
        </div>
      )}

      <div className="adm-toolbar">
        <input className="adm-input" style={{ maxWidth: 220 }} placeholder="Search url / alt…" defaultValue={filter.q} onKeyDown={(e) => e.key === "Enter" && setFilter({ q: e.target.value })} />
        <select className="adm-select" style={{ maxWidth: 160 }} value={filter.kind} onChange={(e) => setFilter({ kind: e.target.value })}>
          <option value="">All kinds</option>{MEDIA_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <label className="adm-check"><input type="checkbox" checked={filter.archived} onChange={(e) => setFilter({ archived: e.target.checked })} /> Show archived</label>
      </div>

      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead><tr><th>Preview</th><th>Kind</th><th>Provider</th><th>Alt / URL</th><th>Size</th><th></th></tr></thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id}>
                <td style={{ width: 64 }}>
                  {a.kind === "image" && a.deliveryUrl
                    ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={a.deliveryUrl} alt={a.altText ?? ""} style={{ width: 48, height: 36, objectFit: "cover", borderRadius: 6, background: "#eee" }} />
                    : <span className="adm-code">{a.kind}</span>}
                </td>
                <td><Badge tone="neutral">{a.kind}</Badge>{a.archivedAt && <Badge tone="muted">archived</Badge>}</td>
                <td>{a.storageProvider}{a.migratedAt && <Badge tone="good">migrated</Badge>}</td>
                <td style={{ maxWidth: 320 }}><div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><a className="adm-btn link" href={a.deliveryUrl} target="_blank" rel="noreferrer">{a.altText || a.url}</a></div></td>
                <td style={{ color: "var(--adm-muted)" }}>{humanBytes(a.bytes)}</td>
                <td>
                  <div className="adm-actions">
                    {canUpdate && <button className="adm-btn ghost sm" onClick={() => setEditing(a)}>Edit</button>}
                    {canDelete && !a.archivedAt && <button className="adm-btn danger sm" disabled={busy} onClick={() => archive(a)}>Archive</button>}
                  </div>
                </td>
              </tr>
            ))}
            {assets.length === 0 && <tr><td colSpan={6}><div className="adm-empty">No media assets.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {creating && <MediaModal title="Register media" isCreate onClose={() => setCreating(false)} run={run} busy={busy} />}
      {editing && <MediaModal title="Edit metadata" asset={editing} onClose={() => setEditing(null)} run={run} busy={busy} />}
    </>
  );
}

function MediaModal({ title, asset, isCreate, onClose, run, busy }) {
  const [form, setForm] = useState({
    url: asset?.url ?? "", kind: asset?.kind ?? "image",
    storageProvider: asset?.storageProvider ?? "external", altText: asset?.altText ?? "",
  });
  const [errors, setErrors] = useState({});
  const submit = async () => {
    if (isCreate) {
      const v = validateMediaForm(form);
      setErrors(v.errors);
      if (!v.ok) return;
      try { await run("media.create", { input: v.value }, { success: "Media registered" }); onClose(); } catch {}
    } else {
      try { await run("media.update", { id: asset.id, patch: { altText: form.altText, kind: form.kind } }, { success: "Metadata updated" }); onClose(); } catch {}
    }
  };
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="adm-btn ghost" onClick={onClose}>Cancel</button>
      <button className="adm-btn primary" onClick={submit} disabled={busy}>{isCreate ? "Register" : "Save"}</button>
    </>}>
      <div className="adm-form">
        {isCreate ? (
          <>
            <Field label="URL" error={errors.url}><input className="adm-input" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://res.cloudinary.com/…" /></Field>
            <Field label="Storage provider" error={errors.storageProvider}>
              <select className="adm-select" value={form.storageProvider} onChange={(e) => setForm({ ...form, storageProvider: e.target.value })}>
                <option value="external">external</option><option value="cloudinary">cloudinary</option><option value="local">local</option>
              </select>
            </Field>
          </>
        ) : (
          <p className="adm-banner info">Storage/Cloudinary fields are migration-owned — only metadata is editable here.</p>
        )}
        <Field label="Kind" error={errors.kind}><select className="adm-select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{MEDIA_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></Field>
        <Field label="Alt text"><input className="adm-input" value={form.altText} onChange={(e) => setForm({ ...form, altText: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
