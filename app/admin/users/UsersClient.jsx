"use client";

import Link from "next/link";
import React, { useState, useMemo, useEffect } from "react";
import { Badge, Modal, Field, ConfirmButton, useAdminAction } from "../_components/ui";
import { hasPerm } from "../../../lib/admin/nav.mjs";
import { validateUserForm, validateRoleForm, passwordRequirements, USER_STATUSES } from "../../../lib/admin/forms.mjs";
import { statusTone, formatAssignmentScope } from "../../../lib/admin/view-models.mjs";
import { filterUsers, userFilterFacets, userEmailIdentity } from "../../../lib/users/search.mjs";
import { PERMISSIONS } from "../../../lib/rbac/permissions.mjs";

// Debounce a fast-changing value (the search box) so filtering doesn't re-run on
// every keystroke (M2 "debounced admin filter").
function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function UsersClient({ users, roles, catalog, perms, viewerId, viewerIsDeveloper, canReadUsers, canReadRoles, canOverride }) {
  const [tab, setTab] = useState(canReadUsers ? "users" : "roles");
  return (
    <>
      <div className="adm-pagehead">
        <p className="adm-eyebrow">RBAC</p>
        <h2>Users &amp; Roles</h2>
        <p>Accounts, role definitions, the role assignments the authorization engine reads, and per-email permission overrides.</p>
      </div>
      <div className="adm-toolbar">
        {canReadUsers && <button className={`adm-btn ${tab === "users" ? "primary" : "ghost"}`} onClick={() => setTab("users")}>Users ({users.length})</button>}
        {canReadRoles && <button className={`adm-btn ${tab === "roles" ? "primary" : "ghost"}`} onClick={() => setTab("roles")}>Roles ({roles.length})</button>}
      </div>
      {tab === "users" && canReadUsers && (
        <UsersTab users={users} roles={roles} perms={perms} viewerId={viewerId} viewerIsDeveloper={viewerIsDeveloper} canOverride={canOverride} />
      )}
      {tab === "roles" && canReadRoles && <RolesTab roles={roles} catalog={catalog} perms={perms} />}
    </>
  );
}

// Level code → label for the filter dropdown + the per-row identity badge.
const LEVEL_LABEL = { ug: "UG", pg: "PG", research: "Research" };

// ── Users tab ──
function UsersTab({ users, roles, perms, viewerId, viewerIsDeveloper, canOverride }) {
  const { run, busy } = useAdminAction();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // user object
  const [granting, setGranting] = useState(null); // user object
  const [overriding, setOverriding] = useState(null); // user object
  const [bulk, setBulk] = useState(false);
  const [generated, setGenerated] = useState(null); // { email, password }

  // ── debounced smart filter (year / level / branch / category / status + text) ──
  const [filter, setFilter] = useState({ q: "", year: "", level: "", branch: "", category: "", status: "" });
  const debouncedQ = useDebouncedValue(filter.q, 200);
  const facets = useMemo(() => userFilterFacets(users), [users]);
  // Category options come from the full role list (so you can filter by a category
  // even when no loaded user currently holds it); fall back to facet keys.
  const categoryOptions = useMemo(() => {
    const byKey = new Map((roles ?? []).map((r) => [r.key, r.name]));
    const keys = new Set([...byKey.keys(), ...facets.categories]);
    return [...keys].sort().map((key) => ({ key, name: byKey.get(key) ?? key }));
  }, [roles, facets.categories]);
  const filtered = useMemo(
    () => filterUsers(users, { ...filter, q: debouncedQ }),
    [users, filter, debouncedQ]
  );
  const active = filter.q || filter.year || filter.level || filter.branch || filter.category || filter.status;
  const clear = () => setFilter({ q: "", year: "", level: "", branch: "", category: "", status: "" });
  const set = (k) => (e) => setFilter((f) => ({ ...f, [k]: e.target.value }));

  const canCreate = hasPerm(perms, "user.create");
  const canUpdate = hasPerm(perms, "user.update");
  const canSuspend = hasPerm(perms, "user.suspend");
  const canAssign = hasPerm(perms, "role.assign");
  const canDelete = hasPerm(perms, "user.delete");

  const setStatus = (u, status) =>
    run("user.setStatus", { id: u.id, status }, { success: `${u.email} → ${status}` }).catch(() => {});
  const del = (u) => run("user.delete", { id: u.id }, { success: `Deleted ${u.email}` }).catch(() => {});
  const forceReset = async (u) => {
    try {
      const res = await run("user.forceReset", { id: u.id }, { success: `Reset ${u.email}` });
      if (res?.generatedPassword) setGenerated({ email: u.email, password: res.generatedPassword });
    } catch { /* toast shown */ }
  };

  return (
    <>
      {canCreate && (
        <div className="adm-toolbar">
          <button className="adm-btn primary" onClick={() => setCreating(true)}>+ New user</button>
          <button className="adm-btn ghost" onClick={() => setBulk(true)}>Bulk import (CSV)</button>
        </div>
      )}

      {/* Smart filter — email-format (year/level/branch), role category & status. */}
      <div className="adm-toolbar" style={{ flexWrap: "wrap", gap: 8 }}>
        <input className="adm-input" style={{ maxWidth: 260 }} placeholder="Search email or name…" value={filter.q} onChange={set("q")} />
        <select className="adm-select" value={filter.year} onChange={set("year")} aria-label="Admission year">
          <option value="">Any year</option>
          {facets.years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="adm-select" value={filter.level} onChange={set("level")} aria-label="Level">
          <option value="">Any level</option>
          {facets.levels.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l] ?? l}</option>)}
        </select>
        <select className="adm-select" value={filter.branch} onChange={set("branch")} aria-label="Branch">
          <option value="">Any branch</option>
          {facets.branches.map((b) => <option key={b} value={b}>{b.toUpperCase()}</option>)}
        </select>
        <select className="adm-select" value={filter.category} onChange={set("category")} aria-label="Category (role)">
          <option value="">Any category</option>
          {categoryOptions.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
        </select>
        <select className="adm-select" value={filter.status} onChange={set("status")} aria-label="Status">
          <option value="">Any status</option>
          {USER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {active && <button className="adm-btn ghost sm" onClick={clear}>Clear</button>}
        <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "var(--adm-muted)" }}>{filtered.length} of {users.length}</span>
      </div>

      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead><tr><th>Email</th><th>Identity</th><th>Roles</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {filtered.map((u) => {
              const id = userEmailIdentity(u);
              const overrideCount = (u.overrides ?? []).length;
              return (
                <tr key={u.id}>
                  <td>
                    {u.email} {u.isDeveloper && <Badge tone="dev">dev</Badge>} {u.id === viewerId && <Badge tone="info">you</Badge>}
                    {u.mustChangePassword && <Badge tone="warn">must change pw</Badge>}
                    {overrideCount > 0 && <Badge tone="warn">{overrideCount} override{overrideCount > 1 ? "s" : ""}</Badge>}
                  </td>
                  <td>
                    {id ? (
                      <div className="adm-pill-row">
                        <Badge tone="neutral">{id.year}</Badge>
                        <Badge tone="neutral">{LEVEL_LABEL[id.level] ?? id.level}</Badge>
                        <Badge tone="neutral">{id.branch.toUpperCase()}</Badge>
                      </div>
                    ) : (
                      <span style={{ color: "var(--adm-faint)" }}>{u.name || "—"}</span>
                    )}
                  </td>
                  <td><div className="adm-pill-row">{(u.roles ?? []).map((r) => <Badge key={r.key} tone="neutral">{r.name}</Badge>)}{(u.roles ?? []).length === 0 && <span style={{ color: "var(--adm-faint)" }}>—</span>}</div></td>
                  <td><Badge tone={statusTone(u.status)}>{u.status}</Badge></td>
                  <td>
                    <div className="adm-actions">
                      {/* M6 (DL-090): the member's profile + institute contribution (user.read). */}
                      <Link className="adm-btn ghost sm" href={`/admin/users/${u.id}`}>Profile</Link>
                      {canAssign && <button className="adm-btn ghost sm" onClick={() => setGranting(u)}>Roles</button>}
                      {canOverride && <button className="adm-btn ghost sm" onClick={() => setOverriding(u)}>Perms</button>}
                      {canUpdate && <button className="adm-btn ghost sm" onClick={() => setEditing(u)}>Edit</button>}
                      {canUpdate && u.hasPassword && (
                        <ConfirmButton confirm={`Generate a new temporary password for ${u.email}? They will be forced to change it on next login.`} busy={busy} onConfirm={() => forceReset(u)}>Reset pw</ConfirmButton>
                      )}
                      {/* M1 (DL-065): active / inactive / revoked. inactive = browse but
                          no event participation; revoked = no login at all. */}
                      {canSuspend && u.id !== viewerId && <>
                        {u.status !== "active" && <button className="adm-btn ghost sm" disabled={busy} onClick={() => setStatus(u, "active")}>Activate</button>}
                        {u.status !== "inactive" && <button className="adm-btn ghost sm" disabled={busy} onClick={() => setStatus(u, "inactive")}>Deactivate</button>}
                        {u.status !== "revoked" && <button className="adm-btn danger sm" disabled={busy} onClick={() => setStatus(u, "revoked")}>Revoke</button>}
                      </>}
                      {canDelete && u.id !== viewerId && (
                        <ConfirmButton className="adm-btn danger sm" confirm={`Permanently delete ${u.email}? This cannot be undone.`} busy={busy} onConfirm={() => del(u)}>Delete</ConfirmButton>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={5}><div className="adm-empty">{users.length === 0 ? "No users." : "No users match the filter."}</div></td></tr>}
          </tbody>
        </table>
      </div>

      {creating && <UserModal title="New user" isCreate viewerIsDeveloper={viewerIsDeveloper} onClose={() => setCreating(false)} run={run} busy={busy} />}
      {editing && <UserModal title={`Edit ${editing.email}`} user={editing} viewerIsDeveloper={viewerIsDeveloper} canUpdate={canUpdate} onClose={() => setEditing(null)} run={run} busy={busy} />}
      {granting && <GrantModal user={granting} roles={roles} canRevoke={hasPerm(perms, "role.revoke")} onClose={() => setGranting(null)} run={run} busy={busy} />}
      {overriding && <OverridesModal user={overriding} perms={perms} viewerIsDeveloper={viewerIsDeveloper} onClose={() => setOverriding(null)} run={run} busy={busy} />}
      {bulk && <BulkModal onClose={() => setBulk(false)} run={run} busy={busy} />}
      {generated && <GeneratedPasswordModal email={generated.email} password={generated.password} onClose={() => setGenerated(null)} />}
    </>
  );
}

// ── Per-email permission overrides modal (M2) ──
// Grant or deny a single catalog permission to one account (institute-wide here;
// scoped overrides are available via the API). Deny WINS over any role grant. The
// table behind refreshes via router.refresh after each mutation; this modal holds
// a snapshot, so it closes on a successful change.
const PERMS_BY_MODULE = (() => {
  const byModule = {};
  for (const p of PERMISSIONS) (byModule[p.module ?? "other"] ??= []).push(p);
  return byModule;
})();

// Session 14 (DL-102): a CHECKBOX GRID (replacing the one-at-a-time dropdown). The admin
// ticks grant/deny for many permissions across modules and saves ONCE — the whole
// institute-wide override set is applied via permission.override.setBulk. Per row the
// Grant and Deny checkboxes are mutually exclusive (both off = inherit from roles); a
// Grant is only offered for a permission the admin holds (server also enforces this).
// Any SCOPED (unit/year) overrides are shown read-only and left untouched (API-managed).
function OverridesModal({ user, perms, viewerIsDeveloper, onClose, run, busy }) {
  const all = user.overrides ?? [];
  const scoped = all.filter((o) => o.orgUnitLineageKey || o.academicYearId);
  // Editable state = the institute-wide overrides, as Map(permissionKey → 'grant'|'deny').
  const [sel, setSel] = useState(() => {
    const m = new Map();
    for (const o of all) if (!o.orgUnitLineageKey && !o.academicYearId) m.set(o.permissionKey, o.mode);
    return m;
  });
  const canGrant = (key) => viewerIsDeveloper || hasPerm(perms, key);

  const setMode = (key, mode) =>
    setSel((prev) => {
      const next = new Map(prev);
      if (next.get(key) === mode) next.delete(key); // toggling the active mode off = inherit
      else next.set(key, mode);
      return next;
    });

  const save = () => {
    const entries = [...sel.entries()].map(([permissionKey, mode]) => ({ permissionKey, mode }));
    run("permission.override.setBulk", { userId: user.id, entries }, { success: "Permission overrides saved." })
      .then(onClose)
      .catch(() => {});
  };

  return (
    <Modal
      title={`Permission overrides · ${user.email}`}
      onClose={onClose}
      footer={<>
        <button className="adm-btn ghost" onClick={onClose}>Cancel</button>
        <button className="adm-btn primary" onClick={save} disabled={busy}>Save overrides</button>
      </>}
    >
      <div className="adm-form">
        <p className="adm-banner info" style={{ whiteSpace: "normal" }}>
          Overrides apply <strong>on top of</strong> this account&apos;s roles — a <strong>grant</strong> adds a
          permission, a <strong>deny</strong> removes it, and <strong>deny wins</strong>. They have no effect on a
          developer / unrestricted account. You can only grant a permission you hold yourself.
        </p>

        {scoped.length > 0 && (
          <div className="adm-check-group">
            <h4>Scoped overrides (managed via the API — not edited here)</h4>
            {scoped.map((o) => (
              <div key={o.id} style={{ fontSize: "0.82rem", padding: "2px 0" }}>
                <Badge tone={o.mode === "deny" ? "muted" : "good"}>{o.mode}</Badge>{" "}
                <span className="adm-code">{o.permissionKey}</span> <span style={{ color: "var(--adm-faint)" }}>· scoped</span>
              </div>
            ))}
          </div>
        )}

        {Object.entries(PERMS_BY_MODULE).map(([module, list]) => (
          <div className="adm-check-group" key={module}>
            <h4 style={{ textTransform: "capitalize" }}>{module}</h4>
            <table className="adm-table" style={{ width: "100%" }}>
              <thead><tr><th style={{ textAlign: "left" }}>Permission</th><th style={{ width: 70 }}>Grant</th><th style={{ width: 70 }}>Deny</th></tr></thead>
              <tbody>
                {list.map((p) => {
                  const mode = sel.get(p.key) ?? null;
                  const grantable = canGrant(p.key);
                  return (
                    <tr key={p.key}>
                      <td><span className="adm-code">{p.key}</span> <span style={{ color: "var(--adm-muted)", fontSize: "0.78rem" }}>— {p.label}</span></td>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={mode === "grant"}
                          disabled={!grantable}
                          title={grantable ? "Grant this permission" : "You don't hold this permission, so you can't grant it"}
                          onChange={() => setMode(p.key, "grant")}
                        />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <input type="checkbox" checked={mode === "deny"} onChange={() => setMode(p.key, "deny")} title="Deny this permission" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function UserModal({ title, user, isCreate, viewerIsDeveloper, canUpdate = true, onClose, run, busy }) {
  const [form, setForm] = useState({ email: "", name: user?.name ?? "", password: "", isDeveloper: user?.isDeveloper ?? false, allowNormalView: user?.allowNormalView ?? true });
  const [errors, setErrors] = useState({});

  const submit = async () => {
    const v = validateUserForm(form, { isCreate });
    setErrors(v.errors);
    if (!v.ok) return;
    try {
      if (isCreate) {
        await run("user.create", { input: v.value }, { success: "User created" });
      } else {
        if (v.value.name !== undefined || v.value.isDeveloper !== undefined || v.value.allowNormalView !== undefined) {
          await run("user.update", { id: user.id, patch: { name: v.value.name, isDeveloper: v.value.isDeveloper, allowNormalView: v.value.allowNormalView } }, { success: "User updated" });
        }
        if (v.value.password) await run("user.setPassword", { id: user.id, password: v.value.password }, { success: "Password set (user must change on next login)" });
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
        <Field label={isCreate ? "Initial password (the user must change it on first login)" : "New password (optional; forces a change)"} error={errors.password}>
          <input className="adm-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="new-password" />
        </Field>
        <p style={{ fontSize: "0.74rem", color: "var(--adm-muted)", marginTop: -4 }}>
          Must: {passwordRequirements().join(" · ").toLowerCase()}. Deliver it via the institute's external email.
        </p>
        {viewerIsDeveloper && (
          <label className="adm-check"><input type="checkbox" checked={form.isDeveloper} onChange={(e) => setForm({ ...form, isDeveloper: e.target.checked })} /> Developer (unrestricted access)</label>
        )}
        {/* M1 (DL-067): per-account member-view toggle. */}
        <label className="adm-check"><input type="checkbox" checked={form.allowNormalView} onChange={(e) => setForm({ ...form, allowNormalView: e.target.checked })} /> Allow the normal (member) view</label>
      </div>
    </Modal>
  );
}

// Bulk-create accounts from a CSV (email,password[,name[,role]] per line). The server
// parses + creates + grants the optional role; we render the per-row outcome.
function BulkModal({ onClose, run, busy }) {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState(null);

  const submit = async () => {
    try {
      const res = await run("user.bulkCreate", { csv }, { success: "Import complete", refresh: true });
      setResult(res);
    } catch { /* toast shown */ }
  };

  return (
    <Modal title="Bulk import accounts" onClose={onClose} footer={<>
      <button className="adm-btn ghost" onClick={onClose}>Close</button>
      <button className="adm-btn primary" onClick={submit} disabled={busy || !csv.trim()}>Import</button>
    </>}>
      <div className="adm-form">
        <p style={{ fontSize: "0.82rem", color: "var(--adm-muted)" }}>
          One account per line: <span className="adm-code">email,password[,name[,role]]</span>. The optional
          4th column <strong>role</strong> is a role key (e.g. <span className="adm-code">normal_user</span>,{" "}
          <span className="adm-code">coordinator</span>, <span className="adm-code">staff</span>) granted on
          creation. An optional header row is detected. Existing emails are skipped; each new account must
          change its password on first login. Deliver the passwords via the institute's external email.
        </p>
        <Field label="CSV">
          <textarea className="adm-textarea" rows={8} value={csv} onChange={(e) => setCsv(e.target.value)}
            placeholder={"email,password,name,role\n2023ume0243@iitjammu.ac.in,Welcome#2026,Riya Sharma,normal_user\n…"} />
        </Field>
        {result && (
          <div className="adm-banner info" style={{ whiteSpace: "normal" }}>
            <strong>{result.summary.created}</strong> created · <strong>{result.summary.skipped}</strong> skipped (existing) · <strong>{result.summary.failed}</strong> failed.
            {result.failed?.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {result.failed.slice(0, 12).map((f, i) => <li key={i} style={{ fontSize: "0.78rem" }}>{f.email ?? "?"}: {f.reason}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function GeneratedPasswordModal({ email, password, onClose }) {
  return (
    <Modal title="Temporary password generated" onClose={onClose} footer={<button className="adm-btn primary" onClick={onClose}>Done</button>}>
      <div className="adm-form">
        <p className="adm-banner warn">
          Deliver this to <strong>{email}</strong> via the institute's external email. Shown once,
          never stored in plaintext; the user must change it on first login.
        </p>
        <Field label="Temporary password">
          <input className="adm-input adm-code" readOnly value={password} onFocus={(e) => e.target.select()} />
        </Field>
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
