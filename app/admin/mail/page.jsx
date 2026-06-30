import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { listAuthorizedSenders } from "../../../lib/mail/service.mjs";
import { ModuleDenied } from "../_components/parts";
import MailClient from "./MailClient";

// Bulk-mail module (M8, DL-073) — the authorized-sender allowlist + a rate-limited
// bulk composer. Gated on mail.send / mail.manage; mutations post to
// /api/admin/action. Actual delivery needs MAIL_HOST configured on the VM.
export const dynamic = "force-dynamic";

export default async function MailPage() {
  const ctx = await loadModuleContext("mail");
  if (ctx.state !== "ok") return <ModuleDenied module="Mail" />;
  const actor = { userId: ctx.user.id };
  let senders = [];
  try { senders = await listAuthorizedSenders(actor); } catch { senders = []; }
  return <MailClient senders={senders} perms={ctx.perms} />;
}
