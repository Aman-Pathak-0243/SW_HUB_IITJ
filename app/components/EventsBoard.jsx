// Presentational events board (Session 6). Renders one or more titled sections
// (e.g. Upcoming / Past) of shaped events (lib/events/public.mjs) using the
// existing V1 <EventCard>. Pure — no DB, no client state; the route component
// fetches and splits the events and passes the sections in. Shared by /events
// and /past-events so the past/upcoming rendering lives in exactly one place.
import EventCard from "./EventCard";

// Hosts allowed by next.config.mjs images.remotePatterns. next/image THROWS at
// render for any other remote host, which would crash the whole page — so we only
// hand a remote cover to EventCard when its host is allowlisted (local "/public"
// paths are always fine). Off-host / placeholder covers fall back to EventCard's
// own no-image card. Kept in sync with next.config.mjs: every media asset (V1
// Cloudinary + the Session-7 /public→Cloudinary migration) resolves through
// res.cloudinary.com (KNOWN_ISSUES #17 — the unused unsplash hosts were dropped).
const ALLOWED_IMAGE_HOSTS = new Set(["res.cloudinary.com"]);

function safeCoverSrc(url) {
  if (!url) return "";
  if (url.startsWith("/")) return url; // local /public asset
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(u.hostname) ? url : "";
  } catch {
    return ""; // not a URL (e.g. the base64 placeholder marker) → no image
  }
}

// Map a shaped public event → EventCard's V1 props.
function toCard(e) {
  return { _id: e.id, title: e.title, description: e.body ?? e.summary ?? "", date: e.eventDate, image: safeCoverSrc(e.coverUrl) };
}

export default function EventsBoard({ sections = [] }) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-8">
      {sections.map((s) => (
        <section key={s.key} className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-2xl font-bold text-[#003f87]">{s.title}</h2>
            <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full bg-[#FF6B00] text-white text-xs font-bold">
              {s.events.length}
            </span>
          </div>
          {s.events.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {s.events.map((e) => (
                <EventCard key={e.id} event={toCard(e)} />
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 italic py-10 border border-dashed border-[#003f87]/15 rounded-2xl bg-white">
              {s.emptyText ?? "Nothing here yet."}
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
