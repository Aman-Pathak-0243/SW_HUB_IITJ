// /events — the Centralized Event Playground (M5, DL-084) when the member_platform
// plugin is ON: a LOGIN-ONLY listing of every published event with its organizers +
// registration state (members register from the detail page). When the plugin is OFF,
// this stays the public Sessions-1–10 events board (unchanged behavior). force-dynamic.
import Link from "next/link";
import Header from "../components/Header";
import Footer from "../components/Footer";
import EventsBoard from "../components/EventsBoard";
import { SignInCard } from "../account/_components/AuthClient";
import { listPublicEvents, splitEventsByDate } from "../../lib/events/public.mjs";
import { isMemberPlatformEnabled } from "../../lib/platform/flags.mjs";
import { loadMemberContext } from "../../lib/member/server.mjs";
import { listPlaygroundEvents } from "../../lib/events/playground.mjs";
import "./events.css";

export const dynamic = "force-dynamic";

function fmtDate(v) {
  if (!v) return "Date TBA";
  try {
    return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "Date TBA";
  }
}

// The classic public board (plugin OFF) — unchanged Session-6 behavior.
async function PublicBoard() {
  let upcoming = [];
  let past = [];
  let errored = false;
  try {
    const events = await listPublicEvents();
    ({ upcoming, past } = splitEventsByDate(events));
  } catch (e) {
    console.error("[/events] failed to load events:", e?.message ?? e);
    errored = true;
  }
  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 pt-24 pb-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-[#003f87] text-center mb-12">Events</h1>
        {errored ? (
          <p className="max-w-3xl mx-auto px-6 text-center text-gray-500">This section is temporarily unavailable. Please try again shortly.</p>
        ) : (
          <EventsBoard
            sections={[
              { key: "upcoming", title: "Upcoming", events: upcoming, emptyText: "No upcoming events at the moment." },
              { key: "past", title: "Past Events", events: past, emptyText: "No past events yet." },
            ]}
          />
        )}
      </main>
      <Footer />
    </>
  );
}

function PlaygroundCard({ e }) {
  const reg = e.registration ?? {};
  return (
    <Link href={`/events/${e.slug ?? e.id}`} className="pg-card">
      <div className="pg-card-cover" style={e.coverUrl ? { backgroundImage: `url(${e.coverUrl})` } : undefined} />
      <div className="pg-card-body">
        {e.category && <span className="pg-chip">{e.category}</span>}
        <h3>{e.title ?? "Untitled event"}</h3>
        <span className="pg-meta">{fmtDate(e.eventDate)}</span>
        {e.organizers?.length > 0 && <span className="pg-orgs">By {e.organizers.join(", ")}</span>}
        <div className="pg-card-foot">
          <span className={`evt-badge ${reg.open ? "good" : "muted"}`}>{reg.open ? "Registration open" : "Registration closed"}</span>
          <span className="pg-meta">
            {reg.confirmed ?? 0}
            {reg.capacity != null ? `/${reg.capacity}` : ""} registered
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function EventsPage() {
  const enabled = await isMemberPlatformEnabled();
  if (!enabled) return <PublicBoard />;

  // Plugin ON → login-only playground. loadMemberContext never throws.
  const ctx = await loadMemberContext();

  let inner;
  if (ctx.state === "unauthenticated") {
    inner = (
      <div className="acc-root" style={{ minHeight: "auto", paddingTop: 0 }}>
        <SignInCard callbackUrl="/events" showRequestLinks />
      </div>
    );
  } else if (ctx.state === "revoked" || ctx.state === "view-disabled") {
    inner = (
      <p className="max-w-2xl mx-auto px-6 text-center text-gray-500">
        The event playground is available to members. If you believe you should have access, contact a portal administrator.
      </p>
    );
  } else {
    let events = [];
    try {
      events = await listPlaygroundEvents();
    } catch (e) {
      console.error("[/events playground] failed:", e?.message ?? e);
    }
    inner = (
      <>
        <p className="max-w-3xl mx-auto px-6 text-center text-gray-500 mb-8">
          Discover and register for events across the institute. <Link href="/events/organized" className="text-[#003f87] underline">See all events organized →</Link>
        </p>
        <div className="max-w-6xl mx-auto px-6">
          {events.length ? (
            <div className="pg-grid">
              {events.map((e) => <PlaygroundCard key={e.id} e={e} />)}
            </div>
          ) : (
            <p className="text-center text-gray-500">No events have been published yet. Check back soon.</p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 pt-24 pb-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-[#003f87] text-center mb-4">Event Playground</h1>
        {inner}
      </main>
      <Footer />
    </>
  );
}
