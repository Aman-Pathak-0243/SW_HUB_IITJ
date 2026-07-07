// Flagship Events — now DATA-DRIVEN (Session 13). Reads the curated content_type=
// 'flagship_event' from Postgres (lib/events/public.mjs#listPublicFlagshipEvents), so
// anything an editor creates/publishes/pins in the admin Content module reflects here.
// force-dynamic → always the live current year. Degrades to a friendly empty/error state.
import Header from "../components/Header";
import Footer from "../components/Footer";
import Image from "next/image";
import { listPublicFlagshipEvents } from "../../lib/events/public.mjs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Flagship Events · Student Affairs IIT Jammu" };

export default async function FlagshipEventsPage() {
  let events = [];
  let errored = false;
  try {
    events = await listPublicFlagshipEvents();
  } catch (e) {
    console.error("[/Flagship-events] load failed:", e?.message ?? e);
    errored = true;
  }

  return (
    <>
      <Header />
      <main className="bg-white min-h-screen py-12 px-4 sm:px-8 md:px-16">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-center text-[#003f87] mb-12">
          Flagship Events of IIT Jammu
        </h1>

        {errored ? (
          <p className="max-w-3xl mx-auto px-6 text-center text-gray-500">This section is temporarily unavailable.</p>
        ) : events.length ? (
          <div className="max-w-7xl mx-auto grid gap-10 md:gap-14">
            {events.map((event, index) => (
              <div
                key={event.id}
                className="flex flex-col md:flex-row items-center gap-8 bg-[#f5f8ff] shadow-md rounded-2xl p-6 md:p-10 border border-[#d9e4f5]"
              >
                {event.imageUrl && (
                  <div className="w-full md:w-1/3">
                    <Image
                      src={event.imageUrl}
                      alt={`${event.title} poster`}
                      width={500}
                      height={300}
                      className="rounded-xl shadow-lg object-cover w-full h-auto"
                      priority={index === 0}
                    />
                  </div>
                )}
                <div className={event.imageUrl ? "w-full md:w-2/3" : "w-full"}>
                  <div className="flex items-center gap-3 mb-4 flex-wrap">
                    <h2 className="text-2xl sm:text-3xl font-bold text-[#003f87]">{event.title}</h2>
                    {event.category && (
                      <span className="text-xs uppercase tracking-wide text-white bg-[#FF6B00] rounded-full px-3 py-1">{event.category}</span>
                    )}
                  </div>
                  <p className="text-gray-700 text-sm sm:text-base md:text-lg leading-relaxed text-justify">
                    {event.description || event.summary}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="max-w-3xl mx-auto px-6 text-center text-gray-500">
            No flagship events published yet. An editor can add them in the admin panel (Content → Flagship Event).
          </p>
        )}
      </main>
      <Footer />
    </>
  );
}
