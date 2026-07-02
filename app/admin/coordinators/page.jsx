import prisma from "../../../lib/prisma.mjs";
import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { getCurrentYearId } from "../../../lib/year/context.mjs";
import { loadAdminOrgUnits } from "../../../lib/admin/reads.mjs";
import { listCoordinatorGrants } from "../../../lib/users/admin.mjs";
import { ModuleDenied } from "../_components/parts";
import CoordinatorsClient from "./CoordinatorsClient";

// Coordinators mapping module: the admin maps each coordinator to a club (grants the
// club-scoped `coordinator` role for the current year). Enforces "one club per coordinator"
// via grantRole (409 COORDINATOR_ONE_CLUB). Reads are gated (org_unit.read + role.read);
// mutations post the existing role.grant / role.revoke actions to /api/admin/action.
export const dynamic = "force-dynamic";

export default async function CoordinatorsPage() {
  const ctx = await loadModuleContext("coordinators");
  if (ctx.state !== "ok") return <ModuleDenied module="Coordinators" />;
  const actor = { userId: ctx.user.id };
  const yearId = await getCurrentYearId();

  let clubs = [];
  let grants = [];
  let yearLabel = null;
  if (yearId) {
    try {
      const [units, g, year] = await Promise.all([
        loadAdminOrgUnits({ yearId }, actor),
        listCoordinatorGrants({ yearId }, actor),
        prisma.academicYear.findUnique({ where: { id: yearId }, select: { label: true } }),
      ]);
      grants = g;
      yearLabel = year?.label ?? null;
      const councilName = new Map(units.filter((u) => u.typeKey === "council").map((u) => [u.id, u.name]));
      clubs = units
        .filter((u) => u.typeKey === "club")
        .map((u) => ({
          id: u.id,
          name: u.name,
          slug: u.slug,
          lineageKey: u.lineageKey,
          status: u.status,
          councilName: u.parentId ? councilName.get(u.parentId) ?? null : null,
        }))
        .sort((a, b) => (a.councilName || "").localeCompare(b.councilName || "") || a.name.localeCompare(b.name));
    } catch (e) {
      console.error("[/admin/coordinators] load failed:", e?.message ?? e);
    }
  }

  const byLineage = {};
  for (const gr of grants) (byLineage[gr.orgUnitLineageKey] ??= []).push(gr);

  return <CoordinatorsClient clubs={clubs} coordinatorsByLineage={byLineage} yearId={yearId} yearLabel={yearLabel} noYear={!yearId} />;
}
