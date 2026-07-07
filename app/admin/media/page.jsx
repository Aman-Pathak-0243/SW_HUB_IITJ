import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { listMediaAssets } from "../../../lib/media/service.mjs";
import { getMediaMigrationStatus } from "../../../lib/devconsole/status.mjs";
import { ModuleDenied } from "../_components/parts";
import MediaClient from "./MediaClient";

// Media module (Session 9) — browse / register / edit-metadata / archive the
// media_asset library (lib/media/service.mjs) and surface the /public→Cloudinary
// migration plan from the dev-console reader.
export const dynamic = "force-dynamic";

export default async function MediaPage({ searchParams }) {
  const ctx = await loadModuleContext("media");
  if (ctx.state !== "ok") return <ModuleDenied module="Media" />;
  const sp = await searchParams;

  const [assets, migration] = await Promise.all([
    listMediaAssets({ includeArchived: sp?.archived === "1", kind: sp?.kind || undefined, search: sp?.q || undefined, take: 300 }),
    getMediaMigrationStatus().catch(() => null),
  ]);

  return <MediaClient assets={JSON.parse(JSON.stringify(assets))} migration={migration} perms={ctx.perms} filter={{ archived: sp?.archived === "1", kind: sp?.kind || "", q: sp?.q || "" }} />;
}
