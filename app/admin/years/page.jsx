import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { listYears } from "../../../lib/year/context.mjs";
import { getTransitionStatus } from "../../../lib/devconsole/status.mjs";
import { shapeYearRow } from "../../../lib/admin/view-models.mjs";
import { ModuleDenied } from "../_components/parts";
import YearsClient from "./YearsClient";

// Academic Years module (Session 9) — years, set-current, lock/unlock, create and
// the Transition Wizard, all over lib/year/* via /api/admin/action.
export const dynamic = "force-dynamic";

export default async function YearsPage() {
  const ctx = await loadModuleContext("years");
  if (ctx.state !== "ok") return <ModuleDenied module="Academic Years" />;

  const [years, transitions] = await Promise.all([
    listYears({ includeCounts: true }),
    getTransitionStatus().catch(() => ({ runs: [], summary: { total: 0 } })),
  ]);

  return (
    <YearsClient
      years={years.map(shapeYearRow)}
      transitions={JSON.parse(JSON.stringify(transitions))}
      perms={ctx.perms}
    />
  );
}
