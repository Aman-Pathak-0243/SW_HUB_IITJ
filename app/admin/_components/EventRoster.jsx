"use client";

// Shared event-management UI used by BOTH the admin Event Playground (EventsClient) and the
// scoped-coordinator event page (CoordinatorEventClient): a rendered, SEARCHABLE, COLLAPSIBLE
// registered-participant list (with inline status change + remove) and a per-round attendance
// CHECKLIST (present/absent, prefilled from the round's stored attendance). Both self-contain
// their `event.*` actions via useAdminAction (each service re-authorizes at scope), so a caller
// just passes the data. Colors use --adm-* vars with fallbacks so they render on either surface.
import React, { useMemo, useState } from "react";
import { useAdminAction, Field, ConfirmButton, Badge } from "./ui";

const BORDER = "var(--adm-border, #e3e6ef)";
const MUTED = "var(--adm-muted, #6b7280)";
const regTone = (s) => (s === "confirmed" ? "good" : s === "waitlisted" ? "info" : "muted");
const ellipsis = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

// The rows to show for a per-round sheet (scores / attendance): the active registrants PLUS
// anyone who already has a record for this round but isn't (or is no longer) on the roster —
// so a replace-set save never silently drops an off-roster score/attendance row.
function mergeRows(participants, records, roundId) {
  const byUser = new Map(participants.map((r) => [r.userId, r]));
  for (const rec of records) {
    if ((rec.roundId ?? null) !== (roundId ?? null)) continue;
    if (!byUser.has(rec.userId)) byUser.set(rec.userId, { userId: rec.userId, userName: rec.userName, userEmail: rec.userEmail, status: "off-roster" });
  }
  return [...byUser.values()];
}

// A collapsible, searchable panel — keeps long lists from filling the screen. The list body
// scrolls within a fixed max-height; collapsing hides it entirely.
export function Panel({ title, count, subtitle, defaultOpen = false, search, onSearch, searchPlaceholder, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: 14, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: "hidden" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--adm-subtle, rgba(0,0,0,0.02))", border: 0, cursor: "pointer", textAlign: "left", font: "inherit" }}
        aria-expanded={open}
      >
        <span style={{ display: "inline-block", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s", fontSize: "0.7rem" }}>▶</span>
        <strong style={{ fontSize: "0.85rem" }}>{title}</strong>
        {count != null && <span className="adm-badge muted" style={{ marginLeft: "auto" }}>{count}</span>}
      </button>
      {open && (
        <div style={{ padding: "10px 12px" }}>
          {subtitle && <p style={{ fontSize: "0.78rem", color: MUTED, margin: "0 0 8px" }}>{subtitle}</p>}
          {onSearch && (
            <input className="adm-input" placeholder={searchPlaceholder || "Search…"} value={search} onChange={(e) => onSearch(e.target.value)} style={{ marginBottom: 8 }} />
          )}
          <div style={{ maxHeight: 320, overflowY: "auto", border: `1px solid ${BORDER}`, borderRadius: 6 }}>{children}</div>
        </div>
      )}
    </div>
  );
}

// Searchable, collapsible roster with inline per-row status change + remove (no id-pasting).
export function RegisteredList({ eventItemId, registrations = [], hasMore = false, defaultOpen = true }) {
  const { run, busy } = useAdminAction();
  const [q, setQ] = useState("");
  const [rowStatus, setRowStatus] = useState({}); // registrationId -> pending status in the select

  const setStatus = (id, status) => run("event.registration.setStatus", { id, status }, { success: "Status updated." }).catch(() => {});
  const remove = (id) => run("event.registration.remove", { id }, { success: "Registration removed." }).catch(() => {});

  const counts = useMemo(() => {
    let confirmed = 0, waitlisted = 0;
    for (const r of registrations) { if (r.status === "confirmed") confirmed++; else if (r.status === "waitlisted") waitlisted++; }
    return { confirmed, waitlisted };
  }, [registrations]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return registrations;
    return registrations.filter((r) => (r.userName || "").toLowerCase().includes(s) || (r.userEmail || "").toLowerCase().includes(s) || (r.teamName || "").toLowerCase().includes(s));
  }, [registrations, q]);

  return (
    <Panel
      title="Registered participants"
      count={`${counts.confirmed} confirmed · ${counts.waitlisted} waitlisted`}
      defaultOpen={defaultOpen}
      subtitle={hasMore ? "Showing the first 1000 registrants — use the CSV for the complete list." : undefined}
      search={q}
      onSearch={setQ}
      searchPlaceholder="Search by name, email, or team…"
    >
      {filtered.length === 0 ? (
        <div className="adm-empty" style={{ padding: 12 }}>{registrations.length === 0 ? "No registrations yet." : "No participants match your search."}</div>
      ) : (
        filtered.map((r) => {
          const pending = rowStatus[r.id] ?? r.status;
          return (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderTop: `1px solid ${BORDER}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem", ...ellipsis }}>{r.userName || "—"}</div>
                <div style={{ fontSize: "0.78rem", color: MUTED, ...ellipsis }}>{r.userEmail}{r.teamName ? ` · ${r.teamName}` : ""}</div>
              </div>
              <Badge tone={regTone(r.status)}>{r.status}</Badge>
              <select className="adm-select" style={{ width: 130 }} value={pending} disabled={busy} onChange={(e) => setRowStatus({ ...rowStatus, [r.id]: e.target.value })}>
                <option value="confirmed">Confirmed</option>
                <option value="waitlisted">Waitlisted</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <button className="adm-btn ghost sm" disabled={busy || pending === r.status} onClick={() => setStatus(r.id, pending)} title="Apply the selected status">Set</button>
              <ConfirmButton className="adm-btn danger sm" confirm={`Remove ${r.userEmail} from this event?`} busy={busy} onConfirm={() => remove(r.id)}>✕</ConfirmButton>
            </div>
          );
        })
      )}
    </Panel>
  );
}

// Round dropdown + a searchable, collapsible present/absent checklist prefilled from the
// round's stored attendance. Saving submits the FULL list (attendance is a replace-set).
export function AttendanceChecklist({ eventItemId, rounds = [], attendance = [], registrations = [] }) {
  const [roundId, setRoundId] = useState(""); // "" = Overall (no round)
  const participants = useMemo(() => registrations.filter((r) => r.status !== "cancelled"), [registrations]);
  const csvRound = roundId || "overall";

  return (
    <>
      <Field label="Round">
        <select className="adm-select" value={roundId} onChange={(e) => setRoundId(e.target.value)}>
          <option value="">Overall (no round)</option>
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>{`Round ${r.roundNo}: ${r.name}`}</option>
          ))}
        </select>
      </Field>
      {/* key remounts with fresh prefilled state when the round changes */}
      <AttendanceEditor key={roundId || "overall"} eventItemId={eventItemId} roundId={roundId || null} participants={participants} attendance={attendance} />
      <div className="adm-pill-row" style={{ marginTop: 12 }}>
        <a className="adm-btn ghost sm" href={`/api/events/export?eventItemId=${encodeURIComponent(eventItemId)}&kind=attendance&roundId=${encodeURIComponent(csvRound)}`}>Download attendance CSV</a>
      </div>
    </>
  );
}

function AttendanceEditor({ eventItemId, roundId, participants, attendance }) {
  const { run, busy } = useAdminAction();
  const rows = useMemo(() => mergeRows(participants, attendance, roundId), [participants, attendance, roundId]);
  const initial = useMemo(() => {
    const m = {};
    for (const a of attendance) if ((a.roundId ?? null) === (roundId ?? null)) m[a.userId] = !!a.present;
    return m;
  }, [attendance, roundId]);
  const [present, setPresent] = useState(initial);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => (r.userName || "").toLowerCase().includes(s) || (r.userEmail || "").toLowerCase().includes(s));
  }, [rows, q]);

  const presentCount = rows.reduce((n, r) => n + (present[r.userId] ? 1 : 0), 0);
  const setAllFiltered = (val) => setPresent((p) => { const m = { ...p }; for (const r of filtered) m[r.userId] = val; return m; });

  const save = () =>
    run(
      "event.attendance.mark",
      { eventItemId, roundId, attendance: rows.map((r) => ({ userId: r.userId, present: !!present[r.userId] })) },
      { success: `Attendance saved — ${presentCount}/${rows.length} present.` }
    ).catch(() => {});

  return (
    <>
      <Panel title="Mark attendance" count={`${presentCount} / ${rows.length} present`} defaultOpen search={q} onSearch={setQ} searchPlaceholder="Search by name or email…">
        {filtered.length === 0 ? (
          <div className="adm-empty" style={{ padding: 12 }}>{rows.length === 0 ? "No participants to mark (no active registrations)." : "No participants match your search."}</div>
        ) : (
          filtered.map((r) => (
            <label key={r.userId} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderTop: `1px solid ${BORDER}`, cursor: "pointer" }}>
              <input type="checkbox" checked={!!present[r.userId]} disabled={busy} onChange={(e) => setPresent((p) => ({ ...p, [r.userId]: e.target.checked }))} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem", ...ellipsis }}>{r.userName || "—"}</div>
                <div style={{ fontSize: "0.78rem", color: MUTED, ...ellipsis }}>{r.userEmail}</div>
              </div>
              <Badge tone={regTone(r.status)}>{r.status}</Badge>
            </label>
          ))
        )}
      </Panel>
      <div className="adm-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button className="adm-btn ghost sm" disabled={busy || filtered.length === 0} onClick={() => setAllFiltered(true)}>Mark all present{q ? " (filtered)" : ""}</button>
        <button className="adm-btn ghost sm" disabled={busy || filtered.length === 0} onClick={() => setAllFiltered(false)}>Clear{q ? " (filtered)" : " all"}</button>
        <button className="adm-btn primary" disabled={busy || rows.length === 0} onClick={save}>Save attendance</button>
      </div>
    </>
  );
}

// Round dropdown + a searchable, collapsible per-participant SCORE sheet, prefilled from the
// round's stored scores. Saving submits every row that has a points value (scores are a
// replace-set for that round; a blank cell = unscored/removed). Off-roster scores are kept.
export function ScoreSheet({ eventItemId, rounds = [], scores = [], registrations = [] }) {
  const [roundId, setRoundId] = useState(""); // "" = Overall (roundId null)
  const participants = useMemo(() => registrations.filter((r) => r.status !== "cancelled"), [registrations]);
  const csvRound = roundId || "overall";
  return (
    <>
      <Field label="Round">
        <select className="adm-select" value={roundId} onChange={(e) => setRoundId(e.target.value)}>
          <option value="">Overall (no round)</option>
          {rounds.map((r) => (
            <option key={r.id} value={r.id}>{`Round ${r.roundNo}: ${r.name}`}</option>
          ))}
        </select>
      </Field>
      {/* key remounts with fresh prefilled state when the round changes */}
      <ScoreEditor key={roundId || "overall"} eventItemId={eventItemId} roundId={roundId || null} participants={participants} scores={scores} />
      <div className="adm-pill-row" style={{ marginTop: 12 }}>
        <a className="adm-btn ghost sm" href={`/api/events/export?eventItemId=${encodeURIComponent(eventItemId)}&kind=scores&roundId=${encodeURIComponent(csvRound)}`}>Download scores CSV</a>
      </div>
    </>
  );
}

function ScoreEditor({ eventItemId, roundId, participants, scores }) {
  const { run, busy } = useAdminAction();
  const rows = useMemo(() => mergeRows(participants, scores, roundId), [participants, scores, roundId]);
  const initial = useMemo(() => {
    const pts = {}, notes = {};
    for (const s of scores) {
      if ((s.roundId ?? null) !== (roundId ?? null)) continue;
      pts[s.userId] = s.points == null ? "" : String(s.points);
      if (s.note) notes[s.userId] = s.note;
    }
    return { pts, notes };
  }, [scores, roundId]);
  const [pts, setPts] = useState(initial.pts);
  const [notes, setNotes] = useState(initial.notes);
  const [q, setQ] = useState("");

  const hasScore = (uid) => { const v = pts[uid]; return v != null && v !== "" && !Number.isNaN(Number(v)); };
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => (r.userName || "").toLowerCase().includes(s) || (r.userEmail || "").toLowerCase().includes(s));
  }, [rows, q]);
  const scoredCount = rows.reduce((n, r) => n + (hasScore(r.userId) ? 1 : 0), 0);

  const save = () => {
    const entries = [];
    for (const r of rows) {
      if (!hasScore(r.userId)) continue; // blank = unscored → excluded from the replace-set
      const e = { userId: r.userId, points: Number(pts[r.userId]) };
      if (notes[r.userId]) e.note = notes[r.userId];
      entries.push(e);
    }
    run("event.scores.set", { eventItemId, roundId, scores: entries }, { success: `Scores saved — ${entries.length} scored (replace set).` }).catch(() => {});
  };

  return (
    <>
      <Panel title="Enter scores" count={`${scoredCount} / ${rows.length} scored`} defaultOpen search={q} onSearch={setQ} searchPlaceholder="Search by name or email…">
        {filtered.length === 0 ? (
          <div className="adm-empty" style={{ padding: 12 }}>{rows.length === 0 ? "No participants to score (no active registrations)." : "No participants match your search."}</div>
        ) : (
          filtered.map((r) => (
            <div key={r.userId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderTop: `1px solid ${BORDER}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: "0.85rem", ...ellipsis }}>{r.userName || "—"}</div>
                <div style={{ fontSize: "0.78rem", color: MUTED, ...ellipsis }}>{r.userEmail}</div>
              </div>
              <input className="adm-input" type="number" step="any" placeholder="pts" value={pts[r.userId] ?? ""} disabled={busy} style={{ width: 84 }} onChange={(e) => setPts((p) => ({ ...p, [r.userId]: e.target.value }))} />
              <input className="adm-input" placeholder="note (optional)" value={notes[r.userId] ?? ""} disabled={busy} style={{ width: 170 }} onChange={(e) => setNotes((n) => ({ ...n, [r.userId]: e.target.value }))} />
            </div>
          ))
        )}
      </Panel>
      <div className="adm-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button className="adm-btn primary" disabled={busy || rows.length === 0} onClick={save}>Save scores (replace set)</button>
      </div>
    </>
  );
}
