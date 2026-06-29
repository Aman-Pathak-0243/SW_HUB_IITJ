"use client";

import React, { useState } from "react";
import { Badge, Modal, Field, useAdminAction } from "../_components/ui";
import { hasPerm } from "../../../lib/admin/nav.mjs";
import { validateUserForm, validateRoleForm } from "../../../lib/admin/forms.mjs";
import { statusTone, formatAssignmentScope } from "../../../lib/admin/view-models.mjs";

export default function UsersClient({ users, roles, catalog, perms, viewerId, viewerIsDeveloper, canReadUsers, canReadRoles }) {
  const [tab, setTab] = useState(canReadUsers ? "users" : "roles");
  return (
    <>
      <div className="adm-pagehead">
        <p className="adm-eyebrow">RBAC</p>
        <h2>Users &amp; Roles</h2>
        <p>Accounts, role definitions and the role assignments the authorization engine reads.</p>
      </div>
      <div className="adm-toolbar">
        {canReadUsers && <button className={`adm-btn ${tab === "users" ? "primary" : "ghost"}`} onClick={() => setTab("users")}>Users ({users.length})</button>}
        {canReadRoles && <button className={`adm-btn ${tab === "roles" ? "primary" : "ghost"}`} onClick={() => setTab("roles")}>Roles ({roles.length})</button>}
      </div>
      {tab === "users" && canReadUsers && (
        <UsersTab users={users} roles={roles} perms={perms} viewerId={viewerId} viewerIsDeveloper={viewerIsDeveloper} />
      )}
      {tab === "roles" && canReadRoles && <RolesTab roles={roles} catalog={catalog} perms={perms} />}
    </>
  );
}

// ── Users tab ──
function UsersTab({ users, roles, perms, viewerId, viewerIsDeveloper }) {
  const { run, busy } = useAdminAction();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // user object
  const [granting, setGranting] = useState(null); // user object

  const canCreate = hasPerm(perms, "user.create");
  const canUpdate = hasPerm(perms, "user.update");
  const canSuspend = hasPerm(perms, "user.suspend");
  const canAssign = hasPerm(perms, "role.assign");

  const setStatus = (u, status) =>
    run("user.setStatus", { id: u.id, status }, { success: `${u.email} → ${status}` }).catch(() => {});

  return (
    <>
      {canCreate && (
        <div className="adm-toolbar"><button className="adm-btn primary" onClick={() => setCreating(true)}>+ New user</button></div>
      )}
      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead><tr><th>Email</th><th>Name</th><th>Roles</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.email} {u.isDeveloper && <Badge tone="dev">dev</Badge>} {u.id === viewerId && <Badge tone="info">you</Badge>}</td>
                <td>{u.name}</td>
                <td><div className="adm-pill-row">{(u.roles ?? []).map((r) => <Badge key={r.key} tone="neutral">{r.name}</Badge>)}{(u.roles ?? []).length === 0 && <span style={{ color: "var(--adm-faint)" }}>—</span>}</div></td>
                <td><Badge tone={statusTone(u.status)}>{u.status}</Badge></td>
                <td>
                  <div className="adm-actions">
                    {canAssign && <button className="adm-btn ghost sm" onClick={() => setGranting(u)}>Roles</button>}
                    {canUpdate && <button className="adm-btn ghost sm" onClick={() => setEditing(u)}>Edit</button>}
                    {canSuspend && u.id !== viewerId && (u.status === "active"
                      ? <button className="adm-btn danger sm" disabled={busy} onClick={() => setStatus(u, "suspended")}>Suspend</button>
                      : <button className="adm-btn ghost sm" disabled={busy} onClick={() => setStatus(u, "active")}>Activate</button>)}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={5}><div className="adm-empty">No users.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {creating && <UserModal title="New user" isCreate viewerIsDeveloper={viewerIsDeveloper} onClose={() => setCreating(false)} run={run} busy={busy} />}
      {editing && <UserModal title={`Edit ${editing.email}`} user={editing} viewerIsDeveloper={viewerIsDeveloper} canUpdate={canUpdate} onClose={() => setEditing(null)} run={run} busy={busy} />}
      {granting && <GrantModal user={granting} roles={roles} canRevoke={hasPerm(perms, "role.revoke")} onClose={() => setGranting(null)} run={run} busy={busy} />}
    </>
  );
}

function UserModal({ title, user, isCreate, viewerIsDeveloper, canUpdate = true, onClose, run, busy }) {
  const [form, setForm] = useState({ email: "", name: user?.name ?? "", password: "", isDeveloper: user?.isDeveloper ?? false });
  const [errors, setErrors] = useState({});

  const submit = async () => {
    const v = validateUserForm(form, { isCreate });
    setErrors(v.errors);
    if (!v.ok) return;
    try {
      if (isCreate) {
        await run("user.create", { input: v.value }, { success: "User created" });
      } else {
        if (v.value.name !== undefined || v.value.isDeveloper !== undefined) {
          await run("user.update", { id: user.id, patch: { name: v.value.name, isDeveloper: v.value.isDeveloper } }, { success: "User updated" });
        }
        if (v.value.password) await run("user.setPassword", { id: user.id, password: v.value.password }, { success: "Password set" });
      }
      onClose();
    } catch { /* toast shown by run */ }
  };

  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="adm-btn ghost" onClick={onClose}>Cancel</button>
      <button className="adm-btn primary" onClick={submit} disabled={busy || !canUpdate}>{isCreate ? "Create" : "Save"}</button>
    </>}>
      <div className="adm-form">
        {isCreate && <Field label="Email" error={errors.email}><input className="adm-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>}
        <Field label="Display name" error={errors.name}><input className="adm-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={isCreate ? "(defaults to email)" : ""} /></Field>
        <Field label={isCreate ? "Password (optional — else Google sign-in)" : "New password (optional)"} error={errors.password}>
          <input className="adm-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
        </Field>
        {viewerIsDeveloper && (
          <label className="adm-check"><input type="checkbox" checked={form.isDeveloper} onChange={(e) => setForm({ ...form, isDeveloper: e.target.checked })} /> Developer (unrestricted access)</label>
        )}
      </div>
    </Modal>
  );
}

function GrantModal({ user, roles, canRevoke, onClose, run, busy }) {
  const [roleId, setRoleId] = useState("");
  const activeRoles = roles.filter((r) => r.status === "active");
  const current = user.roles ?? [];

  // Close on any successful mutation so the next open shows fresh data (the table
  // behind refreshes via router.refresh; this modal holds a snapshot).
  const grant = async () => {
    if (!roleId) return;
    try { await run("role.grant", { input: { userId: user.id, roleId } }, { success: "Role granted" }); onClose(); } catch {}
  };
  const revoke = (a) =>
    run("role.revoke", { assignmentId: a.assignmentId }, { success: `Revoked ${a.name}` }).then(onClose).catch(() => {});

  return (
    <Modal title={`Roles · ${user.email}`} onClose={onClose} footer={<button className="adm-btn ghost" onClick={onClose}>Done</button>}>
      <div className="adm-form">
        <div className="adm-check-group">
          <h4>Current roles</h4>
          {current.length === 0 ? (
            <p style={{ fontSize: "0.82rem", color: "var(--adm-faint)" }}>No roles assigned.</p>
          ) : (
            current.map((r) => (
              <div key={r.assignmentId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "4px 0" }}>
                <span style={{ fontSize: "0.84rem" }}>{r.name} <span style={{ color: "var(--adm-faint)" }}>· {formatAssignmentScope(r)}</span></span>
                {canRevoke && <button className="adm-btn danger sm" disabled={busy} onClick={() => revoke(r)}>Revoke</button>}
              </div>
            ))
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <select className="adm-select" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            <option value="">Grant a role…</option>
            {activeRoles.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.key})</option>)}
          </select>
          <button className="adm-btn primary" onClick={grant} disabled={busy || !roleId}>Grant</button>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--adm-muted)" }}>Granting is institute-wide here; scoped grants are available via the API.</p>
      </div>
    </Modal>
  );
}

// ── Roles tab ──
function RolesTab({ roles, catalog, perms }) {
  const { run, busy } = useAdminAction();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const canCreate = hasPerm(perms, "role.create");
  const canUpdate = hasPerm(perms, "role.update");

  return (
    <>
      {canCreate && <div className="adm-toolbar"><button className="adm-btn primary" onClick={() => setCreating(true)}>+ New role</button></div>}
      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead><tr><th>Role</th><th>Key</th><th>Permissions</th><th>Assignments</th><th></th></tr></thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id}>
                <td>{r.name} {r.isSystem && <Badge tone="dev">system</Badge>} {r.grantsAll && <Badge tone="warn">grants all</Badge>} {r.status !== "active" && <Badge tone="muted">{r.status}</Badge>}</td>
                <td><span className="adm-code">{r.key}</span></td>
                <td>{r.grantsAll ? "ALL (unrestricted)" : `${r.permissionKeys?.length ?? 0} permission(s)`}</td>
                <td>{r.assignmentCount ?? 0}</td>
                <td>{canUpdate && <button className="adm-btn ghost sm" onClick={() => setEditing(r)}>{r.isSystem ? "View" : "Edit"}</button>}</td>
              </tr>
            ))}
            {roles.length === 0 && <tr><td colSpan={5}><div className="adm-empty">No roles.</div></td></tr>}
          </tbody>
        </table>
      </div>

      {creating && <RoleModal title="New role" isCreate catalog={catalog} onClose={() => setCreating(false)} run={run} busy={busy} />}
      {editing && <RoleModal title={`${editing.isSystem ? "View" : "Edit"} role · ${editing.name}`} role={editing} catalog={catalog} onClose={() => setEditing(null)} run={run} busy={busy} />}
    </>
  );
}

function RoleModal({ title, role, isCreate, catalog, onClose, run, busy }) {
  const locked = !!role?.isSystem; // system roles: only description is editable
  const [form, setForm] = useState({
    key: "", name: role?.name ?? "", description: role?.description ?? "",
    permissionKeys: new Set(role?.permissionKeys ?? []),
  });
  const [errors, setErrors] = useState({});

  const toggle = (key) => {
    const next = new Set(form.permissionKeys);
    next.has(key) ? next.delete(key) : next.add(key);
    setForm({ ...form, permissionKeys: next });
  };

  const submit = async () => {
    const payload = { key: form.key, name: form.name, description: form.description, permissionKeys: [...form.permissionKeys] };
    const v = validateRoleForm(payload, { isCreate });
    setErrors(v.errors);
    if (!v.ok) return;
    try {
      if (isCreate) {
        await run("role.create", { input: v.value }, { success: "Role created" });
      } else if (locked) {
        await run("role.update", { id: role.id, patch: { description: v.value.description } }, { success: "Role updated" });
      } else {
        await run("role.update", { id: role.id, patch: { name: v.value.name, description: v.value.description, permissionKeys: v.value.permissionKeys } }, { success: "Role updated" });
      }
      onClose();
    } catch {}
  };

  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="adm-btn ghost" onClick={onClose}>Cancel</button>
      <button className="adm-btn primary" onClick={submit} disabled={busy}>{isCreate ? "Create role" : "Save"}</button>
    </>}>
      <div className="adm-form">
        {locked && <p className="adm-banner info">This is a protected system role — only its description can be edited.</p>}
        {isCreate && <Field label="Key" error={errors.key}><input className="adm-input" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="club_editor" /></Field>}
        <Field label="Name" error={errors.name}><input className="adm-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={locked} /></Field>
        <Field label="Description"><textarea className="adm-textarea" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        {role?.grantsAll ? (
          <p className="adm-banner warn">This role grants ALL permissions (unrestricted) and is not editable by permission.</p>
        ) : (
          <Field label="Permissions" error={errors.permissionKeys}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.entries(catalog.byModule).map(([module, perms]) => (
                <div key={module} className="adm-check-group">
                  <h4>{module}</h4>
                  <div className="adm-checks">
                    {perms.map((p) => (
                      <label key={p.key} className="adm-check">
                        <input type="checkbox" disabled={locked} checked={form.permissionKeys.has(p.key)} onChange={() => toggle(p.key)} /> {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Field>
        )}
      </div>
    </Modal>
  );
}
