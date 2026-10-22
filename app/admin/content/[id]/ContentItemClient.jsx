"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Field, useAdminAction } from "../../_components/ui";
import MediaPicker from "../../_components/MediaPicker";
import { hasPerm } from "../../../../lib/admin/nav.mjs";
import { statusTone, diffViews, buildDiffRows } from "../../../../lib/admin/view-models.mjs";
import { buildPayloadPatch, labelize } from "../../../../lib/cms/field-widgets.mjs";

// Format a stored timestamp for a date / datetime-local input, in LOCAL time.
// Slicing the ISO string instead would render UTC, which in IST (+5:30) shows the
// previous day for anything before 05:30 - the wrong day on an announcement window.
function toInputValue(widget, raw) {
  if (raw === null || raw === undefined || raw === "") return "";
  if (widget !== "date" && widget !== "datetime") return raw;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return widget === "date" ? day : `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Initial form value for one field, per widget.
function initialValue(descriptor, payload) {
  const raw = payload?.[descriptor.field];
  switch (descriptor.widget) {
    case "checkbox":
      return !!raw;
    case "json":
      // Pretty-printed so the advanced JSON box is readable rather than one long line.
      return raw == null ? "" : typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
    case "date":
    case "datetime":
      return toInputValue(descriptor.widget, raw);
    default:
      return raw ?? "";
  }
}

// Which disk-upload folder an image for this content type should land in (see
// lib/media/local-disk.mjs#UPLOAD_FOLDERS). Any other content type keeps uploading
// to Cloudinary (MediaPicker's default when no folder is passed).
const UPLOAD_FOLDER_BY_TYPE = { event: "events", announcement: "announcements", achievement: "wall-of-fame" };

export default function ContentItemClient({ data, fieldSpec, editorSpec, mediaAssets = {}, perms, achievement = null }) {
  const { item, contentType } = data;
  const { run, busy } = useAdminAction();
  const uploadFolder = UPLOAD_FOLDER_BY_TYPE[contentType] ?? null;

  // Every payload field, primary + advanced, in one flat list (the form state and
  // the save patch both cover all of them - "advanced" is a layout choice only).
  const descriptors = useMemo(
    () => [...(editorSpec?.primary ?? []), ...(editorSpec?.advanced ?? [])],
    [editorSpec]
  );

  // The editable draft view (draft if open, else the published one as a starting point).
  const base = data.draft ?? data.published ?? null;
  const [form, setForm] = useState(() => ({
    title: base?.title ?? "",
    summary: base?.summary ?? "",
    slug: item.slug ?? "",
    pinned: !!item.pinned,
    payload: Object.fromEntries(descriptors.map((d) => [d.field, initialValue(d, base?.payload)])),
  }));
  // Per-field inline errors (currently only a json widget that does not parse).
  const [fieldErrors, setFieldErrors] = useState({});

  const setPayloadField = (field, value) => {
    setForm((f) => ({ ...f, payload: { ...f.payload, [field]: value } }));
    setFieldErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  };

  const canEdit = hasPerm(perms, "content.update");
  const canPublish = hasPerm(perms, "content.publish");
  const canUnpublish = hasPerm(perms, "content.unpublish");
  const canArchive = hasPerm(perms, "content.archive");
  const canRestore = hasPerm(perms, "content.restore");

  const saveDraft = () => {
    // Date / datetime inputs give local wall-clock strings; the columns are
    // Timestamptz, so convert to a real instant before sending. An emptied field
    // becomes null (buildPayloadPatch) so a cleared value actually clears the column
    // - the old form dropped empty strings from the patch, which made a field that
    // had been set impossible to unset through the UI.
    const values = { ...form.payload };
    for (const d of descriptors) {
      if (d.widget !== "date" && d.widget !== "datetime") continue;
      const v = values[d.field];
      if (!v) continue;
      const parsed = new Date(v);
      values[d.field] = Number.isNaN(parsed.getTime()) ? v : parsed.toISOString();
    }

    let payload;
    try {
      payload = buildPayloadPatch(descriptors, values);
    } catch (e) {
      // A json widget that does not parse - show it inline instead of posting
      // malformed JSON and getting a 422 back.
      setFieldErrors((prev) => ({ ...prev, [e.field]: e.message }));
      return Promise.resolve();
    }

    return run(
      "content.edit",
      { itemId: item.id, patch: { title: form.title, summary: form.summary, slug: form.slug || null, pinned: form.pinned, payload } },
      { success: "Draft saved" }
    ).catch(() => {});
  };

  // One payload field, rendered as the widget its spec asks for.
  const renderWidget = (d) => {
    const value = form.payload[d.field];
    const label = (d.label ?? labelize(d.field)) + (d.required ? " *" : "");
    const common = { className: "adm-input", value: value ?? "", onChange: (e) => setPayloadField(d.field, e.target.value) };

    let control;
    switch (d.widget) {
      case "textarea":
        control = <textarea className="adm-textarea" rows={d.rows ?? 5} value={value ?? ""} onChange={(e) => setPayloadField(d.field, e.target.value)} />;
        break;
      case "json":
        control = <textarea className="adm-textarea" rows={8} spellCheck={false} style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.78rem" }} value={value ?? ""} onChange={(e) => setPayloadField(d.field, e.target.value)} />;
        break;
      case "select":
        control = (
          <select className="adm-select" value={value ?? ""} onChange={(e) => setPayloadField(d.field, e.target.value)}>
            {/* No blank option for a NOT NULL column (with or without a default) —
                there is no value the form could send for it. */}
            {!(d.required || d.notNull) && <option value="">-</option>}
            {(d.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        );
        break;
      case "checkbox":
        // The label sits beside the box for a checkbox, so Field gets no label.
        return (
          <Field key={d.field} error={fieldErrors[d.field]}>
            <label className="adm-check">
              <input type="checkbox" checked={!!value} onChange={(e) => setPayloadField(d.field, e.target.checked)} /> {d.label ?? labelize(d.field)}
            </label>
            {d.help && <span className="adm-field-help">{d.help}</span>}
          </Field>
        );
      case "date":
        control = <input type="date" placeholder="YYYY-MM-DD" {...common} />;
        break;
      case "datetime":
        control = <input type="datetime-local" placeholder="YYYY-MM-DD HH:MM" {...common} />;
        break;
      case "media":
        control = (
          <MediaPicker
            value={value || null}
            asset={mediaAssets[d.field] ?? null}
            onChange={(id) => setPayloadField(d.field, id ?? "")}
            folder={uploadFolder}
          />
        );
        break;
      default:
        control = <input {...common} />;
    }

    // A browser's native date/datetime-local picker UI varies and often ignores
    // `placeholder`, so the format is also spelled out as a visible hint — the
    // "prescribed format for reference" the editor asked for.
    const formatHint =
      d.widget === "date" ? "Format: YYYY-MM-DD (e.g. 2026-03-15)" : d.widget === "datetime" ? "Format: YYYY-MM-DD HH:MM, 24-hour (e.g. 2026-03-15 18:30)" : null;

    return (
      <Field key={d.field} label={label} error={fieldErrors[d.field]}>
        {control}
        {formatHint && <span className="adm-field-help">{formatHint}</span>}
        {d.help && <span className="adm-field-help">{d.help}</span>}
      </Field>
    );
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
            {(editorSpec?.primary ?? []).map(renderWidget)}
            {(fieldSpec?.lists ?? []).length > 0 && (
              <p className="adm-banner info">List fields ({fieldSpec.lists.map((l) => l.key).join(", ")}) are edited via the importer / API in this version.</p>
            )}
            {/* Fields an editor rarely touches - schedule windows, raw JSON blocks.
                Hidden, never removed: the data stays reachable through the UI. */}
            {(editorSpec?.advanced ?? []).length > 0 && (
              <details className="adm-advanced">
                <summary>Advanced ({editorSpec.advanced.length})</summary>
                {editorSpec.advanced.map(renderWidget)}
              </details>
            )}
          </div>
        )}
      </div>

      {contentType === "achievement" && achievement && (
        <AchievementCredits itemId={item.id} initialCredits={achievement.credits ?? []} unitOptions={achievement.unitOptions ?? []} canEdit={canEdit} run={run} busy={busy} />
      )}

      <VersionHistory revisions={data.revisions} canRestore={canRestore} itemId={item.id} run={run} busy={busy} />
    </>
  );
}

// Wall-of-Fame CREDITS editor (Session 14, DL-101) — the previously API/CLI-only
// achievement.credits.set, now with a UI. Credits a Wall-of-Fame entry to members
// (by email) and/or clubs (by lineage). "Save credits" REPLACES the full set (the
// service is a bulk idempotent replace), so the on-screen list is the source of truth.
function AchievementCredits({ itemId, initialCredits, unitOptions, canEdit, run, busy }) {
  const unitByLineage = useMemo(() => new Map(unitOptions.map((u) => [u.lineageKey, u.name])), [unitOptions]);
  // Normalize loaded credits into the local editable rows.
  const [rows, setRows] = useState(() =>
    (initialCredits ?? []).map((c) => ({
      kind: c.kind, // 'user' | 'club'
      email: c.userEmail ?? "",
      userId: c.userId ?? null,
      orgUnitLineageKey: c.orgUnitLineageKey ?? "",
      label: c.kind === "user" ? (c.userName || c.userEmail || "member") : (unitByLineage.get(c.orgUnitLineageKey) || "club"),
      role: c.role ?? "",
    }))
  );
  // Add-form state.
  const [kind, setKind] = useState("user");
  const [email, setEmail] = useState("");
  const [lineageKey, setLineageKey] = useState(unitOptions[0]?.lineageKey ?? "");
  const [role, setRole] = useState("");

  const addRow = () => {
    if (kind === "user") {
      const e = email.trim();
      if (!e) return;
      setRows((prev) => [...prev, { kind: "user", email: e, userId: null, orgUnitLineageKey: "", label: e, role: role.trim() }]);
      setEmail("");
    } else {
      if (!lineageKey) return;
      setRows((prev) => [...prev, { kind: "club", email: "", userId: null, orgUnitLineageKey: lineageKey, label: unitByLineage.get(lineageKey) || "club", role: role.trim() }]);
    }
    setRole("");
  };
  const removeRow = (i) => setRows((prev) => prev.filter((_, idx) => idx !== i));

  const save = () => {
    const credits = rows.map((r, i) => ({
      ...(r.kind === "user" ? (r.userId ? { userId: r.userId } : { email: r.email }) : { orgUnitLineageKey: r.orgUnitLineageKey }),
      role: r.role || undefined,
      sortOrder: i,
    }));
    run("achievement.credits.set", { itemId, credits }, { success: "Wall-of-Fame credits saved." }).catch(() => {});
  };

  return (
    <div className="adm-section adm-card">
      <div className="adm-section-head"><h3>Wall of Fame credits</h3></div>
      <p className="adm-muted" style={{ marginTop: 0 }}>Credit this achievement to members (by email) and/or clubs. These appear on the public Wall of Fame and in member/club profiles.</p>
      {!canEdit ? (
        <p className="adm-empty">You don&apos;t have permission to edit credits (needs content.update).</p>
      ) : (
        <>
          <div className="adm-tablewrap">
            <table className="adm-table">
              <thead><tr><th>Type</th><th>Credited</th><th>Role</th><th></th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><Badge tone={r.kind === "user" ? "info" : "good"}>{r.kind === "user" ? "Member" : "Club"}</Badge></td>
                    <td>{r.label}{r.kind === "club" && !unitByLineage.has(r.orgUnitLineageKey) ? <span className="adm-code"> {r.orgUnitLineageKey}</span> : null}</td>
                    <td>{r.role || "—"}</td>
                    <td><button className="adm-btn ghost sm" disabled={busy} onClick={() => removeRow(i)}>Remove</button></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={4}><div className="adm-empty">No credits yet.</div></td></tr>}
              </tbody>
            </table>
          </div>

          <div className="adm-toolbar" style={{ marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
            <Field label="Credit a">
              <select className="adm-select" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="user">Member (email)</option>
                <option value="club">Club / council</option>
              </select>
            </Field>
            {kind === "user" ? (
              <Field label="Member email">
                <input className="adm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@iitjammu.ac.in" />
              </Field>
            ) : (
              <Field label="Club / council">
                {unitOptions.length ? (
                  <select className="adm-select" value={lineageKey} onChange={(e) => setLineageKey(e.target.value)}>
                    {unitOptions.map((u) => <option key={u.lineageKey} value={u.lineageKey}>{u.name}{u.typeName ? ` (${u.typeName})` : ""}</option>)}
                  </select>
                ) : (
                  <input className="adm-input" value={lineageKey} onChange={(e) => setLineageKey(e.target.value)} placeholder="org-unit lineage key" />
                )}
              </Field>
            )}
            <Field label="Role (optional)">
              <input className="adm-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Winner, Organizing club" />
            </Field>
            <button className="adm-btn ghost" disabled={busy} onClick={addRow}>Add</button>
          </div>

          <div style={{ marginTop: 12 }}>
            <button className="adm-btn primary" disabled={busy} onClick={save}>Save credits</button>
          </div>
        </>
      )}
    </div>
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
