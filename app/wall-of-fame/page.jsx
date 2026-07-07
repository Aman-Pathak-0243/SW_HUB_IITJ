// Public WALL OF FAME (M4) — the institute's student achievements for the current
// academic year. A Server Component: it reads the published achievements server-side
// (lib/achievements/public.mjs#listWallOfFame — Session-Component read, batched
// queries, CWV media via cloudinaryAutoUrl) and renders them with the shared
// <AchievementCard>. force-dynamic so it always reflects the live current year.
// Degrades gracefully when the plugin is off (empty) or the DB is unavailable.
import Header from "../components/Header";
import Footer from "../components/Footer";
import AchievementCard from "../components/AchievementCard";
import InlineEditor from "../components/InlineEditor";
import { listWallOfFame } from "../../lib/achievements/public.mjs";
import { isMemberPlatformEnabled } from "../../lib/platform/flags.mjs";
import { resolveInlineEditCapability } from "../../lib/cms/content.mjs";
import { getCurrentYearId } from "../../lib/year/context.mjs";
import { getServerAuthSession } from "../../lib/auth/session.mjs";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Wall of Fame — IIT Jammu",
  description: "Student achievements and recognitions across the institute.",
};

export default async function WallOfFamePage() {
  let achievements = [];
  let errored = false;
  try {
    // The Wall of Fame is a member-platform surface; when the plugin is off it shows
    // the empty state rather than reading achievement content (fail-closed, DL-058).
    if (await isMemberPlatformEnabled()) {
      achievements = await listWallOfFame();
    }
  } catch {
    errored = true;
  }

  // Inline edit-on-page (DL-103): achievements are central (NOT org-bound), so editing them
  // needs UNSCOPED content.update — staff / admin / content-editor. Resolve once for the page
  // (same scope for every card). Best-effort; anonymous or non-privileged → no control.
  let editCap = { canEdit: false, canPublish: false };
  if (achievements.length) {
    try {
      const session = await getServerAuthSession();
      if (session?.user?.id) {
        const yearId = await getCurrentYearId();
        editCap = await resolveInlineEditCapability({ userId: session.user.id, academicYearId: yearId, orgUnitLineageKey: null });
      }
    } catch { /* never break the public page over a capability check */ }
  }

  return (
    <>
      <Header />
      <main className="min-h-screen">
        <section className="bg-gradient-to-r from-blue-50 to-blue-100 pt-24 pb-12">
          <div className="max-w-6xl mx-auto px-6">
            <p className="uppercase tracking-wide text-sm text-[#003f87]/70 font-semibold">Recognitions</p>
            <h1 className="text-4xl font-bold text-[#003f87]">Wall of Fame</h1>
            <p className="text-gray-600 mt-2 max-w-2xl">Celebrating the achievements of our students, clubs and councils across the institute.</p>
          </div>
        </section>

        <section className="max-w-6xl mx-auto px-6 py-10">
          {errored ? (
            <div className="text-center text-gray-600 py-16">This page is temporarily unavailable. Please try again shortly.</div>
          ) : achievements.length === 0 ? (
            <div className="text-center text-gray-500 py-16">No achievements have been published yet. Check back soon!</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {achievements.map((a) => (
                <div key={a.id}>
                  <AchievementCard achievement={a} />
                  {editCap.canEdit && (
                    <div className="mt-2 flex justify-end">
                      <InlineEditor
                        contentType="achievement"
                        itemId={a.id}
                        canPublish={editCap.canPublish}
                        values={{ title: a.title, summary: a.summary, category: a.category }}
                        label="Edit"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
