// /events/organized — the "Events Organized" page (M5, DL-089): a curated markdown
// doc (content_type='events_organized', edited by admin/staff/dev through the CMS +
// audited) PLUS a data-driven index of every organized event with its tagged
// stakeholders/team. Login-only (mirrors the playground). Its change history is
// visible + downloadable from the M8 developer dashboard. force-dynamic.
import Link from "next/link";
import Header from "../../components/Header";
import Footer from "../../components/Footer";
import { SignInCard } from "../../account/_components/AuthClient";
import { renderMarkdown } from "../../../lib/markdown/render.mjs";
import { isMemberPlatformEnabled } from "../../../lib/platform/flags.mjs";
import { loadMemberContext } from "../../../lib/member/server.mjs";
import { listEventsOrganizedDocs, listOrganizedEventsIndex } from "../../../lib/events/organized.mjs";
import "../events.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Events Organized · IIT Jammu" };

export default async function EventsOrganizedPage() {
  const enabled = await isMemberPlatformEnabled();
  if (!enabled) {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gray-50 pt-24 pb-20">
          <p className="text-center text-gray-500">This page is available when the member platform is enabled.</p>
        </main>
        <Footer />
      </>
    );
  }

  const ctx = await loadMemberContext();
  if (ctx.state === "unauthenticated") {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gray-50 pt-24 pb-20">
          <div className="acc-root" style={{ minHeight: "auto", paddingTop: 0 }}>
            <SignInCard callbackUrl="/events/organized" showRequestLinks />
          </div>
        </main>
        <Footer />
      </>
    );
  }
  // Login-only, mirroring the /events playground: a revoked or view-disabled account is
  // held out (it can still browse the public site) rather than shown member content.
  if (ctx.state === "revoked" || ctx.state === "view-disabled") {
    return (
      <>
        <Header />
        <main className="min-h-screen bg-gray-50 pt-24 pb-20">
          <p className="max-w-2xl mx-auto px-6 text-center text-gray-500">
            The event playground is available to members. If you believe you should have access, contact a portal administrator.
          </p>
        </main>
        <Footer />
      </>
    );
  }

  let docs = [];
  let index = [];
  try {
    [docs, index] = await Promise.all([listEventsOrganizedDocs(), listOrganizedEventsIndex()]);
  } catch (e) {
    console.error("[/events/organized] failed:", e?.message ?? e);
  }

  return (
    <>
      <Header />
      <main className="min-h-screen bg-gray-50 pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-6">
          <p className="mb-4"><Link href="/events" className="text-[#003f87] underline">← Event Playground</Link></p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#003f87] mb-8">Events Organized</h1>

          {docs.map((d) => (
            <section key={d.id} className="evt-section">
              {d.title && <h2>{d.title}</h2>}
              <div className="evt-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(d.body ?? "") }} />
            </section>
          ))}

          <section className="evt-section">
            <h2>All events</h2>
            {index.length ? (
              <table className="evt-rank-table">
                <thead><tr><th>Event</th><th>Organized by</th><th>Collaborators</th></tr></thead>
                <tbody>
                  {index.map((e) => (
                    <tr key={e.id}>
                      <td>{e.slug ? <Link href={`/events/${e.slug}`} className="text-[#003f87] underline">{e.title}</Link> : e.title}</td>
                      <td>{e.organizers.map((o) => o.name).join(", ") || "—"}</td>
                      <td>{e.collaborators.map((o) => o.name).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="pg-meta">No organized events recorded for this year yet.</p>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
