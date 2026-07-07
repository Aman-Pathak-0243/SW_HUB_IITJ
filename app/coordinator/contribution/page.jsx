import Link from "next/link";
import { loadCoordinatorContext } from "../../../lib/coordinator/server.mjs";
import { getClubContribution } from "../../../lib/member/contribution.mjs";
import ContributionSummary from "../../components/ContributionSummary";
import { PageHead, EmptyState } from "../../admin/_components/parts";

// Coordinator → Contribution (Session 13, DL-096). The institute-contribution rollup for
// the coordinator's OWN unit(s) this year, reusing the M6 getClubContribution read + the
// shared ContributionSummary Server Component. The selected lineage is always one of the
// coordinator's manageable clubs (validated below), so this never discloses another
// stakeholder's data — it is the scoped slice of the admin /admin/contribution explorer.
export const dynamic = "force-dynamic";

export default async function CoordinatorContributionPage({ searchParams }) {
  const ctx = await loadCoordinatorContext();
  if (ctx.state !== "ok") return null;

  const sp = (await searchParams) ?? {};
  const selectedKey = ctx.clubs.some((c) => c.orgUnitLineageKey === sp.lineage) ? sp.lineage : ctx.clubs[0]?.orgUnitLineageKey ?? null;

  let contribution = null;
  if (selectedKey) {
    try {
      contribution = await getClubContribution(selectedKey);
    } catch (e) {
      console.error("[/coordinator/contribution] load failed:", e?.message ?? e);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Scoped coordinator"
        title="Contribution"
        subtitle="What your unit contributed to the institute this year — events organized, achievements, members, and distinct participants reached."
      />

      {ctx.clubs.length > 1 && (
        <div className="adm-card" style={{ marginBottom: 16 }}>
          <div className="coord-caps">
            {ctx.clubs.map((c) => (
              <Link
                key={c.orgUnitLineageKey}
                href={`/coordinator/contribution?lineage=${encodeURIComponent(c.orgUnitLineageKey)}`}
                className={`adm-btn ${c.orgUnitLineageKey === selectedKey ? "primary" : "ghost"} sm`}
              >
                {c.name ?? "A unit"}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="adm-card">
        {contribution ? <ContributionSummary contribution={contribution} /> : <EmptyState>No contribution data for this unit yet.</EmptyState>}
      </div>
    </>
  );
}
