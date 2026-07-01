import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { loadAdminContent } from "../../../lib/admin/reads.mjs";
import { getCurrentYearId } from "../../../lib/year/context.mjs";
import { listEventEntities } from "../../../lib/events/organizers.mjs";
import { getEventSettings } from "../../../lib/events/settings.mjs";
import { ModuleDenied } from "../_components/parts";
import EventsClient from "./EventsClient";

// Event Playground admin module (M5, DL-084..089). Gated on event.manage (staff/admin/
// dev at GLOBAL scope — the admin nav resolves permissions globally; a club-scoped
// coordinator manages their own event via the assertEventManage seam through the API,
// a future scoped surface). Management mutations post to /api/admin/action (scoped:true;
// each service re-authorizes via assertEventManage). The event CONTENT (details / problem
// statement / hybrid blocks) is edited in the Content module (content_type='event').
export const dynamic = "force-dynamic";

export default async function AdminEventsPage() {
  const ctx = await loadModuleContext("events");
  if (ctx.state !== "ok") return <ModuleDenied module="Event Playground" />;
  const actor = { userId: ctx.user.id };

  const yearId = await getCurrentYearId();
  let events = [];
  let entities = [];
  try {
    [events, entities] = await Promise.all([
      yearId ? loadAdminContent({ yearId, contentType: "event", includeArchived: false }, actor) : Promise.resolve([]),
      listEventEntities({ status: "active" }),
    ]);
    // Preload each event's operational settings so the Settings form SEEDS from the stored
    // values (capacity / window / allowed roles) rather than submitting blank — otherwise a
    // save/"Go live now" would silently clobber a coordinator's role restriction (DL-097 review).
    events = await Promise.all(events.map(async (ev) => ({ ...ev, settings: await getEventSettings(ev.id) })));
  } catch (e) {
    console.error("[/admin/events] load failed:", e?.message ?? e);
  }

  return <EventsClient events={events} entities={entities} perms={ctx.perms} />;
}
