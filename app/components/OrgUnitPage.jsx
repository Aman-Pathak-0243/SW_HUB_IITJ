// Data-driven org-unit renderer (Session 5). ONE presentational component that
// renders ANY org unit — council, club, hostel or mess — from the public view
// returned by lib/org/public.mjs#getPublicOrgUnit. This single component replaces
// the four near-identical hardcoded V1 Clubs pages (KNOWN_ISSUES #13): the page
// is now a function of data, not copy-pasted JSX.
//
// Pure presentational (no DB, no client state) — the route component fetches the
// view and passes it in, so this is trivially reusable for any unit type and any
// academic year. Images are resolved via the view's `media` map.
import Link from "next/link";
import Image from "next/image";
import { formatTime } from "../../lib/org/normalize.mjs";
import ResourcesSection from "./ResourcesSection";

function mediaUrl(view, id) {
  return id ? view.media?.[id]?.url ?? null : null;
}

// A single person card (roster member): photo, title, name, optional profile link.
function PersonCard({ member }) {
  const inner = (
    <div className="flex items-center gap-4 bg-blue-50 rounded-xl p-4">
      {member.person.photoUrl ? (
        <div className="relative w-14 h-14 rounded-full overflow-hidden shrink-0 bg-gray-100">
          <Image src={member.person.photoUrl} alt={member.person.name ?? ""} fill className="object-cover" />
        </div>
      ) : (
        <div className="w-14 h-14 rounded-full shrink-0 bg-[#003f87]/10 flex items-center justify-center text-[#003f87] font-bold">
          {(member.person.name ?? "?").trim().charAt(0)}
        </div>
      )}
      <div>
        {member.title && <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full inline-block mb-1">{member.title}</span>}
        <p className="font-semibold text-[#003f87]">{member.person.name}</p>
      </div>
    </div>
  );
  return member.person.profileUrl ? (
    <Link href={member.person.profileUrl} target="_blank" rel="noopener noreferrer" className="block hover:shadow-md transition rounded-xl">
      {inner}
    </Link>
  ) : (
    inner
  );
}

function Section({ title, children }) {
  return (
    <section className="max-w-6xl mx-auto px-6 mt-12">
      <h2 className="text-2xl font-bold text-[#003f87] mb-6">{title}</h2>
      {children}
    </section>
  );
}

export default function OrgUnitPage({ view }) {
  if (!view) {
    return <div className="max-w-3xl mx-auto px-6 py-24 text-center text-gray-600">This page is not available for the current year.</div>;
  }

  const { unit, profile, roster = [], children = [], resources = [] } = view;
  const payload = profile?.payload ?? {};
  const heroId = payload.heroMediaId || payload.logoMediaId || payload.buildingMediaId || payload.imageMediaId;
  const heroUrl = mediaUrl(view, heroId);
  const leads = roster.filter((m) => m.isLead);
  const members = roster.filter((m) => !m.isLead);

  return (
    <div className="pb-20">
      {/* Header banner */}
      <section className="bg-gradient-to-r from-blue-50 to-blue-100 pt-24 pb-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center gap-8">
          {heroUrl && (
            <div className="relative w-40 h-40 rounded-2xl overflow-hidden bg-white shadow shrink-0">
              <Image src={heroUrl} alt={unit.name} fill className="object-contain p-2" />
            </div>
          )}
          <div>
            <p className="uppercase tracking-wide text-sm text-[#003f87]/70 font-semibold">{unit.typeName}</p>
            <h1 className="text-4xl font-bold text-[#003f87]">{profile?.title ?? unit.name}</h1>
            {payload.vision && <p className="mt-3 text-gray-700 max-w-2xl">{payload.vision}</p>}
            {payload.instagramUrl && (
              <Link href={payload.instagramUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-white bg-[#003f87] hover:bg-[#06376e] px-4 py-2 rounded-lg font-semibold transition">
                Instagram
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Mission (clubs/councils) */}
      {Array.isArray(payload.missionPoints) && payload.missionPoints.length > 0 && (
        <Section title="Mission">
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            {payload.missionPoints.map((m, i) => (
              <li key={i}>{m.text}</li>
            ))}
          </ul>
        </Section>
      )}

      {/* Mess facts */}
      {(payload.location || payload.capacity != null) && (
        <Section title="Details">
          <div className="space-y-2 text-gray-700">
            {payload.location && <p>📍 Location — {payload.location}</p>}
            {payload.capacity != null && <p>👥 Capacity — {payload.capacity} students</p>}
            {payload.officeEmail && <p>✉️ {payload.officeEmail}</p>}
          </div>
        </Section>
      )}
      {payload.officeEmail && !(payload.location || payload.capacity != null) && (
        <Section title="Contact">
          <p className="text-gray-700">✉️ {payload.officeEmail}</p>
        </Section>
      )}

      {/* Meal timings (messes) */}
      {Array.isArray(payload.mealTimings) && payload.mealTimings.length > 0 && (
        <Section title="Mess Timings">
          <div className="flex flex-wrap gap-4">
            {payload.mealTimings.map((t, i) => (
              <div key={i} className="bg-white rounded-xl shadow px-5 py-3 text-center">
                <p className="font-bold text-[#003f87] capitalize">{t.meal}</p>
                <p className="text-sm text-gray-600">{formatTime(t.startTime)} – {formatTime(t.endTime)}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Roster */}
      {leads.length > 0 && (
        <Section title="Leadership">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {leads.map((m) => (
              <PersonCard key={m.id} member={m} />
            ))}
          </div>
        </Section>
      )}
      {members.length > 0 && (
        <Section title={leads.length ? "Team" : "Members"}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {members.map((m) => (
              <PersonCard key={m.id} member={m} />
            ))}
          </div>
        </Section>
      )}

      {/* Resources (per-unit PDFs / Drive links) */}
      <ResourcesSection resources={resources} />

      {/* Children (a council's clubs) */}
      {children.length > 0 && (
        <Section title="Clubs">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {children.map((c) => (
              <Link key={c.unit.id} href={`/org/${c.unit.typeKey}/${c.unit.slug}`} className="bg-white rounded-xl shadow hover:shadow-xl transition p-6 block">
                <h3 className="text-lg font-bold text-[#003f87]">{c.unit.name}</h3>
                {c.profile?.payload?.vision && <p className="text-sm text-gray-600 mt-2 line-clamp-3">{c.profile.payload.vision}</p>}
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
