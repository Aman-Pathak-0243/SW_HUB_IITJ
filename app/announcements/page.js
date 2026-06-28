// Data-driven Announcements page (Session 6) — /announcements. REWRITTEN as a
// Server Component that reads the published, current-year, in-window announcements
// from Postgres (lib/events/public.mjs), PINNED-FIRST (DL-010). The V1 page
// conflated "Announcements & Events" and fetched the Mongo events API; in V2
// announcements are their own content type (announcement_payload), and events
// live on their own /events and /past-events pages (linked below).
// force-dynamic so it always reflects the live current year.
import Link from "next/link";
import Header from "../components/Header";
import Footer from "../components/Footer";
import AnnouncementCard from "../components/AnnouncementCard";
import { listPublicAnnouncements } from "../../lib/events/public.mjs";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  let announcements = [];
  let errored = false;
  try {
    announcements = await listPublicAnnouncements();
  } catch (e) {
    console.error("[/announcements] failed to load announcements:", e?.message ?? e);
    errored = true;
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-8">
          <div className="text-center mb-12">
            <h1 className="text-3xl sm:text-4xl font-bold text-[#003f87]">Announcements</h1>
            <p className="mt-3 text-gray-500">
              Looking for events?{" "}
              <Link href="/events" className="text-[#FF6B00] font-semibold hover:underline">
                See upcoming &amp; past events
              </Link>
              .
            </p>
          </div>

          {errored ? (
            <p className="text-center text-gray-500">Announcements are temporarily unavailable. Please try again shortly.</p>
          ) : announcements.length ? (
            <div className="space-y-5">
              {announcements.map((a) => (
                <AnnouncementCard key={a.id} announcement={a} />
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 italic py-12 border border-dashed border-[#003f87]/15 rounded-2xl bg-white">
              No announcements at the moment.
            </p>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
