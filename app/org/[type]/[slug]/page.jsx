// Data-driven org DETAIL page (Session 5; TABBED in M3) —
// /org/{councils,clubs,hostels,messes}/[slug]. Resolves the published unit for the
// current year (lib/org/public.mjs#getClubPageView — the base view PLUS the expanded
// club/council tabs: announcements, events organized, documents, achievements) and
// hands it to the single <OrgUnitTabs> renderer. The `[type]` segment is only for
// tidy URLs; the unit is resolved by its (year-unique) slug. force-dynamic so it
// always reflects the live current year rather than a build-time snapshot.
import Header from "../../../components/Header";
import Footer from "../../../components/Footer";
import OrgUnitTabs from "../../../components/OrgUnitTabs";
import InlineEditor from "../../../components/InlineEditor";
import { getClubPageView } from "../../../../lib/org/public.mjs";
import { resolveInlineEditCapability } from "../../../../lib/cms/content.mjs";
import { isInlineEditable } from "../../../../lib/cms/inline.mjs";
import { getServerAuthSession } from "../../../../lib/auth/session.mjs";

export const dynamic = "force-dynamic";

export default async function OrgUnitDetailPage({ params }) {
  const { slug } = await params;
  let view = null;
  let errored = false;
  try {
    view = await getClubPageView(slug);
  } catch (e) {
    errored = true; // a DB/read failure — distinct from "not published this year"
  }

  // Inline edit-on-page (DL-103): a coordinator scoped to this club (or staff/admin) may fix
  // the club/council profile (vision / Instagram) here. Best-effort viewer resolution — an
  // anonymous visitor has no session → no control; the content.edit service re-authorizes.
  let editCap = { canEdit: false, canPublish: false };
  if (view?.profile && isInlineEditable(view.profile.contentType)) {
    try {
      const session = await getServerAuthSession();
      if (session?.user?.id) {
        editCap = await resolveInlineEditCapability({ userId: session.user.id, academicYearId: view.year, orgUnitLineageKey: view.unit?.lineageKey ?? null });
      }
    } catch { /* never break the public page over a capability check */ }
  }

  return (
    <>
      <Header />
      <main className="min-h-screen">
        {errored ? (
          <div className="max-w-3xl mx-auto px-6 py-24 text-center text-gray-600">This page is temporarily unavailable. Please try again shortly.</div>
        ) : (
          <OrgUnitTabs view={view} />
        )}
        {editCap.canEdit && view?.profile && (
          <div className="fixed bottom-6 right-6 z-40">
            <InlineEditor
              contentType={view.profile.contentType}
              itemId={view.profile.id}
              canPublish={editCap.canPublish}
              values={{ vision: view.profile.payload?.vision ?? "", instagramUrl: view.profile.payload?.instagramUrl ?? "" }}
              label="Edit club details"
            />
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
