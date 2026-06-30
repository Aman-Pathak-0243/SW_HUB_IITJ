import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { listNotifications, getNotificationCounts } from "../../../lib/notifications/service.mjs";
import { ModuleDenied } from "../_components/parts";
import RequestsClient from "./RequestsClient";

// Password Management module (M0) — the centralized account-creation &
// password-reset request queue, shared by the admin & developer surfaces (gated on
// notification.read). A stakeholder takes ("Fix" → assign, audited) a request, then
// fulfils it (generate + set a temporary password the user must change) or dismisses
// it. Mutations post to /api/admin/action.
export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const ctx = await loadModuleContext("requests");
  if (ctx.state !== "ok") return <ModuleDenied module="Password Management" />;
  const actor = { userId: ctx.user.id };
  const [notifications, counts] = await Promise.all([
    listNotifications({}, actor),
    getNotificationCounts(actor),
  ]);
  return <RequestsClient notifications={notifications} counts={counts} perms={ctx.perms} viewerId={ctx.user.id} />;
}
