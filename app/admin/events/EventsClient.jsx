"use client";

// M5 Event Playground — admin management UI. The viewer picks one of the year's
// events, then manages its subsystem (registration settings, rounds, organizers,
// custom entities, registrations, scores, attendance, closure review) by posting
// the `event.*` admin actions through the shared /api/admin/action route.
//
// This first version does NOT read the selected event's live sub-data (rounds,
// registrations, scores). It provides forms that submit actions and relies on
// run(..., { success }) + router.refresh() + toasts for feedback. Where an id is
// needed (round id, registration id, closure report id) the user pastes it — the
// note under each form explains those ids can be copied from the playground /
// event detail pages. Keep it functional; do not invent data we don't have.
import React, { useMemo, useState } from "react";
import { Badge, ConfirmButton, Field, useAdminAction } from "../_components/ui";
import { RegisteredList, AttendanceChecklist, ScoreSheet } from "../_components/EventRoster";
import { REGISTRANT_ROLE_OPTIONS } from "../../../lib/events/forms.mjs";

// datetime-local <input> gives "YYYY-MM-DDTHH:mm"; we forward it verbatim (or "").
const dtHint = "Leave blank to clear. Uses your local time.";

export default function EventsClient({ events = [], entities = [], perms }) {
  const { run, busy } = useAdminAction();

  // ── event picker ──
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const selected = useMemo(() => events.find((e) => e.id === eventId) ?? null, [events, eventId]);

  return (
    <>
      <div className="adm-pagehead">
        <p className="adm-eyebrow">Member platform · M5</p>
        <h2>Event Playground</h2>
        <p>
          Pick an event, then manage its subsystem below. Actions are audited and take effect
          immediately. This admin surface submits changes; open the event&apos;s{" "}
          <strong>playground / detail page</strong> to read live rounds, registrations and scores —
          and to copy the <strong>round ids</strong>, <strong>registration ids</strong> and{" "}
          <strong>closure report ids</strong> the forms below ask for.
        </p>
      </div>

      <section className="adm-card">
        <div className="adm-field">
          <label>Event</label>
          <select
            className="adm-select"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          >
            <option value="">Select an event…</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
                {ev.status ? ` — ${ev.status}` : ""}
              </option>
            ))}
          </select>
        </div>
        {selected && (
          <p style={{ marginTop: 8, fontSize: "0.82rem", color: "var(--adm-muted)" }}>
            <span className="adm-code">{selected.slug}</span>{" "}
            <Badge tone={selected.status === "published" ? "good" : "muted"}>
              {selected.status ?? "—"}
            </Badge>
            {selected.publishedAt ? ` · published ${new Date(selected.publishedAt).toLocaleDateString()}` : ""}
            {"  · id "}
            <span className="adm-code">{selected.id}</span>
          </p>
        )}
        {events.length === 0 && <div className="adm-empty">No events for this year yet.</div>}
      </section>

      {selected ? (
        <EventManager key={selected.id} event={selected} run={run} busy={busy} />
      ) : (
        <p className="adm-banner info" style={{ marginTop: 16 }}>
          Choose an event above to manage its registration, rounds, organizers, scores and closure.
        </p>
      )}

      {/* Custom organizing entities are year-scoped, not tied to one event. */}
      <EntitiesSection entities={entities} run={run} busy={busy} />
    </>
  );
}

// ── per-event management sections ─────────────────────────────────────────────
function EventManager({ event, run, busy }) {
  const eventItemId = event.id;
  return (
    <>
      <SettingsSection eventItemId={eventItemId} settings={event.settings ?? null} run={run} busy={busy} />
      <RoundsSection eventItemId={eventItemId} run={run} busy={busy} />
      <OrganizersSection eventItemId={eventItemId} run={run} busy={busy} />
      <RegistrationsSection eventItemId={eventItemId} roster={event.roster ?? []} rosterHasMore={event.rosterHasMore} run={run} busy={busy} />
      <ScoresSection eventItemId={eventItemId} roster={event.roster ?? []} rounds={event.rounds ?? []} scores={event.scores ?? []} />
      <AttendanceSection eventItemId={eventItemId} roster={event.roster ?? []} rounds={event.rounds ?? []} attendance={event.attendance ?? []} />
      <ClosureSection run={run} busy={busy} />
    </>
  );
}

// ── Registration settings ──
// Seeds from the event's STORED settings (passed from the server) so a save preserves
// capacity / window / allowed roles instead of clobbering them (DL-097 review). `settings`
// is the shaped getEventSettings output (or null when none exists yet).
function SettingsSection({ eventItemId, settings, run, busy }) {
  const s = settings ?? {};
  const [capacity, setCapacity] = useState(s.capacity == null ? "" : String(s.capacity));
  const [opensAt, setOpensAt] = useState(s.registrationOpensAt ? s.registrationOpensAt.slice(0, 16) : "");
  const [closesAt, setClosesAt] = useState(s.registrationClosesAt ? s.registrationClosesAt.slice(0, 16) : "");
  const [closed, setClosed] = useState(!!s.registrationClosed);
  const [roles, setRoles] = useState(() => new Set(s.allowedRegistrantRoles ?? []));

  const toggleRole = (key) =>
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // This form OVERWRITES the event's settings (it does not preload live values). Build the
  // full patch from state; `buildPatch({...})` lets "Go live now" override two keys.
  const buildPatch = (overrides = {}) => ({
    capacity: capacity === "" ? null : parseInt(capacity, 10),
    registrationOpensAt: opensAt ? new Date(opensAt).toISOString() : null,
    registrationClosesAt: closesAt ? new Date(closesAt).toISOString() : null,
    registrationClosed: closed,
    allowedRegistrantRoles: [...roles],
    ...overrides,
  });

  const save = () => run("event.settings.set", { eventItemId, patch: buildPatch() }, { success: "Saved." }).catch(() => {});

  const goLiveNow = () => {
    const iso = new Date().toISOString();
    setOpensAt(iso.slice(0, 16));
    setClosed(false);
    run("event.settings.set", { eventItemId, patch: buildPatch({ registrationOpensAt: iso, registrationClosed: false }) }, { success: "Event is live — registration open." }).catch(() => {});
  };

  return (
    <section className="adm-card" style={{ marginTop: 16 }}>
      <h3>Registration settings</h3>
      <p>Capacity, the registration window (schedules go-live), a manual close switch, and which member types may register. Saving overwrites this event&apos;s settings.</p>
      <div className="adm-form">
        <Field label="Capacity (blank = unlimited)">
          <input
            className="adm-input"
            type="number"
            min="0"
            placeholder="e.g. 120 — leave blank for unlimited"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </Field>
        <Field label={`Registration opens at (go-live) — ${dtHint}`}>
          <input
            className="adm-input"
            type="datetime-local"
            value={opensAt}
            onChange={(e) => setOpensAt(e.target.value)}
          />
        </Field>
        <Field label={`Registration closes at (deadline) — ${dtHint}`}>
          <input
            className="adm-input"
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
          />
        </Field>
        <label className="adm-check">
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} />
          Registration closed (overrides the window)
        </label>
        <Field label="Who can register (none checked = open to every member)">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {REGISTRANT_ROLE_OPTIONS.map((o) => (
              <label key={o.key} className="adm-check" style={{ margin: 0 }}>
                <input type="checkbox" checked={roles.has(o.key)} onChange={() => toggleRole(o.key)} /> {o.label}
              </label>
            ))}
          </div>
        </Field>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="adm-btn primary" disabled={busy} onClick={save}>
            Save settings
          </button>
          <button className="adm-btn ghost" disabled={busy} onClick={goLiveNow} title="Open registration immediately (sets 'opens' to now and clears force-close)">
            Go live now
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Rounds: create, plus edit/delete by pasted round id ──
function RoundsSection({ eventItemId, run, busy }) {
  const [create, setCreate] = useState({ name: "", description: "", startsAt: "", endsAt: "" });
  const [edit, setEdit] = useState({ roundId: "", name: "", description: "", startsAt: "", endsAt: "" });

  const doCreate = () => {
    run(
      "event.round.create",
      {
        eventItemId,
        input: {
          name: create.name,
          description: create.description,
          startsAt: create.startsAt,
          endsAt: create.endsAt,
        },
      },
      { success: "Saved." }
    )
      .then(() => setCreate({ name: "", description: "", startsAt: "", endsAt: "" }))
      .catch(() => {});
  };

  const doEdit = () => {
    if (!edit.roundId) return;
    // Only send fields the user actually filled — a blank input means "leave unchanged",
    // NOT "clear it" (otherwise renaming a round would silently wipe its start/end dates).
    const patch = {};
    for (const k of ["name", "description", "startsAt", "endsAt"]) {
      if (edit[k] !== "" && edit[k] != null) patch[k] = edit[k];
    }
    if (Object.keys(patch).length === 0) return;
    run("event.round.edit", { roundId: edit.roundId, patch }, { success: "Saved." }).catch(() => {});
  };

  const doDelete = () => {
    if (!edit.roundId) return;
    run("event.round.delete", { roundId: edit.roundId }, { success: "Saved." }).catch(() => {});
  };

  return (
    <section className="adm-card" style={{ marginTop: 16 }}>
      <h3>Rounds</h3>
      <p>
        Create a round below. To edit or delete an existing round, paste its{" "}
        <strong>round id</strong> (copy it from the event detail / playground page).
      </p>

      <div className="adm-form">
        <h4 style={{ fontSize: "0.85rem", fontWeight: 700 }}>Create round</h4>
        <Field label="Name">
          <input
            className="adm-input"
            placeholder="e.g. Prelims"
            value={create.name}
            onChange={(e) => setCreate({ ...create, name: e.target.value })}
          />
        </Field>
        <Field label="Description (optional)">
          <textarea
            className="adm-textarea"
            value={create.description}
            onChange={(e) => setCreate({ ...create, description: e.target.value })}
          />
        </Field>
        <div className="adm-checks">
          <Field label="Starts at">
            <input
              className="adm-input"
              type="datetime-local"
              value={create.startsAt}
              onChange={(e) => setCreate({ ...create, startsAt: e.target.value })}
            />
          </Field>
          <Field label="Ends at">
            <input
              className="adm-input"
              type="datetime-local"
              value={create.endsAt}
              onChange={(e) => setCreate({ ...create, endsAt: e.target.value })}
            />
          </Field>
        </div>
        <button className="adm-btn primary" disabled={busy || !create.name} onClick={doCreate}>
          Create round
        </button>
      </div>

      <hr style={{ margin: "18px 0", border: 0, borderTop: "1px solid var(--adm-border)" }} />

      <div className="adm-form">
        <h4 style={{ fontSize: "0.85rem", fontWeight: 700 }}>Edit / delete by round id</h4>
        <Field label="Round id">
          <input
            className="adm-input"
            placeholder="paste a round id…"
            value={edit.roundId}
            onChange={(e) => setEdit({ ...edit, roundId: e.target.value })}
          />
        </Field>
        <Field label="Name (blank = unchanged)">
          <input
            className="adm-input"
            value={edit.name}
            onChange={(e) => setEdit({ ...edit, name: e.target.value })}
          />
        </Field>
        <Field label="Description (blank = unchanged)">
          <textarea
            className="adm-textarea"
            value={edit.description}
            onChange={(e) => setEdit({ ...edit, description: e.target.value })}
          />
        </Field>
        <div className="adm-checks">
          <Field label="Starts at">
            <input
              className="adm-input"
              type="datetime-local"
              value={edit.startsAt}
              onChange={(e) => setEdit({ ...edit, startsAt: e.target.value })}
            />
          </Field>
          <Field label="Ends at">
            <input
              className="adm-input"
              type="datetime-local"
              value={edit.endsAt}
              onChange={(e) => setEdit({ ...edit, endsAt: e.target.value })}
            />
          </Field>
        </div>
        <div className="adm-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="adm-btn primary" disabled={busy || !edit.roundId} onClick={doEdit}>
            Save round
          </button>
          <ConfirmButton
            className="adm-btn danger sm"
            confirm="Delete this round? This cannot be undone."
            busy={busy || !edit.roundId}
            onConfirm={doDelete}
          >
            Delete round
          </ConfirmButton>
        </div>
      </div>
    </section>
  );
}

// ── Organizers: a replace-set builder. Each row targets exactly ONE of a club
// lineage key, a custom entity id, or a member email. ──
const EMPTY_ORG_ROW = { target: "email", value: "", kind: "organizer", role: "" };

function OrganizersSection({ eventItemId, run, busy }) {
  const [rows, setRows] = useState([{ ...EMPTY_ORG_ROW }]);

  const setRow = (i, patch) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((rs) => [...rs, { ...EMPTY_ORG_ROW }]);
  const removeRow = (i) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  const save = () => {
    const organizers = rows
      .filter((r) => r.value.trim() !== "")
      .map((r) => {
        const base = { kind: r.kind };
        if (r.role.trim()) base.role = r.role.trim();
        const v = r.value.trim();
        if (r.target === "lineage") base.orgUnitLineageKey = v;
        else if (r.target === "entity") base.entityId = v;
        else base.email = v;
        return base;
      });
    run("event.organizers.set", { eventItemId, organizers }, { success: "Saved." }).catch(() => {});
  };

  return (
    <section className="adm-card" style={{ marginTop: 16 }}>
      <h3>Organizers &amp; collaborators</h3>
      <p>
        This is a <strong>replace-set</strong>: saving overwrites the full organizer list with the
        rows below. Each row targets exactly one of a club <em>lineage key</em>, a custom{" "}
        <em>entity id</em>, or a member <em>email</em>.
      </p>
      <div className="adm-form">
        {rows.map((r, i) => (
          <div
            key={i}
            className="adm-checks"
            style={{ gridTemplateColumns: "140px 1fr 150px 1fr auto", alignItems: "end" }}
          >
            <Field label="Target by">
              <select
                className="adm-select"
                value={r.target}
                onChange={(e) => setRow(i, { target: e.target.value })}
              >
                <option value="email">Member email</option>
                <option value="lineage">Club lineage key</option>
                <option value="entity">Custom entity id</option>
              </select>
            </Field>
            <Field label="Value">
              <input
                className="adm-input"
                placeholder={
                  r.target === "email"
                    ? "member@iitjammu.ac.in"
                    : r.target === "lineage"
                    ? "club lineage key…"
                    : "entity id…"
                }
                value={r.value}
                onChange={(e) => setRow(i, { value: e.target.value })}
              />
            </Field>
            <Field label="Kind">
              <select
                className="adm-select"
                value={r.kind}
                onChange={(e) => setRow(i, { kind: e.target.value })}
              >
                <option value="organizer">Organizer</option>
                <option value="collaborator">Collaborator</option>
              </select>
            </Field>
            <Field label="Role (optional)">
              <input
                className="adm-input"
                placeholder="e.g. Lead, Judge"
                value={r.role}
                onChange={(e) => setRow(i, { role: e.target.value })}
              />
            </Field>
            <button
              className="adm-btn ghost sm"
              type="button"
              disabled={busy}
              onClick={() => removeRow(i)}
              title="Remove row"
            >
              Remove
            </button>
          </div>
        ))}
        <div className="adm-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="adm-btn ghost sm" type="button" disabled={busy} onClick={addRow}>
            + Add row
          </button>
          <button className="adm-btn primary" disabled={busy} onClick={save}>
            Save organizers (replace all)
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Custom organizing entities (year-scoped): create + list with status toggle ──
function EntitiesSection({ entities, run, busy }) {
  const [create, setCreate] = useState({ name: "", kind: "", description: "" });

  const doCreate = () => {
    run(
      "event.entity.create",
      { input: { name: create.name, kind: create.kind, description: create.description } },
      { success: "Saved." }
    )
      .then(() => setCreate({ name: "", kind: "", description: "" }))
      .catch(() => {});
  };

  const setStatus = (ent, status) =>
    run("event.entity.update", { id: ent.id, patch: { status } }, { success: "Saved." }).catch(() => {});

  return (
    <section className="adm-card" style={{ marginTop: 16 }}>
      <h3>Custom organizing entities</h3>
      <p>
        Ad-hoc organizing bodies for this year (beyond clubs/councils) — usable as event organizers
        above. Archive one to retire it without deleting.
      </p>

      <div className="adm-tablewrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Kind</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entities.map((ent) => {
              const archived = ent.status === "archived" || ent.status === "inactive";
              return (
                <tr key={ent.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{ent.name}</div>
                    <div style={{ fontSize: "0.76rem", color: "var(--adm-faint)" }}>
                      <span className="adm-code">{ent.id}</span>
                    </div>
                  </td>
                  <td>{ent.kind ?? "—"}</td>
                  <td>
                    <Badge tone={archived ? "muted" : "good"}>{ent.status ?? "active"}</Badge>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {archived ? (
                      <button
                        className="adm-btn ghost sm"
                        disabled={busy}
                        onClick={() => setStatus(ent, "active")}
                      >
                        Restore
                      </button>
                    ) : (
                      <ConfirmButton
                        className="adm-btn danger sm"
                        confirm={`Archive ${ent.name}?`}
                        busy={busy}
                        onConfirm={() => setStatus(ent, "archived")}
                      >
                        Archive
                      </ConfirmButton>
                    )}
                  </td>
                </tr>
              );
            })}
            {entities.length === 0 && (
              <tr>
                <td colSpan={4}>
                  <div className="adm-empty">No custom entities yet.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="adm-form" style={{ marginTop: 12 }}>
        <h4 style={{ fontSize: "0.85rem", fontWeight: 700 }}>New entity</h4>
        <div className="adm-checks" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Field label="Name">
            <input
              className="adm-input"
              placeholder="e.g. Fest Core Committee"
              value={create.name}
              onChange={(e) => setCreate({ ...create, name: e.target.value })}
            />
          </Field>
          <Field label="Kind (optional)">
            <input
              className="adm-input"
              placeholder="e.g. committee, cell"
              value={create.kind}
              onChange={(e) => setCreate({ ...create, kind: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Description (optional)">
          <textarea
            className="adm-textarea"
            value={create.description}
            onChange={(e) => setCreate({ ...create, description: e.target.value })}
          />
        </Field>
        <button className="adm-btn primary" disabled={busy || !create.name} onClick={doCreate}>
          Create entity
        </button>
      </div>
    </section>
  );
}

// ── Registrations: add by email + a RENDERED, searchable, collapsible roster with
//    inline per-row status/remove (no id-pasting) + CSV ──
function RegistrationsSection({ eventItemId, roster = [], rosterHasMore = false, run, busy }) {
  const [add, setAdd] = useState({ email: "", status: "confirmed", teamName: "" });

  const doAdd = () => {
    run(
      "event.registration.add",
      { input: { eventItemId, email: add.email, status: add.status, teamName: add.teamName } },
      { success: "Registrant added." }
    )
      .then(() => setAdd({ email: "", status: "confirmed", teamName: "" }))
      .catch(() => {});
  };

  const csv = (kind) => `/api/events/export?eventItemId=${encodeURIComponent(eventItemId)}&kind=${kind}`;

  return (
    <section className="adm-card" style={{ marginTop: 16 }}>
      <h3>Registrations</h3>
      <p>Add a registrant by email, or manage each one inline from the participant list below.</p>

      <div className="adm-form">
        <h4 style={{ fontSize: "0.85rem", fontWeight: 700 }}>Add registrant</h4>
        <div className="adm-checks" style={{ gridTemplateColumns: "1fr 150px 1fr" }}>
          <Field label="Member email">
            <input className="adm-input" placeholder="member@iitjammu.ac.in" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} />
          </Field>
          <Field label="Status">
            <select className="adm-select" value={add.status} onChange={(e) => setAdd({ ...add, status: e.target.value })}>
              <option value="confirmed">Confirmed</option>
              <option value="waitlisted">Waitlisted</option>
            </select>
          </Field>
          <Field label="Team name (optional)">
            <input className="adm-input" value={add.teamName} onChange={(e) => setAdd({ ...add, teamName: e.target.value })} />
          </Field>
        </div>
        <button className="adm-btn primary" disabled={busy || !add.email} onClick={doAdd}>Add registrant</button>
      </div>

      <RegisteredList eventItemId={eventItemId} registrations={roster} hasMore={rosterHasMore} />

      <div className="adm-pill-row" style={{ marginTop: 14 }}>
        <a className="adm-btn ghost sm" href={csv("participants")}>Download participants CSV</a>
        <a className="adm-btn ghost sm" href={csv("ranking")}>Download ranking CSV</a>
      </div>
    </section>
  );
}

// ── Scores: a per-round, searchable, collapsible per-participant points sheet ──
function ScoresSection({ eventItemId, roster = [], rounds = [], scores = [] }) {
  return (
    <section className="adm-card" style={{ marginTop: 16 }}>
      <h3>Scores</h3>
      <p>Pick a round (or Overall), then type each participant&apos;s points (an optional note per row). Saving is a <strong>replace-set</strong> for that round — a blank cell means unscored.</p>
      <div className="adm-form">
        <ScoreSheet eventItemId={eventItemId} rounds={rounds} scores={scores} registrations={roster} />
      </div>
    </section>
  );
}

// ── Attendance: a per-round, searchable, collapsible present/absent checklist ──
function AttendanceSection({ eventItemId, roster = [], rounds = [], attendance = [] }) {
  return (
    <section className="adm-card" style={{ marginTop: 16 }}>
      <h3>Attendance</h3>
      <p>Choose a round (or Overall), then tick who is <strong>present</strong>. Saving replaces that round&apos;s sheet, so the full list is submitted in one go.</p>
      <div className="adm-form">
        <AttendanceChecklist eventItemId={eventItemId} rounds={rounds} attendance={attendance} registrations={roster} />
      </div>
    </section>
  );
}

// ── Closure review: report id + comment + corrected budget ──
function ClosureSection({ run, busy }) {
  const [form, setForm] = useState({ id: "", reviewComment: "", correctedBudget: "" });

  const save = () => {
    if (!form.id) return;
    const patch = { reviewComment: form.reviewComment };
    if (form.correctedBudget !== "") patch.correctedBudget = parseFloat(form.correctedBudget);
    run("event.closure.review", { id: form.id, patch }, { success: "Saved." }).catch(() => {});
  };

  return (
    <section className="adm-card" style={{ marginTop: 16 }}>
      <h3>Closure review</h3>
      <p>
        Review a submitted closure report by its <strong>report id</strong> (copy it from the event
        detail page). Add a review comment and an optional corrected budget.
      </p>
      <div className="adm-form">
        <Field label="Closure report id">
          <input
            className="adm-input"
            placeholder="paste a closure report id…"
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
          />
        </Field>
        <Field label="Review comment">
          <textarea
            className="adm-textarea"
            value={form.reviewComment}
            onChange={(e) => setForm({ ...form, reviewComment: e.target.value })}
          />
        </Field>
        <Field label="Corrected budget (optional)">
          <input
            className="adm-input"
            type="number"
            step="0.01"
            placeholder="leave blank to keep the reported budget"
            value={form.correctedBudget}
            onChange={(e) => setForm({ ...form, correctedBudget: e.target.value })}
          />
        </Field>
        <button className="adm-btn primary" disabled={busy || !form.id} onClick={save}>
          Submit review
        </button>
      </div>
    </section>
  );
}
