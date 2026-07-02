"use client";

// Session 16 (DL-108) — the LIVE registration leaderboard: subscribes to an event's
// registration-counts SSE stream and shows the confirmed / waitlisted / total counts
// updating in real time as members register or cancel. The cheap first proof of the SSE
// transport on an already-DB-concurrency-safe write path.
import { useState } from "react";
import { useEventSource } from "../live/_components/useEventSource";

export default function LiveRegistrationBoard({ eventItemId, initial = null, capacity = null }) {
  const [counts, setCounts] = useState(initial ?? { confirmed: 0, waitlisted: 0, total: 0 });
  const [live, setLive] = useState(false);

  useEventSource(eventItemId ? `/api/live/registration/${eventItemId}` : null, (data) => {
    if (data?.type === "counts") {
      setCounts({ confirmed: data.confirmed ?? 0, waitlisted: data.waitlisted ?? 0, total: data.total ?? 0 });
      setLive(true);
    }
  });

  const Stat = ({ label, value, tone }) => (
    <div className="flex flex-col items-center rounded-lg bg-white px-5 py-3 shadow-sm border border-gray-100">
      <span className={`text-2xl font-bold ${tone ?? "text-[#003f87]"}`}>{value}</span>
      <span className="text-xs uppercase tracking-wide text-gray-500">{label}</span>
    </div>
  );

  return (
    <section className="rounded-xl bg-gray-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
        <h3 className="text-sm font-semibold text-gray-700">Live registrations</h3>
      </div>
      <div className="flex flex-wrap gap-3">
        <Stat label="Confirmed" value={counts.confirmed} />
        <Stat label="Waitlisted" value={counts.waitlisted} tone="text-amber-600" />
        <Stat label="Total" value={counts.total} tone="text-gray-800" />
        {capacity != null && <Stat label="Capacity" value={capacity} tone="text-gray-800" />}
      </div>
    </section>
  );
}
