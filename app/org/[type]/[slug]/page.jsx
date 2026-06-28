// Data-driven org DETAIL page (Session 5) — /org/{councils,clubs,hostels,messes}/[slug].
// Resolves the published unit for the current year (lib/org/public.mjs) and hands
// it to the single <OrgUnitPage> renderer. The `[type]` segment is only for tidy
// URLs; the unit is resolved by its (year-unique) slug. force-dynamic so it
// always reflects the live current year rather than a build-time snapshot.
import Header from "../../../components/Header";
import Footer from "../../../components/Footer";
import OrgUnitPage from "../../../components/OrgUnitPage";
import { getPublicOrgUnit } from "../../../../lib/org/public.mjs";

export const dynamic = "force-dynamic";

export default async function OrgUnitDetailPage({ params }) {
  const { slug } = await params;
  let view = null;
  let errored = false;
  try {
    view = await getPublicOrgUnit(slug);
  } catch (e) {
    errored = true; // a DB/read failure — distinct from "not published this year"
  }
  return (
    <>
      <Header />
      <main className="min-h-screen">
        {errored ? (
          <div className="max-w-3xl mx-auto px-6 py-24 text-center text-gray-600">This page is temporarily unavailable. Please try again shortly.</div>
        ) : (
          <OrgUnitPage view={view} />
        )}
      </main>
      <Footer />
    </>
  );
}
