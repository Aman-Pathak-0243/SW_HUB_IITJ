"use client";

import React, { useState } from "react";
import { Badge, Modal, Field, useAdminAction } from "../_components/ui";
import { hasPerm } from "../../../lib/admin/nav.mjs";
import { statusTone } from "../../../lib/admin/view-models.mjs";

const PERSON_TYPES = ["faculty", "student", "staff", "external"];

export default function OrgClient({ year, units, positions, people, types, rosterByUnit, perms }) {
  const { run, busy } = useAdminAction();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [roster, setRoster] = useState(null); // unit object
  const [personModal, setPersonModal] = useState(null); // { mode:'create'|'edit', person? }

  const canCreate = hasPerm(perms, "org_unit.create");
  const canUpdate = hasPerm(perms, "org_unit.update");
  const canArchive = hasPerm(perms, "org_unit.archive");
  const canManagePeople = hasPerm(perms, "appointment.create") || hasPerm(perms, "appointment.update");
  const canRemovePeople = hasPerm(perms, "appointment.archive");
  const removePerson = (p) =>
    window.confirm(`Remove ${p.fullName} from the directory? (Blocked if they still hold appointments — remove those first.)`) &&
    run("org.person.archive", { id: p.id }, { success: `Removed ${p.fullName}` }).catch(() => {});

  const publish = (u) => run("org.unit.publish", { id: u.id }, { success: `Published ${u.name}` }).catch(() => {});
  const archive = (u) => window.confirm(`Archive ${u.name}?`) && run("org.unit.archive", { id: u.id }, { success: `Archived ${u.name}` }).catch(() => {});

  // Move a club from one council to another (reparent). The service reuses org.unit.edit
  // (patch.parentId); the DB hierarchy guard enforces council→club, so an invalid parent
  // is rejected with a friendly error.
  const councils = units.filter((u) => u.typeKey === "council" && u.status !== "archived");
  const moveClub = (club, councilId) => {
    if (!councilId || councilId === club.parentId) return;
    const dest = councils.find((c) => c.id === councilId);
    run("org.unit.edit", { id: club.id, patch: { parentId: councilId } }, { success: `Moved ${club.name} → ${dest?.name ?? "council"}` }).catch(() => {});
  };

  return (
    <>
      <div className="adm-section-head" style={{ marginBottom: 22 }}>
        <div className="adm-pagehead" style={{ marginBottom: 0 }}>
          <p className="adm-eyebrow">Structure &amp; roster</p><h2>Organization</h2>
          <p>{year ? `Current year ${year.label}` : "No current year set"} · {units.length} unit{units.length === 1 ? "" : "s"}</p>
        </div>
        {canCreate && year && <button className="adm-btn primary" onClick={() => setCreating(true)}>+ New unit</button>}
      </div>

      {!year && <div className="adm-banner warn">No academic year is set as current — set one before managing structure.</div>}

      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead><tr><th>Unit</th><th>Type</th><th>Status</th><th>Roster</th><th></th></tr></thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.id}>
                <td>{u.name} {u.parentId && <Badge tone="neutral">child</Badge>} {u.slug && <span className="adm-code">/{u.slug}</span>}</td>
                <td>{u.typeName}</td>
                <td><Badge tone={statusTone(u.status)}>{u.status}</Badge></td>
                <td><button className="adm-btn link" onClick={() => setRoster(u)}>{(rosterByUnit[u.id] ?? []).length} appointment(s)</button></td>
                <td>
                  <div className="adm-actions">
                    {canUpdate && u.typeKey === "club" && councils.length > 0 && (
                      <select className="adm-select" style={{ maxWidth: 170 }} value={u.parentId ?? ""} disabled={busy}
                        onChange={(e) => moveClub(u, e.target.value)} title="Move this club to another council">
                        <option value="" disabled>Move to council…</option>
                        {councils.map((c) => <option key={c.id} value={c.id}>{c.name}{c.id === u.parentId ? " (current)" : ""}</option>)}
                      </select>
                    )}
                    {canUpdate && <button className="adm-btn ghost sm" onClick={() => setEditing(u)}>Edit</button>}
                    {canUpdate && u.status !== "published" && <button className="adm-btn ghost sm" disabled={busy} onClick={() => publish(u)}>Publish</button>}
                    {canArchive && u.status !== "archived" && <button className="adm-btn danger sm" disabled={busy} onClick={() => archive(u)}>Archive</button>}
                  </div>
                </td>
              </tr>
            ))}
            {units.length === 0 && <tr><td colSpan={5}><div className="adm-empty">No org units in this year.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── People directory — deans, secretaries, PICs, coordinators, wardens, committee ── */}
      <div className="adm-section-head" style={{ margin: "34px 0 14px" }}>
        <div className="adm-pagehead" style={{ marginBottom: 0 }}>
          <p className="adm-eyebrow">Directory</p><h2>People</h2>
          <p>{people.length} listed — edit their name, photo, profile link &amp; contact; the same person shows everywhere they hold a role.</p>
        </div>
        {canManagePeople && <button className="adm-btn primary" onClick={() => setPersonModal({ mode: "create" })}>+ Add person</button>}
      </div>
      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead><tr><th>Person</th><th>Type</th><th>Roles</th><th>Contact</th><th></th></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {p.photoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.photoUrl} alt="" width={28} height={28} style={{ borderRadius: "50%", objectFit: "cover" }} />
                    )}
                    <span>{p.fullName}</span>
                  </div>
                </td>
                <td><Badge tone="neutral">{p.personType}</Badge></td>
                <td style={{ fontSize: "0.76rem", color: "var(--adm-muted)" }}>
                  {p.roles?.length ? p.roles.map((r, i) => <div key={i}>{r.title}{r.unit ? ` · ${r.unit}` : ""}</div>) : "—"}
                </td>
                <td style={{ fontSize: "0.78rem" }}>
                  {p.phone && <div>{p.phone}</div>}
                  {p.profileUrl && <a href={p.profileUrl} target="_blank" rel="noopener noreferrer" className="adm-btn link">profile ↗</a>}
                  {!p.phone && !p.profileUrl && "—"}
                </td>
                <td>
                  <div className="adm-actions">
                    {canManagePeople && <button className="adm-btn ghost sm" onClick={() => setPersonModal({ mode: "edit", person: p })}>Edit</button>}
                    {canRemovePeople && <button className="adm-btn danger sm" disabled={busy} onClick={() => removePerson(p)}>Delete</button>}
                  </div>
                </td>
              </tr>
            ))}
            {people.length === 0 && <tr><td colSpan={5}><div className="adm-empty">No people in the directory yet.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {personModal && <PersonModal mode={personModal.mode} person={personModal.person} onClose={() => setPersonModal(null)} run={run} busy={busy} />}
      {creating && <UnitModal title="New unit" isCreate yearId={year.id} types={types} units={units} onClose={() => setCreating(false)} run={run} busy={busy} />}
      {editing && <UnitModal title={`Edit ${editing.name}`} unit={editing} types={types} units={units} onClose={() => setEditing(null)} run={run} busy={busy} />}
      {roster && (
        <RosterModal
          unit={roster}
          appointments={rosterByUnit[roster.id] ?? []}
          positions={positions.filter((p) => p.appliesToTypeId === roster.orgUnitTypeId || p.appliesToTypeId == null)}
          people={people}
          perms={perms}
          onClose={() => setRoster(null)}
          run={run}
          busy={busy}
        />
      )}
    </>
  );
}

function UnitModal({ title, unit, isCreate, yearId, types, units, onClose, run, busy }) {
  const [form, setForm] = useState({
    name: unit?.name ?? "", slug: unit?.slug ?? "", orgUnitTypeId: unit?.orgUnitTypeId ?? "",
    parentId: unit?.parentId ?? "", sortOrder: unit?.sortOrder ?? 0, status: unit?.status ?? "draft",
  });
  const [err, setErr] = useState("");
  const submit = async () => {
    if (!form.name.trim()) return setErr("Name is required.");
    if (isCreate && !form.slug.trim()) return setErr("Slug is required.");
    if (isCreate && !form.orgUnitTypeId) return setErr("Choose a unit type.");
    setErr("");
    try {
      if (isCreate) {
        await run("org.unit.create", { input: { academicYearId: yearId, name: form.name, slug: form.slug, orgUnitTypeId: form.orgUnitTypeId, parentId: form.parentId || null, sortOrder: Number(form.sortOrder) || 0 } }, { success: "Unit created" });
      } else {
        await run("org.unit.edit", { id: unit.id, patch: { name: form.name, slug: form.slug, parentId: form.parentId || null, sortOrder: Number(form.sortOrder) || 0, status: form.status } }, { success: "Unit updated" });
      }
      onClose();
    } catch {}
  };
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="adm-btn ghost" onClick={onClose}>Cancel</button>
      <button className="adm-btn primary" onClick={submit} disabled={busy}>{isCreate ? "Create" : "Save"}</button>
    </>}>
      <div className="adm-form">
        <Field label="Name"><input className="adm-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Slug"><input className="adm-input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="e.g. coding-club" /></Field>
        {isCreate && (
          <Field label="Type"><select className="adm-select" value={form.orgUnitTypeId} onChange={(e) => setForm({ ...form, orgUnitTypeId: e.target.value })}><option value="">Choose…</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
        )}
        <Field label="Parent unit (optional)"><select className="adm-select" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}><option value="">(none — top level)</option>{units.filter((u) => u.id !== unit?.id).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        <div style={{ display: "flex", gap: 14 }}>
          <Field label="Sort order"><input className="adm-input" type="number" value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} /></Field>
          {!isCreate && <Field label="Status"><select className="adm-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="draft">draft</option><option value="published">published</option><option value="archived">archived</option></select></Field>}
        </div>
        {err && <p className="adm-field-err">{err}</p>}
      </div>
    </Modal>
  );
}

function RosterModal({ unit, appointments, positions, people, perms, onClose, run, busy }) {
  const canCreate = hasPerm(perms, "appointment.create");
  const canUpdate = hasPerm(perms, "appointment.update");
  const canArchive = hasPerm(perms, "appointment.archive");
  const [mode, setMode] = useState("existing"); // existing | new
  const [form, setForm] = useState({ personId: "", positionId: "", titleOverride: "", newName: "", newType: "student" });

  const addAppointment = async () => {
    if (!form.positionId) return;
    try {
      let personId = form.personId;
      if (mode === "new") {
        if (!form.newName.trim()) return;
        // refresh after the person is created (default) so the directory updates
        // even if the appointment step then fails — the new person isn't orphaned,
        // just selectable as an "existing person" on retry.
        const res = await run("org.person.upsert", { input: { fullName: form.newName, personType: form.newType } }, { success: "Person added" });
        personId = res.person.id;
      }
      if (!personId) return;
      await run("org.appointment.create", { input: { orgUnitId: unit.id, positionId: form.positionId, personId, titleOverride: form.titleOverride || null } }, { success: "Appointment created" });
      setForm({ personId: "", positionId: "", titleOverride: "", newName: "", newType: "student" });
    } catch {}
  };
  const publish = (a) => run("org.appointment.publish", { id: a.id }, { success: "Published" }).catch(() => {});
  const archive = (a) => run("org.appointment.archive", { id: a.id }, { success: "Archived" }).catch(() => {});

  return (
    <Modal title={`Roster · ${unit.name}`} onClose={onClose} footer={<button className="adm-btn ghost" onClick={onClose}>Done</button>}>
      <table className="adm-table" style={{ marginBottom: 16 }}>
        <thead><tr><th>Person</th><th>Position</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {appointments.map((a) => (
            <tr key={a.id}>
              <td>{a.personName}</td>
              <td>{a.titleOverride || a.positionName}{a.isLead && <Badge tone="warn">lead</Badge>}</td>
              <td><Badge tone={statusTone(a.status)}>{a.status}</Badge></td>
              <td><div className="adm-actions">
                {canUpdate && a.status !== "published" && <button className="adm-btn ghost sm" disabled={busy} onClick={() => publish(a)}>Publish</button>}
                {canArchive && a.status !== "archived" && <button className="adm-btn danger sm" disabled={busy} onClick={() => archive(a)}>Archive</button>}
              </div></td>
            </tr>
          ))}
          {appointments.length === 0 && <tr><td colSpan={4}><div className="adm-empty">No appointments.</div></td></tr>}
        </tbody>
      </table>

      {canCreate && (
        <div className="adm-check-group">
          <h4>Add appointment</h4>
          <div className="adm-toolbar">
            <button className={`adm-btn ${mode === "existing" ? "primary" : "ghost"} sm`} onClick={() => setMode("existing")}>Existing person</button>
            <button className={`adm-btn ${mode === "new" ? "primary" : "ghost"} sm`} onClick={() => setMode("new")}>New person</button>
          </div>
          <div className="adm-form">
            {mode === "existing" ? (
              <Field label="Person"><select className="adm-select" value={form.personId} onChange={(e) => setForm({ ...form, personId: e.target.value })}><option value="">Choose…</option>{people.map((p) => <option key={p.id} value={p.id}>{p.fullName} ({p.personType})</option>)}</select></Field>
            ) : (
              <div style={{ display: "flex", gap: 12 }}>
                <Field label="Full name"><input className="adm-input" value={form.newName} onChange={(e) => setForm({ ...form, newName: e.target.value })} /></Field>
                <Field label="Type"><select className="adm-select" value={form.newType} onChange={(e) => setForm({ ...form, newType: e.target.value })}>{PERSON_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
              </div>
            )}
            <Field label="Position"><select className="adm-select" value={form.positionId} onChange={(e) => setForm({ ...form, positionId: e.target.value })}><option value="">Choose…</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Title override (optional)"><input className="adm-input" value={form.titleOverride} onChange={(e) => setForm({ ...form, titleOverride: e.target.value })} /></Field>
            <button className="adm-btn primary" onClick={addAppointment} disabled={busy}>Add</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// Add / edit a directory PERSON (name, type, photo, profile link, contact). Photo is a
// URL (a /public path or an external image) resolved to a media asset server-side.
// (PERSON_TYPES is declared at the top of the module.)
function PersonModal({ mode, person, onClose, run, busy }) {
  const isCreate = mode === "create";
  const [form, setForm] = useState({
    fullName: person?.fullName ?? "",
    personType: person?.personType ?? "student",
    email: person?.email ?? "",
    phone: person?.phone ?? "",
    profileUrl: person?.profileUrl ?? "",
    photoUrl: person?.photoUrl ?? "",
  });
  const submit = async () => {
    try {
      if (isCreate) {
        await run("org.person.create", { input: {
          fullName: form.fullName, personType: form.personType,
          email: form.email || undefined, phone: form.phone || undefined,
          profileUrl: form.profileUrl || undefined, photoUrl: form.photoUrl || undefined,
        } }, { success: "Person added" });
      } else {
        // Edit OVERWRITES — send every field (empty string clears it).
        await run("org.person.edit", { id: person.id, patch: {
          fullName: form.fullName, personType: form.personType,
          email: form.email, phone: form.phone, profileUrl: form.profileUrl, photoUrl: form.photoUrl,
        } }, { success: "Person updated" });
      }
      onClose();
    } catch { /* toast shown by useAdminAction */ }
  };
  return (
    <Modal title={isCreate ? "Add person" : `Edit ${person.fullName}`} onClose={onClose} footer={<>
      <button className="adm-btn ghost" onClick={onClose}>Cancel</button>
      <button className="adm-btn primary" onClick={submit} disabled={busy || !form.fullName.trim()}>{isCreate ? "Add" : "Save"}</button>
    </>}>
      <div className="adm-form">
        <Field label="Full name"><input className="adm-input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Dr. / student full name" /></Field>
        <Field label="Type"><select className="adm-select" value={form.personType} onChange={(e) => setForm({ ...form, personType: e.target.value })}>{PERSON_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
        <Field label="Photo URL"><input className="adm-input" value={form.photoUrl} onChange={(e) => setForm({ ...form, photoUrl: e.target.value })} placeholder="/photo.jpg or https://res.cloudinary.com/…" /></Field>
        <Field label="Profile URL"><input className="adm-input" value={form.profileUrl} onChange={(e) => setForm({ ...form, profileUrl: e.target.value })} placeholder="faculty page / portfolio (optional)" /></Field>
        <Field label="Phone"><input className="adm-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="optional" /></Field>
        <Field label="Email (optional)"><input className="adm-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="optional; must be unique" /></Field>
        {form.photoUrl && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={form.photoUrl} alt="preview" width={56} height={56} style={{ borderRadius: "50%", objectFit: "cover", border: "1px solid var(--adm-border)" }} />
            <span style={{ fontSize: "0.78rem", color: "var(--adm-muted)" }}>Photo preview</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
