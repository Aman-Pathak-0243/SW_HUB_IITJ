// /events/[slug]/live/host — the organizer LIVE-QUIZ control panel (Session 16). Plugin
// ON + login-only + GATED: getQuizHostView() re-authorizes via assertEventManage (GLOBAL
// staff/admin/dev OR SCOPED to a tagged organizing club lineage, DL-086/104) and THROWS
// 403 for anyone else — so a coordinator runs only their own event's quiz. All mutations
// still funnel through the ONE /api/admin/action registry (quiz.* actions).
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../../../components/Header";
import Footer from "../../../../components/Footer";
import { SignInCard } from "../../../../account/_components/AuthClient";
import LiveQuizHost from "../../../../components/LiveQuizHost";
import { isMemberPlatformEnabled } from "../../../../../lib/platform/flags.mjs";
import { loadMemberContext } from "../../../../../lib/member/server.mjs";
import { getPlaygroundEvent } from "../../../../../lib/events/playground.mjs";
import { getQuizHostView } from "../../../../../lib/quiz/sessions.mjs";

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

export default async function LiveQuizHostPage({ params }) {
  const { slug } = await params;
  if (!(await isMemberPlatformEnabled())) notFound();

  const ctx = await loadMemberContext();
  if (ctx.state === "unauthenticated") {
    return (
      <Shell>
        <div className="acc-root" style={{ minHeight: "auto", paddingTop: 0 }}>
          <SignInCard callbackUrl={`/events/${slug}/live/host`} showRequestLinks />
        </div>
      </Shell>
    );
  }
  if (ctx.state !== "ok") {
    return (
      <Shell>
        <p className="text-center text-gray-500">The live playground is available to members.</p>
      </Shell>
    );
  }

  const userId = ctx.member.id;
  const ev = await getPlaygroundEvent({ slug, userId });
  if (!ev) notFound();

  // GATED: assertEventManage inside getQuizHostView throws 401/403 for a non-manager.
  let view;
  try {
    view = await getQuizHostView(ev.id, { userId });
  } catch (e) {
    if (e?.status === 403 || e?.status === 401) {
      return (
        <Shell>
          <p className="text-center text-gray-500">You don&apos;t have permission to host this event&apos;s quiz.</p>
          <p className="mt-6 text-center"><Link href={`/events/${slug}/live`} className="text-[#003f87] underline">← Back to the live page</Link></p>
        </Shell>
      );
    }
    throw e;
  }

  return (
    <Shell>
      <p className="mb-4"><Link href={`/events/${slug}/live`} className="text-[#003f87] underline">← Live page</Link></p>
      <h1 className="mb-1 text-2xl font-bold text-[#003f87]">Host · {ev.title}</h1>
      <p className="mb-6 text-sm text-gray-500">Author questions, then run the live quiz. Participants join at <span className="font-mono">/events/{slug}/live</span>.</p>
      <LiveQuizHost view={view} />
    </Shell>
  );
}
