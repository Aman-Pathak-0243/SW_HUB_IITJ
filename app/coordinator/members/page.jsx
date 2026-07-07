import Link from "next/link";
import { loadCoordinatorCapability } from "../../../lib/coordinator/server.mjs";
import { listMembershipsForUnit, getMembershipCountForUnit } from "../../../lib/memberships/service.mjs";
import { PageHead, EmptyState, SBadge } from "../../admin/_components/parts";
import CoordinatorMembersClient from "../_components/CoordinatorMembersClient";

// Coordinator → Members (Session 13, DL-096). The member roster for the coordinator's
// units (those with a SCOPED membership.manage). The roster read is GATED by
// membership.manage at the unit's lineage — and the selected lineage is validated against
// the coordinator's own manageable set, so a hand-crafted ?lineage= can't peek elsewhere
// (and listMembershipsForUnit would 403 anyway).
export const dynamic = "force-dynamic";

export default async function CoordinatorMembersPage({ searchParams }) {
  const ctx = await loadCoordinatorCapability("members");
  if (ctx.state !== "ok") {
    return (
      <>
        <PageHead eyebrow="Scoped coordinator" title="Members" />
        <div className="adm-card"><EmptyState>You don’t manage members for any unit.</EmptyState></div>
      </>
    );
  }

  const memberClubs = ctx.clubs.filter((c) => c.permissions.members);
  const sp = (await searchParams) ?? {};
  const selectedKey = memberClubs.some((c) => c.orgUnitLineageKey === sp.lineage) ? sp.lineage : memberClubs[0]?.orgUnitLineageKey ?? null;
  const selected = memberClubs.find((c) => c.orgUnitLineageKey === selectedKey) ?? null;
  const actor = { userId: ctx.user.id };

  let roster = [];
  let count = 0;
  if (selectedKey) {
    try {
      const [page, cnt] = await Promise.all([
        listMembershipsForUnit({ orgUnitLineageKey: selectedKey, take: 500 }, actor),
        getMembershipCountForUnit(selectedKey),
      ]);
      roster = page.entries;
      count = cnt;
    } catch (e) {
      console.error("[/coordinator/members] roster load failed:", e?.message ?? e);
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Scoped coordinator"
        title="Members"
        subtitle="Add, remove, and bulk-import your unit’s members. Members must already have an account — missing emails are reported, never auto-created."
      />

      {memberClubs.length > 1 && (
        <div className="adm-card" style={{ marginBottom: 16 }}>
          <div className="coord-caps">
            {memberClubs.map((c) => (
              <Link
                key={c.orgUnitLineageKey}
                href={`/coordinator/members?lineage=${encodeURIComponent(c.orgUnitLineageKey)}`}
                className={`adm-btn ${c.orgUnitLineageKey === selectedKey ? "primary" : "ghost"} sm`}
              >
                {c.name ?? "A unit"}
              </Link>
            ))}
          </div>
        </div>
      )}

      {selected ? (
        <>
          <PageHead title={selected.name ?? "Unit"} subtitle={`${count} active member(s)`} actions={<SBadge tone="neutral">{selected.typeName ?? selected.typeKey ?? "Unit"}</SBadge>} />
          <CoordinatorMembersClient orgUnitLineageKey={selectedKey} clubName={selected.name ?? "this unit"} roster={roster} />
        </>
      ) : (
        <div className="adm-card"><EmptyState>Pick a unit to manage its members.</EmptyState></div>
      )}
    </>
  );
}
