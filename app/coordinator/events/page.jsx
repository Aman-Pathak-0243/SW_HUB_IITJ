import Link from "next/link";
import { loadCoordinatorCapability } from "../../../lib/coordinator/server.mjs";
import { listEventsForManager } from "../../../lib/events/manage.mjs";
import { PageHead, SBadge, EmptyState } from "../../admin/_components/parts";

// Coordinator → Events (Session 13, DL-096). Lists the events organized by the units the
// coordinator holds a SCOPED event.manage on (listEventsForManager over exactly those
// lineages — the same set assertEventManage authorizes). Each links to its manage page.
export const dynamic = "force-dynamic";

export default async function CoordinatorEventsPage() {
  const ctx = await loadCoordinatorCapability("events");
  if (ctx.state !== "ok") {
    return (
      <>
        <PageHead eyebrow="Scoped coordinator" title="Events" />
        <div className="adm-card"><EmptyState>You don’t manage events for any unit.</EmptyState></div>
      </>
    );
  }

  const lineageKeys = ctx.clubs.filter((c) => c.permissions.events).map((c) => c.orgUnitLineageKey);
  let events = [];
  try {
    events = await listEventsForManager(lineageKeys);
  } catch (e) {
    console.error("[/coordinator/events] load failed:", e?.message ?? e);
  }

  return (
    <>
      <PageHead
        eyebrow="Scoped coordinator"
        title="Events"
        subtitle="Events your unit(s) organize this year. Open one to manage its rounds, registrations, scores, attendance, settings and closure report."
      />
      <div className="adm-card">
        {events.length ? (
          <div className="coord-eventlist">
            {events.map((e) => (
              <div className="coord-eventrow" key={e.id}>
                <div className="coord-ev-main">
                  <span className="coord-ev-title">{e.title ?? "Untitled event"}</span>
                  <span className="coord-ev-meta">
                    {e.confirmed} confirmed{e.waitlisted ? ` · ${e.waitlisted} waitlisted` : ""}
                    {e.slug ? ` · ${e.slug}` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <SBadge tone={e.status === "published" ? "good" : "muted"}>{e.status ?? "—"}</SBadge>
                  <Link className="adm-btn primary sm" href={`/coordinator/events/${e.id}`}>Manage →</Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>
            No events are tagged to your unit(s) yet. A staff/admin adds your club as an event organizer
            (organizer tagging is a central action), after which the event appears here for you to run.
          </EmptyState>
        )}
      </div>
    </>
  );
}
