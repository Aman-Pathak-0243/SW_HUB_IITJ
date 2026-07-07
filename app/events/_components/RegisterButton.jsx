"use client";

// M5 — the member self-service register / cancel control on an event detail page.
// Posts to the gated POST /api/events/participate route (requireMember +
// assertCanParticipate). Shows the member's current status and the next outcome
// (confirmed vs waitlisted by capacity). Refreshes the server-rendered page on success.
//
// Session 14:
//  • DL-098 — LIVE COUNTDOWN: the open/closed state is recomputed on the client every
//    second from the registration window, so the button auto-enables at `opensAt` and
//    shows "opens in …" / "closes in …" WITHOUT a page reload. The server re-checks on
//    submit (isRegistrationOpen), so the client timer is a UX aid, never the authority.
//  • DL-097 — ELIGIBILITY: when an event restricts registration to specific role types
//    and the signed-in member is not eligible, the button is replaced with a note listing
//    the allowed types (the server also rejects an ineligible POST with ROLE_NOT_ELIGIBLE).
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { registrationPhase, formatDuration, REGISTRANT_ROLE_OPTIONS } from "../../../lib/events/forms.mjs";

const ROLE_LABEL = new Map(REGISTRANT_ROLE_OPTIONS.map((o) => [o.key, o.label]));
const roleLabel = (key) => ROLE_LABEL.get(key) ?? key;

export default function RegisterButton({
  eventItemId,
  mine,
  nextOutcome,
  canParticipate,
  eligible = true,
  allowedRegistrantRoles = [],
  registrationOpensAt = null,
  registrationClosesAt = null,
  registrationClosed = false,
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Re-evaluate the registration phase every second so the button flips live at the
  // scheduled open/close time. `tick` just forces a re-render; the phase is derived below.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  async function act(action) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/events/participate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, eventItemId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "The request failed.");
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!canParticipate) {
    return (
      <p className="evt-reg-note warn">
        Your account is inactive — you can browse events but cannot register right now.
      </p>
    );
  }

  // An existing registration always shows the manage (cancel) control, regardless of
  // window/eligibility — a registered member can still cancel.
  if (mine) {
    return (
      <div className="evt-reg">
        <span className={`evt-badge ${mine.status === "confirmed" ? "good" : "warn"}`}>
          {mine.status === "confirmed" ? "You're registered" : mine.status === "waitlisted" ? "You're waitlisted" : mine.status}
        </span>
        <button className="evt-btn ghost" disabled={busy} onClick={() => act("cancel")}>
          {busy ? "…" : "Cancel registration"}
        </button>
        {error && <span className="evt-reg-err">{error}</span>}
      </div>
    );
  }

  // Not eligible by account type (DL-097) — no register button; explain who may register.
  if (!eligible) {
    const roles = (allowedRegistrantRoles ?? []).map(roleLabel).join(", ");
    return (
      <p className="evt-reg-note warn">
        This event is open to {roles || "specific member types"} only — your account type isn&apos;t eligible to register.
      </p>
    );
  }

  const phase = registrationPhase({ registrationOpensAt, registrationClosesAt, registrationClosed });

  if (phase.phase === "before") {
    return (
      <div className="evt-reg">
        <button className="evt-btn primary" disabled title="Registration hasn't opened yet">
          Registration opens in {formatDuration(phase.msUntilOpen)}
        </button>
        <span className="evt-reg-note">Registration opens on {fmtDateTime(registrationOpensAt)}.</span>
        {error && <span className="evt-reg-err">{error}</span>}
      </div>
    );
  }

  if (phase.phase !== "open") {
    return <p className="evt-reg-note">Registration is closed for this event.</p>;
  }

  // Open — allow register / join waitlist; show a "closes in …" hint when a close time is set.
  return (
    <div className="evt-reg">
      <button className="evt-btn primary" disabled={busy} onClick={() => act("register")}>
        {busy ? "…" : nextOutcome === "waitlisted" ? "Join the waitlist" : "Register"}
      </button>
      {nextOutcome === "waitlisted" && <span className="evt-reg-note">This event is full — you&apos;ll join the waitlist.</span>}
      {phase.msUntilClose != null && phase.msUntilClose > 0 && (
        <span className="evt-reg-note">Registration closes in {formatDuration(phase.msUntilClose)}.</span>
      )}
      {error && <span className="evt-reg-err">{error}</span>}
    </div>
  );
}

function fmtDateTime(v) {
  if (!v) return "a scheduled time";
  try {
    return new Date(v).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "a scheduled time";
  }
}
