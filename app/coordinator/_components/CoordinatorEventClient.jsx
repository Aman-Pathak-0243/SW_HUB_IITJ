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

const REG_STATUSES = ["confirmed", "waitlisted", "cancelled"];

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

// email,points[,note] per line → [{ email, points, note }]
function parseScoreSheet(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [email, points, ...rest] = line.split(",").map((s) => s.trim());
      return { email, points: Number(points), note: rest.join(",") || undefined };
    })
    .filter((r) => r.email);
}
// email[,present][,note] per line → [{ email, present, note }] (present: y/yes/true/1/p ⇒ true)
function parseAttendanceSheet(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [email, present, ...rest] = line.split(",").map((s) => s.trim());
      const p = (present ?? "").toLowerCase();
      return { email, present: present == null || present === "" ? true : ["y", "yes", "true", "1", "p", "present"].includes(p), note: rest.join(",") || undefined };
    })
    .filter((r) => r.email);
}

export default function CoordinatorEventClient({ data }) {
  const eventItemId = data.event.id;
  return (
    <div>
      <SettingsSection eventItemId={eventItemId} settings={data.settings} />
      <RoundsSection eventItemId={eventItemId} rounds={data.rounds} />
      <RegistrationsSection eventItemId={eventItemId} registrations={data.registrations} hasMore={data.hasMoreRegistrations} />
      <ScoresSection eventItemId={eventItemId} rounds={data.rounds} scores={data.scores} />
      <AttendanceSection eventItemId={eventItemId} rounds={data.rounds} attendance={data.attendance} />
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

  const save = () =>
    run(
      "event.settings.set",
      {
        eventItemId,
        patch: {
          capacity: capacity === "" ? null : Number(capacity),
          registrationOpensAt: opensAt ? new Date(opensAt).toISOString() : null,
          registrationClosesAt: closesAt ? new Date(closesAt).toISOString() : null,
          registrationClosed: closed,
        },
      },
      { success: "Registration settings saved." }
    );

  return (
    <Section title="Registration settings" hint="Capacity drives the waitlist. Raising capacity auto-promotes waitlisted members.">
      <div className="coord-grid">
        <Field label="Capacity (blank = unlimited)">
          <input className="adm-input" type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Unlimited" />
        </Field>
        <Field label="Registration opens">
          <input className="adm-input" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />
        </Field>
        <Field label="Registration closes">
          <input className="adm-input" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
        </Field>
        <Field label="Force-close registration">
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} /> Closed regardless of window
          </label>
        </Field>
      </div>
      <button className="adm-btn primary" onClick={save} disabled={busy}>Save settings</button>
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
      hint="Manage the roster. Cancelling/removing a confirmed spot auto-promotes the earliest waitlisted member."
      aside={<a className="adm-btn ghost sm" href={csv}>Download participants CSV</a>}
    >
      {registrations.length ? (
        <div className="coord-tablewrap">
          <table className="adm-table">
            <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Registered</th><th></th></tr></thead>
            <tbody>
              {registrations.map((r) => (
                <tr key={r.id}>
                  <td>{r.userName ?? "—"}</td>
                  <td>{r.userEmail ?? "—"}</td>
                  <td><Badge tone={r.status === "confirmed" ? "good" : r.status === "waitlisted" ? "warn" : "muted"}>{r.status}</Badge></td>
                  <td>{r.registeredAt ? new Date(r.registeredAt).toLocaleDateString() : "—"}</td>
                  <td style={{ display: "flex", gap: 6 }}>
                    <select className="adm-select" defaultValue={r.status} style={{ maxWidth: 140 }}
                      onChange={(e) => run("event.registration.setStatus", { id: r.id, status: e.target.value }, { success: "Status updated." })}>
                      {REG_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <ConfirmButton confirm="Remove this registration?" busy={busy}
                      onConfirm={() => run("event.registration.remove", { id: r.id }, { success: "Registration removed." })}>
                      Remove
                    </ConfirmButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="coord-hint">No registrations yet.</p>
      )}
      {hasMore && <p className="coord-note">Showing the most recent registrations; download the CSV for the full roster.</p>}
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

function ScoresSection({ eventItemId, rounds, scores }) {
  const { run, busy } = useAdminAction();
  const [roundId, setRoundId] = useState(""); // "" = overall
  const [text, setText] = useState("");

  const save = () => {
    const parsed = parseScoreSheet(text);
    run("event.scores.set", { eventItemId, roundId: roundId || null, scores: parsed }, {
      success: `Saved ${parsed.length} score(s) (replace set).`,
    }).catch(() => {});
  };
  const csv = `/api/events/export?eventItemId=${encodeURIComponent(eventItemId)}&kind=scores`;

  return (
    <Section
      title="Scores"
      hint="Paste one line per member: email,points[,note]. Saving REPLACES the whole sheet for the chosen round (overall = round_id NULL). Missing accounts are reported, never created."
      aside={<a className="adm-btn ghost sm" href={csv}>Download scores CSV</a>}
    >
      <div className="coord-grid">
        <Field label="Round">
          <select className="adm-select" value={roundId} onChange={(e) => setRoundId(e.target.value)}>
            <option value="">Overall</option>
            {rounds.map((r) => <option key={r.id} value={r.id}>{r.roundNo}. {r.name}</option>)}
          </select>
        </Field>
      </div>
      {scores.length ? (
        <p className="coord-hint">{scores.length} score row(s) currently stored across rounds.</p>
      ) : null}
      <textarea className="coord-sheet" value={text} onChange={(e) => setText(e.target.value)} placeholder={"2023ume0243@iitjammu.ac.in,90\n2023ume0244@iitjammu.ac.in,85,Strong round"} />
      <button className="adm-btn primary" onClick={save} disabled={busy || !text.trim()}>Save scores (replace set)</button>
    </Section>
  );
}

function AttendanceSection({ eventItemId, rounds, attendance }) {
  const { run, busy } = useAdminAction();
  const [roundId, setRoundId] = useState("");
  const [text, setText] = useState("");

  const save = () => {
    const parsed = parseAttendanceSheet(text);
    run("event.attendance.mark", { eventItemId, roundId: roundId || null, attendance: parsed }, {
      success: `Marked ${parsed.length} member(s) (replace set).`,
    }).catch(() => {});
  };
  const csv = `/api/events/export?eventItemId=${encodeURIComponent(eventItemId)}&kind=attendance`;

  return (
    <Section
      title="Attendance"
      hint="Paste one line per member: email[,present][,note]. present ⇒ y/yes/1 (default present). Saving REPLACES the sheet for the chosen round."
      aside={<a className="adm-btn ghost sm" href={csv}>Download attendance CSV</a>}
    >
      <div className="coord-grid">
        <Field label="Round">
          <select className="adm-select" value={roundId} onChange={(e) => setRoundId(e.target.value)}>
            <option value="">Overall</option>
            {rounds.map((r) => <option key={r.id} value={r.id}>{r.roundNo}. {r.name}</option>)}
          </select>
        </Field>
      </div>
      {attendance.length ? <p className="coord-hint">{attendance.length} attendance row(s) currently stored.</p> : null}
      <textarea className="coord-sheet" value={text} onChange={(e) => setText(e.target.value)} placeholder={"2023ume0243@iitjammu.ac.in,y\n2023ume0244@iitjammu.ac.in,n,No-show"} />
      <button className="adm-btn primary" onClick={save} disabled={busy || !text.trim()}>Save attendance (replace set)</button>
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
