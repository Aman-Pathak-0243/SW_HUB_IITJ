// Data-driven Events page (Session 6) — /events. A Server Component that reads
// the published, current-year, in-window events from Postgres (lib/events/public.mjs)
// and splits them into Upcoming / Past with the tested splitEventsByDate rule.
// Replaces the V1 Mongo-fetching client pages; force-dynamic so it always reflects
// the live current year. Degrades gracefully when the DB is unavailable.
import Header from "../components/Header";
import Footer from "../components/Footer";
import EventsBoard from "../components/EventsBoard";
import { listPublicEvents, splitEventsByDate } from "../../lib/events/public.mjs";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
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
