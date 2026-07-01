import Link from "next/link";
import SignOutButton from "./SignOutButton";

// A small logged-in-member navigation bar linking the member experience together
// (NEXT_TASK #3 / DL-066). Today `/member` links only to the profile; the rest of the
// member surfaces (`/events`, `/wall-of-fame`, `/announcements`, club pages) are reached
// by URL. This bar gives an active member one place to move between them. It is a plain
// server-safe component (only <Link>s, no client state) rendered ONLY in the "ok" state
// of the member surfaces — anonymous/revoked/view-disabled screens do not show it.
const MEMBER_LINKS = [
  { href: "/member", label: "Home" },
  { href: "/member/profile", label: "My profile" },
  { href: "/events", label: "Events" },
  { href: "/wall-of-fame", label: "Wall of Fame" },
  { href: "/announcements", label: "Announcements" },
];

export default function MemberNav({ current }) {
  return (
    <nav className="mbr-nav" aria-label="Member navigation">
      <div className="mbr-nav-inner">
        <span className="mbr-nav-brand">Member area</span>
        <div className="mbr-nav-links">
          {MEMBER_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`mbr-nav-link${current === l.href ? " active" : ""}`}
              aria-current={current === l.href ? "page" : undefined}
            >
              {l.label}
            </Link>
          ))}
          <Link href="/" className="mbr-nav-link mbr-nav-site">
            Public site ↗
          </Link>
          <SignOutButton />
        </div>
      </div>
    </nav>
  );
}
