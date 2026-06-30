import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { getStorageReport, listTableThresholds } from "../../../lib/devconsole/storage.mjs";
import { getUsageAnalytics } from "../../../lib/devconsole/usage.mjs";
import { listAuditLog } from "../../../lib/devconsole/audit.mjs";
import { ModuleDenied } from "../_components/parts";
import DevDashClient from "./DevDashClient";

// Developer Dashboard (M8) — action-log export, hidden usage analytics, and
// per-table storage monitoring + thresholds. Each section reads behind its OWN gate
// (storage → dev.console/storage.manage; usage → dev.console; action log →
// audit.read), so a viewer holding only one perm sees only those sections; a section
// the viewer can't read is omitted (the read throws 403 → caught → null).
export const dynamic = "force-dynamic";

async function safe(p) {
  try { return await p; } catch { return null; }
}

export default async function DevDashPage() {
  const ctx = await loadModuleContext("devdash");
  if (ctx.state !== "ok") return <ModuleDenied module="Developer Dashboard" />;
  const actor = { userId: ctx.user.id };
  const [storage, thresholds, usage, actionLog] = await Promise.all([
    safe(getStorageReport(actor, {})),
    safe(listTableThresholds(actor)),
    safe(getUsageAnalytics({ windowDays: 30 }, actor)),
    safe(listAuditLog({ take: 15 }, actor)),
  ]);
  return (
    <DevDashClient
      storage={storage}
      thresholds={thresholds ?? []}
      usage={usage}
      actionLog={actionLog}
      perms={ctx.perms}
    />
  );
}
