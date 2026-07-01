import Link from "next/link";
import { notFound } from "next/navigation";
import "../../account/account.css";
import { SignInCard } from "../../account/_components/AuthClient";
import MemberProfile from "../../components/MemberProfile";
import MemberNav from "../../components/MemberNav";
import { loadMemberContext } from "../../../lib/member/server.mjs";
import { getMemberProfileView } from "../../../lib/member/profile.mjs";

// M6 — the member's OWN rich profile (DL-090): identity, roles/category, affiliations,
// event participation (category-mapped) + registrations/upcoming, achievements, and this
// year's institute-contribution rollup. SELF data — gated by requireMember() semantics
// via loadMemberContext (own data, no permission gate). Plugin-gated (404 when off).
export const dynamic = "force-dynamic";
export const metadata = { title: "My profile · Student Affairs IIT Jammu" };

export default async function MemberProfilePage() {
  const ctx = await loadMemberContext();

  if (ctx.state === "plugin-off") notFound();

  if (ctx.state === "unauthenticated") {
    return (
      <div className="acc-root">
        <SignInCard callbackUrl="/member/profile" showRequestLinks />
      </div>
    );
  }

  if (ctx.state === "revoked" || ctx.state === "view-disabled") {
    return (
      <div className="acc-root">
        <div className="acc-card">
          <h1>{ctx.state === "revoked" ? "Access revoked" : "Member view not enabled"}</h1>
          <p className="acc-disabled-note">
            {ctx.state === "revoked"
              ? "Your account no longer has access to the member area. You can still browse the public site."
              : "The member view has not been enabled for your account yet. Please check back later, or contact a portal administrator."}
          </p>
          <div className="acc-links"><Link href="/">Back to the site</Link></div>
        </div>
      </div>
    );
  }

  // state === "ok": load the profile + this year's contribution for the signed-in member
  // in ONE composite (shared year + achievements hydrate). Best-effort: a read failure
  // degrades to the minimal member card link, not a 500.
  let profile = null;
  let contribution = null;
  try {
    ({ profile, contribution } = await getMemberProfileView(ctx.member.id));
  } catch {
    profile = null;
  }

  return (
    <>
      <MemberNav current="/member/profile" />
      <div className="prof-page">
      <div className="prof-page-head">
        <h1>My profile</h1>
        <Link href="/member">← Member home</Link>
      </div>
      {profile ? (
        <MemberProfile profile={profile} contribution={contribution} showEmail />
      ) : (
        <p className="prof-empty">Your profile is temporarily unavailable. Please try again shortly.</p>
      )}
      </div>
    </>
  );
}
