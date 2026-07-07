import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { loadAdminContent } from "../../../lib/admin/reads.mjs";
import { getCurrentYearId } from "../../../lib/year/context.mjs";
import { listEventEntities } from "../../../lib/events/organizers.mjs";
import { getEventSettings } from "../../../lib/events/settings.mjs";
import { listRegistrations } from "../../../lib/events/registration.mjs";
import { listRounds } from "../../../lib/events/rounds.mjs";
import { listAttendance, listScores } from "../../../lib/events/scoring.mjs";
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
    // Preload each event's operational settings (so the Settings form SEEDS from stored values,
    // DL-097 review) AND its live roster / rounds / attendance so the client can RENDER the
    // registered-participant list and a per-round attendance checklist (no id-pasting). Bounded:
    // events per year are few; the roster is capped at 1000 (hasMore flags a truncated list).
    events = await Promise.all(
      events.map(async (ev) => {
        const [settings, reg, rounds, attendance, scores] = await Promise.all([
          getEventSettings(ev.id),
          listRegistrations({ eventItemId: ev.id, take: 1000 }, actor).catch(() => ({ entries: [], hasMore: false })),
          listRounds(ev.id).catch(() => []),
          listAttendance(ev.id, { actor }).catch(() => []),
          listScores(ev.id, { actor }).catch(() => []),
        ]);
        return { ...ev, settings, roster: reg.entries ?? [], rosterHasMore: !!reg.hasMore, rounds, attendance, scores };
      })
    );
  } catch (e) {
    console.error("[/admin/events] load failed:", e?.message ?? e);
  }

  return <EventsClient events={events} entities={entities} perms={ctx.perms} />;
}
