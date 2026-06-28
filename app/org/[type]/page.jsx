// Data-driven org LIST page (Session 5) — /org/clubs, /org/councils,
// /org/hostels, /org/messes. Reads published units for the current year from
// lib/org/public.mjs. For /org/clubs it groups clubs under their council (the
// single page that replaces the four hardcoded V1 council pages, KNOWN_ISSUES
// #13); for the others it lists the units as tiles. force-dynamic so it is never
// statically prerendered at build (it always reads the live current year).
import Link from "next/link";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { listPublicOrgUnits, getPublicOrgStructure } from "../../../lib/org/public.mjs";

export const dynamic = "force-dynamic";

// URL segment → { typeKey, title } (the only publicly listable kinds).
const TYPES = {
  councils: { typeKey: "council", title: "Councils" },
  clubs: { typeKey: "club", title: "Clubs" },
  hostels: { typeKey: "hostel", title: "Hostels" },
  messes: { typeKey: "mess", title: "Messes" },
};

function Tile({ type, entry }) {
  const logo = entry.media?.[entry.profile?.payload?.logoMediaId ?? entry.profile?.payload?.buildingMediaId ?? entry.profile?.payload?.imageMediaId]?.url;
  return (
    <Link href={`/org/${type}/${entry.unit.slug}`} className="bg-white rounded-xl shadow hover:shadow-xl transition overflow-hidden block">
      {logo && (
        <div className="relative w-full aspect-[4/3] bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt={entry.unit.name} className="w-full h-full object-contain p-3" />
        </div>
      )}
      <div className="p-5">
        <h3 className="text-lg font-bold text-[#003f87]">{entry.unit.name}</h3>
        {entry.profile?.payload?.vision && <p className="text-sm text-gray-600 mt-2 line-clamp-3">{entry.profile.payload.vision}</p>}
      </div>
    </Link>
  );
}

export default async function OrgListPage({ params }) {
  const { type } = await params;
  const meta = TYPES[type];

  if (!meta) {
    return (
      <>
        <Header />
        <main className="max-w-3xl mx-auto px-6 py-28 text-center text-gray-600">Unknown section “{type}”.</main>
        <Footer />
      </>
    );
  }

  let body;
  try {
    if (type === "clubs") {
      const structure = await getPublicOrgStructure();
      body = structure.length ? (
        structure.map(({ council, clubs }) => (
          <section key={council.id} className="max-w-7xl mx-auto px-6 mt-14">
            <h2 className="text-2xl font-bold text-[#003f87] mb-6">
              <Link href={`/org/councils/${council.slug}`} className="hover:underline">{council.name}</Link>
            </h2>
            {clubs.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {clubs.map((c) => (
                  <Tile key={c.unit.id} type="clubs" entry={c} />
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No published clubs yet.</p>
            )}
          </section>
        ))
      ) : (
        <p className="max-w-3xl mx-auto px-6 text-center text-gray-500">No clubs are published for the current year yet.</p>
      );
    } else {
      const units = await listPublicOrgUnits(meta.typeKey);
      body = units.length ? (
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {units.map((entry) => (
            <Tile key={entry.unit.id} type={type} entry={entry} />
          ))}
        </div>
      ) : (
        <p className="max-w-3xl mx-auto px-6 text-center text-gray-500">Nothing is published for the current year yet.</p>
      );
    }
  } catch (e) {
    body = <p className="max-w-3xl mx-auto px-6 text-center text-gray-500">This section is temporarily unavailable.</p>;
  }

  return (
    <>
      <Header />
      <main className="bg-blue-50 min-h-screen pt-24 pb-20">
        <h1 className="text-center text-4xl font-bold text-[#003f87] mb-4">{meta.title}</h1>
        {body}
      </main>
      <Footer />
    </>
  );
}
