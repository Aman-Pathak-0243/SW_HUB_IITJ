"use client";

// M5 — the member self-service register / cancel control on an event detail page.
// Posts to the gated POST /api/events/participate route (requireMember +
// assertCanParticipate). Shows the member's current status and the next outcome
// (confirmed vs waitlisted by capacity). Refreshes the server-rendered page on success.
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterButton({ eventItemId, open, mine, nextOutcome, canParticipate }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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

  return (
    <div className="evt-reg">
      {open ? (
        <>
          <button className="evt-btn primary" disabled={busy} onClick={() => act("register")}>
            {busy ? "…" : nextOutcome === "waitlisted" ? "Join the waitlist" : "Register"}
          </button>
          {nextOutcome === "waitlisted" && <span className="evt-reg-note">This event is full — you'll join the waitlist.</span>}
        </>
      ) : (
        <p className="evt-reg-note">Registration is closed for this event.</p>
      )}
      {error && <span className="evt-reg-err">{error}</span>}
    </div>
  );
}
