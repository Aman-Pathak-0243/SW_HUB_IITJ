"use client";

// The scoped-coordinator EVENT management client (Session 13, DL-096). Unlike the admin
// EventsClient (which submits blind), this renders the LIVE operational data the server
// loaded (via getManagedEvent, gated by assertEventManage) and offers ONLY the SCOPED
// actions a coordinator may run: settings, rounds, registrations, scores, attendance, and
// their OWN closure report. It posts the same `event.*` actions to the shared
// /api/admin/action route (each service re-authorizes at scope). Central-only actions
// (organizer tagging, closure REVIEW, custom entities) are intentionally absent.
import React, { useState } from "react";
import { useAdminAction, Field, ConfirmButton, Badge } from "../../admin/_components/ui";
import { RegisteredList, AttendanceChecklist, ScoreSheet } from "../../admin/_components/EventRoster";
import { REGISTRANT_ROLE_OPTIONS } from "../../../lib/events/forms.mjs";

function Section({ title, hint, children, aside }) {
  return (
    <div className="adm-card" style={{ marginBottom: 18 }}>
      <div className="adm-section-head">
        <div className="adm-pagehead" style={{ marginBottom: 0 }}>
          <h2 style={{ fontSize: "1.05rem" }}>{title}</h2>
          {hint && <p className="coord-hint" style={{ margin: "4px 0 0" }}>{hint}</p>}
        </div>
        {aside}
      </div>
      {children}
    </div>
  );
}

export default function CoordinatorEventClient({ data }) {
  const eventItemId = data.event.id;
  return (
    <div>
      <SettingsSection eventItemId={eventItemId} settings={data.settings} />
      <RoundsSection eventItemId={eventItemId} rounds={data.rounds} />
      <RegistrationsSection eventItemId={eventItemId} registrations={data.registrations} hasMore={data.hasMoreRegistrations} />
      <ScoresSection eventItemId={eventItemId} rounds={data.rounds} scores={data.scores} registrations={data.registrations} />
      <AttendanceSection eventItemId={eventItemId} rounds={data.rounds} attendance={data.attendance} registrations={data.registrations} />
      <ClosureSection eventItemId={eventItemId} reports={data.closureReports} />
    </div>
  );
}

function SettingsSection({ eventItemId, settings }) {
  const { run, busy } = useAdminAction();
  const [capacity, setCapacity] = useState(settings.capacity == null ? "" : String(settings.capacity));
  const [opensAt, setOpensAt] = useState(settings.registrationOpensAt ? settings.registrationOpensAt.slice(0, 16) : "");
  const [closesAt, setClosesAt] = useState(settings.registrationClosesAt ? settings.registrationClosesAt.slice(0, 16) : "");
  const [closed, setClosed] = useState(!!settings.registrationClosed);
  const [roles, setRoles] = useState(new Set(settings.allowedRegistrantRoles ?? []));

  const toggleRole = (key) =>
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Build the full settings patch from current state (+ optional overrides). Sending all
  // keys keeps the upsert authoritative; an omitted key would just leave the stored value.
  const buildPatch = (overrides = {}) => ({
    capacity: capacity === "" ? null : Number(capacity),
    registrationOpensAt: opensAt ? new Date(opensAt).toISOString() : null,
    registrationClosesAt: closesAt ? new Date(closesAt).toISOString() : null,
    registrationClosed: closed,
    allowedRegistrantRoles: [...roles],
    ...overrides,
  });

  const save = () => run("event.settings.set", { eventItemId, patch: buildPatch() }, { success: "Registration settings saved." });

  // "Go live now" — open registration immediately (opens = now, clear force-close). The
  // register button auto-enables; if capacity is blank this is "unlimited until the deadline".
  const goLiveNow = () => {
    const iso = new Date().toISOString();
    setOpensAt(iso.slice(0, 16));
    setClosed(false);
    run("event.settings.set", { eventItemId, patch: buildPatch({ registrationOpensAt: iso, registrationClosed: false }) }, { success: "Event is live — registration open." }).catch(() => {});
  };

  return (
    <Section title="Registration settings" hint="Capacity drives the waitlist (blank = unlimited). Set an 'opens' time to schedule go-live — the register button counts down and auto-enables. Leave the roles empty to open registration to every member.">
      <div className="coord-grid">
        <Field label="Capacity (blank = unlimited)">
          <input className="adm-input" type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Unlimited" />
        </Field>
        <Field label="Registration opens (go-live time)">
          <input className="adm-input" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
        </Field>
        <Field label="Registration closes (deadline)">
          <input className="adm-input" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        </Field>
        <Field label="Force-close registration">
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} /> Closed regardless of window
          </label>
        </Field>
      </div>
      <Field label="Who can register (none checked = open to every member)">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 4 }}>
          {REGISTRANT_ROLE_OPTIONS.map((o) => (
            <label key={o.key} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={roles.has(o.key)} onChange={() => toggleRole(o.key)} /> {o.label}
            </label>
          ))}
        </div>
      </Field>
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button className="adm-btn primary" onClick={save} disabled={busy}>Save settings</button>
        <button className="adm-btn ghost" onClick={goLiveNow} disabled={busy} title="Open registration immediately (sets 'opens' to now and clears force-close)">Go live now</button>
      </div>
    </Section>
  );
}

function RoundsSection({ eventItemId, rounds }) {
  const { run, busy } = useAdminAction();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const add = () => {
    if (!name.trim()) return;
    run("event.round.create", { eventItemId, input: { name: name.trim(), description: description.trim() || undefined } }, { success: "Round added." })
      .then(() => { setName(""); setDescription(""); })
      .catch(() => {});
  };

  return (
    <Section title="Rounds / stages" hint="Rounds hold per-round scores and attendance. Deleting a round removes its scores/attendance.">
      {rounds.length ? (
        <div className="coord-tablewrap">
          <table className="adm-table">
            <thead><tr><th>#</th><th>Name</th><th>When</th><th></th></tr></thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r.id}>
                  <td>{r.roundNo}</td>
                  <td>{r.name}{r.description ? <span className="coord-ev-meta"> · {r.description}</span> : null}</td>
                  <td>{r.startsAt ? new Date(r.startsAt).toLocaleString() : "—"}{r.endsAt ? ` → ${new Date(r.endsAt).toLocaleString()}` : ""}</td>
                  <td>
                    <ConfirmButton confirm={`Delete round "${r.name}" and its scores/attendance?`} busy={busy}
                      onConfirm={() => run("event.round.delete", { roundId: r.id }, { success: "Round deleted." })}>
                      Delete
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="coord-hint">No rounds yet.</p>
      )}
      <div className="adm-form-grid" style={{ marginTop: 12 }}>
        <Field label="New round name"><input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Prelims" /></Field>
        <Field label="Description (optional)"><input className="adm-input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
      <button className="adm-btn primary" onClick={add} disabled={busy || !name.trim()}>Add round</button>
    </Section>
  );
}

function RegistrationsSection({ eventItemId, registrations, hasMore }) {
  const { run, busy } = useAdminAction();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("confirmed");

  const add = () => {
    if (!email.trim()) return;
    run("event.registration.add", { input: { eventItemId, email: email.trim(), status } }, { success: "Registration added." })
      .then(() => setEmail(""))
      .catch(() => {});
  };
  const csv = `/api/events/export?eventItemId=${encodeURIComponent(eventItemId)}&kind=participants`;

  return (
    <Section
      title="Registrations"
      hint="Search the roster, change a status or remove a participant inline. Cancelling/removing a confirmed spot auto-promotes the earliest waitlisted member."
      aside={<a className="adm-btn ghost sm" href={csv}>Download participants CSV</a>}
    >
      <RegisteredList eventItemId={eventItemId} registrations={registrations} hasMore={hasMore} />
      <div className="adm-form-grid" style={{ marginTop: 12 }}>
        <Field label="Add participant (email)"><input className="adm-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="2023ume0243@iitjammu.ac.in" /></Field>
        <Field label="As">
          <select className="adm-select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="confirmed">confirmed</option>
            <option value="waitlisted">waitlisted</option>
          </select>
        </Field>
      </div>
      <button className="adm-btn primary" onClick={add} disabled={busy || !email.trim()}>Add registration</button>
    </Section>
  );
}

function ScoresSection({ eventItemId, rounds, scores, registrations }) {
  return (
    <Section
      title="Scores"
      hint="Pick a round (or Overall), then type each participant's points (an optional note per row). Search for a name in large lists. Saving REPLACES that round's sheet — a blank cell means unscored."
    >
      <ScoreSheet eventItemId={eventItemId} rounds={rounds} scores={scores} registrations={registrations} />
    </Section>
  );
}

function AttendanceSection({ eventItemId, rounds, attendance, registrations }) {
  return (
    <Section
      title="Attendance"
      hint="Pick a round (or Overall), then tick who is present. Search for a name in large lists. Saving REPLACES that round's sheet with the full list."
    >
      <AttendanceChecklist eventItemId={eventItemId} rounds={rounds} attendance={attendance} registrations={registrations} />
    </Section>
  );
}

function ClosureSection({ eventItemId, reports }) {
  const { run, busy } = useAdminAction();
  const [roleContribution, setRoleContribution] = useState("");
  const [reportedBudget, setReportedBudget] = useState("");

  const submit = () => {
    if (!roleContribution.trim()) return;
    run("event.closure.submit", { input: { eventItemId, roleContribution: roleContribution.trim(), reportedBudget: reportedBudget === "" ? null : Number(reportedBudget) } }, {
      success: "Closure report submitted for central review.",
    }).then(() => { setRoleContribution(""); setReportedBudget(""); }).catch(() => {});
  };

  return (
    <Section title="Closure report" hint="Submit YOUR closure report (role + contribution + a self-reported budget) in markdown. A central admin reviews it — you can't review reports here.">
      {reports.length ? (
        <div className="coord-tablewrap" style={{ marginBottom: 12 }}>
          <table className="adm-table">
            <thead><tr><th>Submitter</th><th>Status</th><th>Reported budget</th><th>Corrected</th><th>Review</th></tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>{r.submitterName ?? r.submitterEmail ?? "—"}</td>
                  <td><Badge tone={r.status === "reviewed" ? "good" : "warn"}>{r.status}</Badge></td>
                  <td>{r.reportedBudget ?? "—"}</td>
                  <td>{r.correctedBudget ?? "—"}</td>
                  <td>{r.reviewComment ? `${r.reviewComment}${r.reviewerName ? ` — ${r.reviewerName}` : ""}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="coord-hint">No closure reports submitted yet.</p>
      )}
      <Field label="Your role & contribution (markdown)">
        <textarea className="coord-sheet" value={roleContribution} onChange={(e) => setRoleContribution(e.target.value)} placeholder="What your team did, outcomes, notes…" />
      </Field>
      <div className="coord-grid">
        <Field label="Reported budget (optional)"><input className="adm-input" type="number" min="0" step="0.01" value={reportedBudget} onChange={(e) => setReportedBudget(e.target.value)} /></Field>
      </div>
      <button className="adm-btn primary" onClick={submit} disabled={busy || !roleContribution.trim()}>Submit closure report</button>
    </Section>
  );
}
