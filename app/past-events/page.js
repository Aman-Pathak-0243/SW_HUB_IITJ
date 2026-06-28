// Past Events page (Session 6) — /past-events. REWRITTEN as a Server Component
// that reads published current-year events from Postgres (lib/events/public.mjs)
// and shows the strictly-past ones via the tested splitEventsByDate rule.
//
// Fixes KNOWN_ISSUES #3: the V1 client page fetched /api/events and filtered on
// `data.success` / `data.events`, but the API returned a BARE ARRAY, so the page
// was ALWAYS empty. The past/upcoming split is now a single server-side, unit-
// tested function — no fragile client-side response-shape assumptions.
import Header from "../components/Header";
import Footer from "../components/Footer";
import EventsBoard from "../components/EventsBoard";
import { listPublicEvents, splitEventsByDate } from "../../lib/events/public.mjs";

export const dynamic = "force-dynamic";

export default async function PastEventsPage() {
  let past = [];
  let errored = false;
  try {
    const events = await listPublicEvents();
    ({ past } = splitEventsByDate(events));
  } catch (e) {
    console.error("[/past-events] failed to load events:", e?.message ?? e);
    errored = true;
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 pt-24 pb-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-[#003f87] text-center mb-12">Past Events</h1>
        {errored ? (
          <p className="max-w-3xl mx-auto px-6 text-center text-gray-500">This section is temporarily unavailable. Please try again shortly.</p>
        ) : (
          <EventsBoard sections={[{ key: "past", title: "Past Events", events: past, emptyText: "No past events yet." }]} />
        )}
      </main>
      <Footer />
    </>
  );
}
