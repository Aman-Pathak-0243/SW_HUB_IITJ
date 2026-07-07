import Link from "next/link";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { getServerAuthSession } from "../../lib/auth/session.mjs";
import prisma from "../../lib/prisma.mjs";
import SignOutButton from "./SignOutButton";

// Public-site profile page: shows the details of the currently signed-in user,
// rendered inside the main website chrome (Header/Footer) and linked from the
// navbar. Distinct from the member back-office profile at /member/profile — this
// is the lightweight "who am I / my account" card on the public site.
export const dynamic = "force-dynamic";
export const metadata = { title: "My Profile · Student Affairs IIT Jammu" };

const STATUS_TONE = { active: "ok", inactive: "warn", revoked: "danger" };

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function fmtDateTime(d) {
  if (!d) return "Never";
  try {
    return new Date(d).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function initials(name, email) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
  return letters.toUpperCase();
}

export default async function ProfilePage() {
  const session = await getServerAuthSession();
  const userId = session?.user?.id;

  // Load the authoritative account record + this member's active roles. Best-effort:
  // a DB hiccup degrades to a friendly "unavailable" card, never a 500.
  let account = null;
  let roleNames = [];
  if (userId) {
    try {
      account = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          name: true,
          image: true,
          status: true,
          isDeveloper: true,
          allowNormalView: true,
          lastLoginAt: true,
          createdAt: true,
        },
      });
      const roleRows = await prisma.roleAssignment.findMany({
        where: { userId, revokedAt: null },
        select: { role: { select: { name: true } } },
      });
      roleNames = [...new Set(roleRows.map((r) => r.role?.name).filter(Boolean))];
    } catch {
      account = null;
    }
  }

  return (
    <>
      <Header />
      <style>{profileStyles}</style>
      <main className="profile-page">
        {!userId ? (
          // ── Not signed in ──────────────────────────────────────────────
          <section className="profile-shell profile-empty">
            <div className="profile-empty-icon">🔒</div>
            <h1>You are not signed in</h1>
            <p>Sign in to view your profile and account details.</p>
            <Link href="/login" className="profile-btn primary">Go to login</Link>
          </section>
        ) : !account ? (
          // ── Signed in but the record couldn't be read ──────────────────
          <section className="profile-shell profile-empty">
            <div className="profile-empty-icon">⚠️</div>
            <h1>Profile temporarily unavailable</h1>
            <p>We couldn't load your details right now. Please try again shortly.</p>
            <Link href="/" className="profile-btn">Back to home</Link>
          </section>
        ) : (
          // ── Signed in ──────────────────────────────────────────────────
          <section className="profile-shell">
            <div className="profile-banner">
              <div className="profile-avatar">
                {account.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={account.image} alt={account.name || "avatar"} />
                ) : (
                  <span>{initials(account.name, account.email)}</span>
                )}
              </div>
              <div className="profile-id">
                <h1>{account.name || "Unnamed user"}</h1>
                <p className="profile-email">{account.email}</p>
                <div className="profile-badges">
                  <span className={`profile-badge ${STATUS_TONE[account.status] || ""}`}>
                    {account.status}
                  </span>
                  {account.isDeveloper && <span className="profile-badge dev">Developer</span>}
                  {account.allowNormalView && <span className="profile-badge">Member access</span>}
                </div>
              </div>
            </div>

            <div className="profile-grid">
              <Detail label="Full name" value={account.name || "—"} />
              <Detail label="Email" value={account.email} />
              <Detail label="Account status" value={account.status} />
              <Detail
                label="Roles"
                value={roleNames.length ? roleNames.join(", ") : "No roles assigned"}
              />
              <Detail label="Member since" value={fmtDate(account.createdAt)} />
              <Detail label="Last sign-in" value={fmtDateTime(account.lastLoginAt)} />
            </div>

            <div className="profile-actions">
              <Link href="/member" className="profile-btn primary">My member area</Link>
              <Link href="/account/password" className="profile-btn">Change password</Link>
              <SignOutButton />
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}

function Detail({ label, value }) {
  return (
    <div className="profile-detail">
      <span className="profile-detail-label">{label}</span>
      <span className="profile-detail-value">{value}</span>
    </div>
  );
}

const profileStyles = `
  .profile-page {
    font-family: var(--font-outfit), 'Outfit', sans-serif;
    min-height: 60vh;
    background: linear-gradient(180deg, #f4f7ff 0%, #ffffff 60%);
    padding: 48px 20px 72px;
    display: flex;
    justify-content: center;
  }
  .profile-shell {
    width: 100%;
    max-width: 820px;
    background: #fff;
    border: 1px solid rgba(0,48,135,0.10);
    border-radius: 18px;
    box-shadow: 0 12px 40px rgba(0,48,135,0.10);
    overflow: hidden;
  }
  .profile-banner {
    display: flex;
    align-items: center;
    gap: 22px;
    padding: 32px 34px;
    background: linear-gradient(135deg, #001f5c 0%, #003f87 60%, #00419e 100%);
    color: #fff;
  }
  .profile-avatar {
    width: 92px; height: 92px; flex-shrink: 0;
    border-radius: 50%;
    background: linear-gradient(135deg, #FF6B00, #FF8C3A);
    display: flex; align-items: center; justify-content: center;
    font-size: 2rem; font-weight: 700; color: #fff;
    box-shadow: 0 4px 18px rgba(255,107,0,0.4);
    overflow: hidden;
  }
  .profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
  .profile-id h1 { margin: 0; font-size: 1.6rem; font-weight: 700; letter-spacing: 0.01em; }
  .profile-email { margin: 4px 0 10px; opacity: 0.85; font-size: 0.95rem; }
  .profile-badges { display: flex; flex-wrap: wrap; gap: 8px; }
  .profile-badge {
    font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    padding: 4px 10px; border-radius: 999px;
    background: rgba(255,255,255,0.16); color: #fff; border: 1px solid rgba(255,255,255,0.25);
  }
  .profile-badge.ok     { background: rgba(19,136,8,0.9); border-color: transparent; }
  .profile-badge.warn   { background: rgba(255,153,0,0.95); border-color: transparent; color: #3a2400; }
  .profile-badge.danger { background: rgba(200,30,30,0.95); border-color: transparent; }
  .profile-badge.dev    { background: rgba(255,107,0,0.95); border-color: transparent; }

  .profile-grid {
    display: grid; grid-template-columns: repeat(2, 1fr); gap: 2px;
    background: rgba(0,48,135,0.08); padding: 2px;
  }
  .profile-detail { background: #fff; padding: 18px 34px; }
  .profile-detail-label {
    display: block; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; color: #8a93a6; margin-bottom: 4px;
  }
  .profile-detail-value { font-size: 1rem; font-weight: 500; color: #12213a; word-break: break-word; text-transform: capitalize; }

  .profile-actions {
    display: flex; flex-wrap: wrap; gap: 12px;
    padding: 26px 34px 30px;
  }
  .profile-btn, .profile-signout {
    font-family: inherit; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.02em;
    padding: 10px 20px; border-radius: 8px; text-decoration: none; cursor: pointer;
    border: 1.5px solid rgba(0,48,135,0.22); color: #003f87; background: #fff;
    transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  }
  .profile-btn:hover, .profile-signout:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,48,135,0.15); }
  .profile-btn.primary {
    background: linear-gradient(135deg, #003f87, #00419e); color: #fff; border-color: transparent;
  }
  .profile-signout { margin-left: auto; color: #c81e1e; border-color: rgba(200,30,30,0.3); }
  .profile-signout:hover { background: #fff5f5; }

  .profile-empty { text-align: center; padding: 60px 34px; }
  .profile-empty-icon { font-size: 2.6rem; margin-bottom: 8px; }
  .profile-empty h1 { margin: 0 0 8px; font-size: 1.5rem; color: #12213a; }
  .profile-empty p { margin: 0 0 22px; color: #5a6577; }

  @media (max-width: 640px) {
    .profile-banner { flex-direction: column; text-align: center; padding: 28px 20px; }
    .profile-badges { justify-content: center; }
    .profile-grid { grid-template-columns: 1fr; }
    .profile-detail { padding: 16px 22px; }
    .profile-actions { padding: 22px; }
    .profile-signout { margin-left: 0; }
  }
`;
