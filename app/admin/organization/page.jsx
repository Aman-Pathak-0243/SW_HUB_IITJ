import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { resolveCurrentYear } from "../../../lib/year/context.mjs";
import { loadAdminOrgUnits, loadPositions, loadPeople, loadOrgUnitTypes, loadRosterByUnit } from "../../../lib/admin/reads.mjs";
import { ModuleDenied } from "../_components/parts";
import OrgClient from "./OrgClient";

// Organization module (Session 9) — units (create/edit/publish/archive), people,
// and appointments for the current year (lib/org/*) via /api/admin/action. Honors
// the hierarchy/type/cardinality guards (friendly errors surfaced on failure).
export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  const ctx = await loadModuleContext("organization");
  if (ctx.state !== "ok") return <ModuleDenied module="Organization" />;
  const actor = { userId: ctx.user.id };

  const year = await resolveCurrentYear();
  const [units, positions, people, types, rosterByUnit] = year
    ? await Promise.all([
        loadAdminOrgUnits({ yearId: year.id, includeArchived: true }, actor),
        loadPositions({}, actor),
        loadPeople({}, actor),
        loadOrgUnitTypes(actor),
        loadRosterByUnit({ yearId: year.id }, actor),
      ])
    : [[], [], [], [], {}];

  return (
    <OrgClient
      year={year ? { id: year.id, label: year.label, status: year.status } : null}
      units={units}
      positions={positions}
      people={people}
      types={types}
      rosterByUnit={rosterByUnit}
      perms={ctx.perms}
    />
  );
}
