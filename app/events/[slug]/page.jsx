// /events/[slug] — the event detail (M5, DL-084/087). Plugin ON → the LOGIN-ONLY
// playground detail: hybrid content (details + markdown problem statement + eligibility
// + ordered blocks), organizers, rounds, live registration + waitlist state (register
// via the gated client control), and per-round + overall rankings. Plugin OFF → a
// minimal public event detail (Sessions 1–10 had no detail route). force-dynamic.
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { AchievementBlocks } from "../../components/AchievementCard";
import { SignInCard } from "../../account/_components/AuthClient";
import RegisterButton from "../_components/RegisterButton";
import { renderMarkdown } from "../../../lib/markdown/render.mjs";
import { isMemberPlatformEnabled } from "../../../lib/platform/flags.mjs";
import { loadMemberContext } from "../../../lib/member/server.mjs";
import { getPlaygroundEvent } from "../../../lib/events/playground.mjs";
import { getPublicEventBySlug } from "../../../lib/events/public.mjs";
import "../events.css";

export const dynamic = "force-dynamic";

function fmtDate(v) {
  if (!v) return null;
  try {
    return new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return null;
  }
}

function Prose({ markdown }) {
  if (!markdown) return null;
  return <div className="evt-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }} />;
}

function RankTable({ entries }) {
  if (!entries?.length) return <p className="pg-meta">No scores recorded yet.</p>;
  return (
    <table className="evt-rank-table">
      <thead><tr><th>#</th><th>Participant</th><th>Points</th></tr></thead>
      <tbody>
        {entries.map((e, i) => (
          <tr key={`${e.rank}-${i}`}><td>{e.rank}</td><td>{e.name ?? "—"}</td><td>{e.points}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

// Plugin OFF — minimal public detail.
async function PublicDetail({ slug }) {
  const ev = await getPublicEventBySlug(slug);
  if (!ev) notFound();
  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 pt-24 pb-20">
        <div className="max-w-3xl mx-auto px-6">
          <h1 className="text-3xl font-bold text-[#003f87] mb-2">{ev.title}</h1>
          {ev.eventDate && <p className="text-gray-500 mb-6">{fmtDate(ev.eventDate)}{ev.location ? ` · ${ev.location}` : ""}</p>}
          {ev.body && <Prose markdown={ev.body} />}
          <p className="mt-8"><Link href="/events" className="text-[#003f87] underline">← All events</Link></p>
        </div>
      </main>
      <Footer />
    </>
  );
}

export default async function EventDetailPage({ params }) {
  const { slug } = await params;
  const enabled = await isMemberPlatformEnabled();
  if (!enabled) return <PublicDetail slug={slug} />;

  const ctx = await loadMemberContext();
  if (ctx.state === "unauthenticated") {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gray-50 pt-24 pb-20">
          <div className="acc-root" style={{ minHeight: "auto", paddingTop: 0 }}>
            <SignInCard callbackUrl={`/events/${slug}`} showRequestLinks />
          </div>
        </main>
        <Footer />
      </>
    );
  }
  const canParticipate = ctx.state === "ok" ? ctx.access?.canParticipate === true : false;
  const userId = ctx.state === "ok" ? ctx.member.id : undefined;

  const ev = await getPlaygroundEvent({ slug, userId });
  if (!ev) notFound();

  const reg = ev.registration ?? {};
  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          <p className="mb-4"><Link href="/events" className="text-[#003f87] underline">← Event Playground</Link></p>

          {ev.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ev.coverUrl} alt="" className="w-full h-56 object-cover rounded-xl mb-6" />
          )}

          <div className="flex flex-wrap items-center gap-3 mb-2">
            {ev.category && <span className="pg-chip">{ev.category}</span>}
            <span className={`evt-badge ${reg.open ? "good" : "muted"}`}>{reg.open ? "Registration open" : "Registration closed"}</span>
          </div>
          <h1 className="text-3xl font-bold text-[#003f87] mb-2">{ev.title}</h1>
          <p className="text-gray-500 mb-4">
            {fmtDate(ev.eventDate) ?? "Date TBA"}{ev.location ? ` · ${ev.location}` : ""}
            {" · "}
            {reg.confirmed}{reg.capacity != null ? `/${reg.capacity}` : ""} registered
            {reg.waitlisted > 0 ? ` · ${reg.waitlisted} waitlisted` : ""}
          </p>

          {ev.organizers?.length > 0 && (
            <p className="pg-orgs mb-4">
              Organized by {ev.organizers.filter((o) => o.kind === "organizer").map((o) => o.name).join(", ") || "—"}
              {ev.organizers.some((o) => o.kind === "collaborator") &&
                ` · In collaboration with ${ev.organizers.filter((o) => o.kind === "collaborator").map((o) => o.name).join(", ")}`}
            </p>
          )}

          {/* Register / cancel (member self-service) */}
          <div className="my-6">
            <RegisterButton eventItemId={ev.id} open={reg.open} mine={reg.mine} nextOutcome={reg.nextOutcome} canParticipate={canParticipate} />
          </div>

          {ev.summary && <p className="text-lg text-gray-700 mb-4">{ev.summary}</p>}
          {ev.body && <section className="evt-section"><Prose markdown={ev.body} /></section>}

          {ev.problemStatement && (
            <section className="evt-section"><h2>Problem Statement</h2><Prose markdown={ev.problemStatement} /></section>
          )}
          {ev.eligibility && (
            <section className="evt-section"><h2>Eligibility</h2><Prose markdown={ev.eligibility} /></section>
          )}

          {ev.blocks?.length > 0 && (
            <section className="evt-section"><AchievementBlocks blocks={ev.blocks} /></section>
          )}

          {ev.rounds?.length > 0 && (
            <section className="evt-section">
              <h2>Rounds</h2>
              <ol className="list-decimal pl-5 space-y-3">
                {ev.rounds.map((r) => (
                  <li key={r.id}>
                    <span className="font-semibold text-gray-800">{r.name}</span>
                    {(r.startsAt || r.endsAt) && (
                      <span className="pg-meta"> — {fmtDate(r.startsAt) ?? "?"}{r.endsAt ? ` to ${fmtDate(r.endsAt)}` : ""}</span>
                    )}
                    {r.description && <div className="mt-1"><Prose markdown={r.description} /></div>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Rankings — overall + per round */}
          {(ev.rankings?.overall?.length > 0 || ev.rankings?.rounds?.length > 0) && (
            <section className="evt-section">
              <h2>Leaderboard</h2>
              {ev.rankings.overall.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-700 mb-2">Overall</h3>
                  <RankTable entries={ev.rankings.overall} />
                </div>
              )}
              {ev.rankings.rounds.map((r) => (
                <div key={r.roundId} className="mb-6">
                  <h3 className="font-semibold text-gray-700 mb-2">Round {r.roundNo}: {r.name}</h3>
                  <RankTable entries={r.entries} />
                </div>
              ))}
            </section>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
