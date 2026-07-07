import Link from "next/link";
import { loadCoordinatorContext } from "../../../../lib/coordinator/server.mjs";
import { getManagedEvent } from "../../../../lib/events/manage.mjs";
import { PageHead, EmptyState } from "../../../admin/_components/parts";
import CoordinatorEventClient from "../../_components/CoordinatorEventClient";

// Coordinator → one event's management (Session 13, DL-096). getManagedEvent is GATED by
// assertEventManage (403 if this isn't the coordinator's event to run), so the per-event
// authority lives in the service — a coordinator cannot open another club's event by id.
// Loads the live operational data server-side (the admin EventsClient submits blind); the
// client component below offers only the SCOPED actions (settings / rounds / registrations
// / scores / attendance / closure SUBMIT). Central actions (organizer tagging, closure
// review) are not here — they self-gate on global event.manage.
export const dynamic = "force-dynamic";

export default async function CoordinatorEventManagePage({ params }) {
  const ctx = await loadCoordinatorContext();
  if (ctx.state !== "ok") return null; // layout renders the gate

  const { eventId } = await params;
  const actor = { userId: ctx.user.id };

  let data = null;
  let denied = false;
  try {
    data = await getManagedEvent(eventId, actor);
  } catch (e) {
    if (e?.status === 403 || e?.status === 401) denied = true;
    else console.error(`[/coordinator/events/${eventId}] load failed:`, e?.message ?? e);
  }

  if (denied || !data) {
    return (
      <>
        <PageHead eyebrow="Scoped coordinator" title="Event" actions={<Link className="adm-btn ghost sm" href="/coordinator/events">← All events</Link>} />
        <div className="adm-card">
          <EmptyState>
            {denied
              ? "You don’t manage this event. It isn’t organized by a unit you coordinate."
              : "That event could not be found."}
          </EmptyState>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead
        eyebrow="Scoped coordinator · Event"
        title={data.event.title ?? "Untitled event"}
        subtitle={`Status: ${data.event.status}${data.event.slug ? ` · ${data.event.slug}` : ""}`}
        actions={<Link className="adm-btn ghost sm" href="/coordinator/events">← All events</Link>}
      />
      <CoordinatorEventClient data={data} />
    </>
  );
}
