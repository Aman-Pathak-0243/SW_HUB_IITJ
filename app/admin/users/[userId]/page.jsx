import Link from "next/link";
import { loadModuleContext } from "../../../../lib/admin/server.mjs";
import { hasPerm } from "../../../../lib/admin/nav.mjs";
import { getMemberProfileView } from "../../../../lib/member/profile.mjs";
import MemberProfile from "../../../components/MemberProfile";
import { PageHead, ModuleDenied, EmptyState } from "../../_components/parts";

// M6 — the ADMIN member-profile view (DL-090). Any user with `user.read` can view a
// member's full profile + this year's institute-contribution rollup. Gated by the Users
// module context AND an explicit user.read check (the profile exposes another member's
// email/registrations — the same PII user.read already governs in the Users list).
export const dynamic = "force-dynamic";

export default async function AdminMemberProfilePage({ params }) {
  const { userId } = await params;
  const ctx = await loadModuleContext("users");
  if (ctx.state !== "ok" || !hasPerm(ctx.resolved, "user.read")) {
    return <ModuleDenied module="member profiles (user.read)" />;
  }

  let profile = null;
  let contribution = null;
  try {
    ({ profile, contribution } = await getMemberProfileView(userId));
  } catch {
    profile = null;
  }

  return (
    <>
      <PageHead
        eyebrow="Users & Roles"
        title={profile?.member?.name || "Member profile"}
        subtitle="Roles, affiliations, event participation, achievements & this year's institute contribution."
        actions={<Link className="adm-btn ghost" href="/admin/users">← All users</Link>}
      />
      {profile ? (
        <div className="adm-card">
          <MemberProfile profile={profile} contribution={contribution} showEmail />
        </div>
      ) : (
        <EmptyState>No account found for that id.</EmptyState>
      )}
    </>
  );
}
