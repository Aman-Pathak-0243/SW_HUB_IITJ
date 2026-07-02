// /events/[slug]/live — the LOGIN-ONLY live quiz + live registration board (Session 16,
// DL-104..108). Plugin ON only. Mirrors the /events/[slug] gating (unauthenticated →
// sign-in; revoked / view-disabled held out). Shows the live registration board always,
// the live quiz player when a session exists, and a host-controls link to managers.
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../../components/Header";
import Footer from "../../../components/Footer";
import { SignInCard } from "../../../account/_components/AuthClient";
import LiveRegistrationBoard from "../../../components/LiveRegistrationBoard";
import LiveQuizPlayer from "../../../components/LiveQuizPlayer";
import { isMemberPlatformEnabled } from "../../../../lib/platform/flags.mjs";
import { loadMemberContext } from "../../../../lib/member/server.mjs";
import { getPlaygroundEvent } from "../../../../lib/events/playground.mjs";
import { getRegistrationCounts } from "../../../../lib/events/registration.mjs";
import { getLiveSessionForEvent, getSessionState } from "../../../../lib/quiz/sessions.mjs";
import { canManageEvent } from "../../../../lib/events/authz.mjs";

export const dynamic = "force-dynamic";

function Shell({ children }) {
  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 pt-24 pb-20">
        <div className="max-w-3xl mx-auto px-6">{children}</div>
      </main>
      <Footer />
    </>
  );
}

export default async function LiveEventPage({ params }) {
  const { slug } = await params;
  if (!(await isMemberPlatformEnabled())) notFound(); // no live features when the plugin is off

  const ctx = await loadMemberContext();
  if (ctx.state === "unauthenticated") {
    return (
      <Shell>
        <div className="acc-root" style={{ minHeight: "auto", paddingTop: 0 }}>
          <SignInCard callbackUrl={`/events/${slug}/live`} showRequestLinks />
        </div>
      </Shell>
    );
  }
  if (ctx.state === "revoked" || ctx.state === "view-disabled") {
    return (
      <Shell>
        <p className="text-center text-gray-500">The live playground is available to members.</p>
        <p className="mt-6 text-center"><Link href="/" className="text-[#003f87] underline">Back to the site</Link></p>
      </Shell>
    );
  }

  const userId = ctx.member.id;
  const ev = await getPlaygroundEvent({ slug, userId });
  if (!ev) notFound();

  const [session, counts, canManage] = await Promise.all([
    getLiveSessionForEvent(ev.id),
    getRegistrationCounts(ev.id),
    canManageEvent({ userId }, ev.id),
  ]);
  const initialState = session ? await getSessionState(session.id, { userId, forHost: false }) : null;

  return (
    <Shell>
      <p className="mb-4"><Link href={`/events/${slug}`} className="text-[#003f87] underline">← {ev.title}</Link></p>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#003f87]">Live · {ev.title}</h1>
        {canManage && (
          <Link href={`/events/${slug}/live/host`} className="rounded bg-[#003f87] px-3 py-1.5 text-sm text-white">Host controls</Link>
        )}
      </div>

      {session ? (
        <div className="mb-6">
          <LiveQuizPlayer sessionId={session.id} initial={initialState} />
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-gray-500">
          No live quiz is running right now. {canManage ? "Open host controls to start one." : "Check back when the organizers go live."}
        </div>
      )}

      <LiveRegistrationBoard eventItemId={ev.id} initial={counts} capacity={ev.registration?.capacity ?? null} />
    </Shell>
  );
}
