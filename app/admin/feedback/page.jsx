import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { listFeedbackPage, getFeedbackCounts } from "../../../lib/feedback/service.mjs";
import { ModuleDenied } from "../_components/parts";
import FeedbackClient from "./FeedbackClient";

// Feedback / support-tickets module (M7, DL-070) — the triage queue over the public
// feedback form. Gated on feedback.read; assign/status mutations post to
// /api/admin/action (gated feedback.resolve).
export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const ctx = await loadModuleContext("feedback");
  if (ctx.state !== "ok") return <ModuleDenied module="Feedback" />;
  const actor = { userId: ctx.user.id };
  const [page, counts] = await Promise.all([
    listFeedbackPage({ take: 100 }, actor),
    getFeedbackCounts(actor),
  ]);
  return <FeedbackClient page={page} counts={counts} perms={ctx.perms} viewerId={ctx.user.id} />;
}
