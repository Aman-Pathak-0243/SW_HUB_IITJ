import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { listFeatureFlags } from "../../../lib/platform/flags.mjs";
import { ModuleDenied } from "../_components/parts";
import PluginsClient from "./PluginsClient";

// Plugins module (M0, DL-058) — the developer-controlled feature flags. Reads are
// gated on dev.console (so a super_admin can SEE state); toggling is developer-only
// (enforced server-side in lib/platform/flags.mjs#setFeatureFlag). The UI disables
// the switch for a non-developer.
export const dynamic = "force-dynamic";

export default async function PluginsPage() {
  const ctx = await loadModuleContext("plugins");
  if (ctx.state !== "ok") return <ModuleDenied module="Plugins" />;
  const actor = { userId: ctx.user.id };
  const flags = await listFeatureFlags(actor);
  return <PluginsClient flags={flags} viewerIsDeveloper={!!ctx.user.isDeveloper} />;
}
