"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Modal, Field, useAdminAction, useToast, callAdmin } from "../_components/ui";
import { hasPerm } from "../../../lib/admin/nav.mjs";
import { validateContentForm } from "../../../lib/admin/forms.mjs";
import { availableContentActions } from "../../../lib/admin/view-models.mjs";

const ACTION_LABELS = { publish: "Publish", unpublish: "Unpublish", archive: "Archive" };

export default function ContentClient({ rows, perms, currentYear, typeOptions, filter }) {
  const router = useRouter();
  const toast = useToast();
  const { run, busy } = useAdminAction();
  const [creating, setCreating] = useState(false);

  const canCreate = hasPerm(perms, "content.create");

  const setFilter = (patch) => {
    const next = { ...filter, ...patch };
    const qs = new URLSearchParams();
    if (next.includeArchived) qs.set("archived", "1");
    if (next.type) qs.set("type", next.type);
    router.push(`/admin/content${qs.toString() ? `?${qs}` : ""}`);
  };

  const doAction = (row, action) =>
    run(`content.${action}`, { itemId: row.id }, { success: `${ACTION_LABELS[action]}ed "${row.title}"` }).catch(() => {});

  return (
    <>
      <div className="adm-section-head" style={{ marginBottom: 22 }}>
        <div className="adm-pagehead" style={{ marginBottom: 0 }}>
          <p className="adm-eyebrow">Content</p>
          <h2>Content</h2>
          <p>
            {currentYear ? `Current year ${currentYear.label}` : "No current year set"} ·{" "}
            {rows.length} item{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        {canCreate && currentYear && (
          <button className="adm-btn primary" onClick={() => setCreating(true)}>+ New content</button>
        )}
      </div>

      {!currentYear && <div className="adm-banner warn">No academic year is set as current — set one in Academic Years before creating content.</div>}

      <div className="adm-toolbar">
        <select className="adm-select" style={{ maxWidth: 220 }} value={filter.type} onChange={(e) => setFilter({ type: e.target.value })}>
          <option value="">All content types</option>
          {typeOptions.map((t) => (
            <option key={t.contentType} value={t.contentType}>{t.label}</option>
          ))}
        </select>
        <label className="adm-check">
          <input type="checkbox" checked={filter.includeArchived} onChange={(e) => setFilter({ includeArchived: e.target.checked })} />
          Show archived
        </label>
      </div>

      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Title</th><th>Type</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link className="adm-btn link" href={`/admin/content/${r.id}`}>{r.title}</Link>
                  {r.pinned && <Badge tone="warn">pinned</Badge>}
                  {r.slug && <span className="adm-code" style={{ marginLeft: 8 }}>/{r.slug}</span>}
                </td>
                <td>{r.typeLabel}</td>
                <td><Badge tone={r.statusTone}>{r.status}</Badge>{r.hasDraft && r.status !== "draft" && <Badge tone="info">draft open</Badge>}</td>
                <td>
                  <div className="adm-actions">
                    <Link className="adm-btn ghost sm" href={`/admin/content/${r.id}`}>Open</Link>
                    {availableContentActions(r).filter((a) => ACTION_LABELS[a]).map((a) => (
                      <button key={a} className="adm-btn ghost sm" disabled={busy} onClick={() => doAction(r, a)}>{ACTION_LABELS[a]}</button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4}><div className="adm-empty">No content {filter.type ? "of this type " : ""}in this year yet.</div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateContentModal
          typeOptions={typeOptions}
          currentYear={currentYear}
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); router.push(`/admin/content/${id}`); }}
          toast={toast}
        />
      )}
    </>
  );
}

function CreateContentModal({ typeOptions, currentYear, onClose, onCreated, toast }) {
  const [form, setForm] = useState({ contentType: "", title: "", slug: "", summary: "", pinned: false, orgUnitId: "" });
  const [payload, setPayload] = useState({}); // required payload fields for the chosen type
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const selected = typeOptions.find((t) => t.contentType === form.contentType);
  const requiredFields = selected?.requiredFields ?? [];
  const labelize = (f) => f.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

  const submit = async () => {
    const v = validateContentForm(form, { isCreate: true });
    const errs = { ...v.errors };
    if (selected?.isOrgBound && !form.orgUnitId) errs.orgUnitId = "This content type must be bound to an org unit id.";
    // Required payload fields (e.g. announcement.body, resource.resourceKind) must
    // be provided or the NOT-NULL payload column rejects the create.
    for (const f of requiredFields) if (!String(payload[f] ?? "").trim()) errs[`payload.${f}`] = `${labelize(f)} is required.`;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const cleanPayload = {};
      for (const f of requiredFields) cleanPayload[f] = payload[f];
      const input = {
        contentType: v.value.contentType,
        academicYearId: currentYear.id,
        title: v.value.title,
        slug: v.value.slug,
        summary: v.value.summary,
        pinned: v.value.pinned,
        ...(selected?.isOrgBound ? { orgUnitId: form.orgUnitId } : {}),
        payload: cleanPayload,
      };
      const res = await callAdmin("content.create", { input });
      toast("Draft created", "success");
      onCreated(res.item.id);
    } catch (e) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New content"
      onClose={onClose}
      footer={<>
        <button className="adm-btn ghost" onClick={onClose}>Cancel</button>
        <button className="adm-btn primary" onClick={submit} disabled={busy}>Create draft</button>
      </>}
    >
      <div className="adm-form">
        <Field label="Content type" error={errors.contentType}>
          <select className="adm-select" value={form.contentType} onChange={(e) => setForm({ ...form, contentType: e.target.value })}>
            <option value="">Choose…</option>
            {typeOptions.map((t) => <option key={t.contentType} value={t.contentType}>{t.label}{t.isOrgBound ? " (org-bound)" : ""}</option>)}
          </select>
        </Field>
        <Field label="Title" error={errors.title}>
          <input className="adm-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Slug (optional)" error={errors.slug}>
          <input className="adm-input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="e.g. annual-fest-2026" />
        </Field>
        {selected?.isOrgBound && (
          <Field label="Org unit id (required for this type)" error={errors.orgUnitId}>
            <input className="adm-input" value={form.orgUnitId} onChange={(e) => setForm({ ...form, orgUnitId: e.target.value })} placeholder="org_unit UUID (see Organization)" />
          </Field>
        )}
        {requiredFields.map((f) => (
          <Field key={f} label={`${labelize(f)} *`} error={errors[`payload.${f}`]}>
            <input className="adm-input" value={payload[f] ?? ""} onChange={(e) => setPayload({ ...payload, [f]: e.target.value })} />
          </Field>
        ))}
        <Field label="Summary">
          <textarea className="adm-textarea" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </Field>
        <label className="adm-check"><input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} /> Pinned</label>
      </div>
    </Modal>
  );
}
