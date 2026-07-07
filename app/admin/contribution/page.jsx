import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { hasPerm } from "../../../lib/admin/nav.mjs";
import { getStakeholderContribution, listContributionStakeholders } from "../../../lib/member/contribution.mjs";
import ContributionSummary from "../../components/ContributionSummary";
import ContributionClient from "./ContributionClient";
import { PageHead, ModuleDenied, EmptyState } from "../_components/parts";

// M6 — the per-stakeholder INSTITUTE CONTRIBUTION explorer (DL-090). Pick a member (by
// email) / a club (by durable lineage) / a custom entity → see their contribution across
// this year, aggregated from the durable ids M4/M5 store. Gated on `user.read` (the
// member lookup exposes member data; club/entity are public-display names). Reads are
// Server-Component GETs driven by query params — no mutation, no API route.
export const dynamic = "force-dynamic";

export default async function ContributionPage({ searchParams }) {
  const ctx = await loadModuleContext("contribution");
  if (ctx.state !== "ok" || !hasPerm(ctx.resolved, "user.read")) {
    return <ModuleDenied module="Institute Contribution (user.read)" />;
  }

  const sp = (await searchParams) ?? {};
  const kind = sp.kind === "club" || sp.kind === "entity" ? sp.kind : "member";
  const input = { kind, email: sp.email ?? null, orgUnitLineageKey: sp.lineage ?? null, entityId: sp.entity ?? null };
  const asked = (kind === "member" && input.email) || (kind === "club" && input.orgUnitLineageKey) || (kind === "entity" && input.entityId);

  const [{ clubs, entities }, contribution] = await Promise.all([
    listContributionStakeholders(),
    asked ? getStakeholderContribution(input) : Promise.resolve(null),
  ]);

  return (
    <>
      <PageHead
        eyebrow="Member platform · M6"
        title="Institute Contribution"
        subtitle="What a member, club, or custom entity contributed to the institute across this academic year."
      />
      <div className="adm-card">
        <ContributionClient clubs={clubs} entities={entities} initial={{ kind, email: sp.email ?? "", lineage: sp.lineage ?? "", entity: sp.entity ?? "" }} />
        {asked ? (
          contribution ? (
            <ContributionSummary contribution={contribution} />
          ) : (
            <EmptyState>No {kind} found for that selection.</EmptyState>
          )
        ) : (
          <EmptyState>Pick a stakeholder above to see their institute contribution this year.</EmptyState>
        )}
      </div>
    </>
  );
}
