import Link from "next/link";
import { loadAdminContext } from "../../lib/admin/server.mjs";
import { PageHead } from "./_components/parts";

// Admin dashboard (Session 9) — the landing page. Renders a quick card for each
// module the viewer can access (the same permission-filtered set the sidebar shows),
// so an editor sees only Content/Media, an org_manager sees Organization, etc.
export const dynamic = "force-dynamic";

const ICONS = { doc: "📄", sitemap: "🗂️", calendar: "📅", image: "🖼️", users: "👥", terminal: "🖥️" };

export default async function AdminDashboard() {
  const ctx = await loadAdminContext();
  // The layout already gated; ctx.state is 'ok' here. Guard defensively anyway.
  const nav = ctx.state === "ok" ? ctx.nav : [];
  const modules = nav.filter((m) => m.key !== "dashboard");

  return (
    <>
      <PageHead
        eyebrow="Admin"
        title={`Welcome${ctx.user?.name ? `, ${ctx.user.name.split(" ")[0]}` : ""}`}
        subtitle="Manage everything the portal renders — content, structure, years, media, users and the developer console."
      />
      <div className="adm-grid">
        {modules.map((m) => (
          <Link key={m.key} href={m.href} className="adm-card adm-card-link">
            <h3>
              <span style={{ marginRight: 8 }}>{ICONS[m.icon] ?? "•"}</span>
              {m.label}
            </h3>
            <p>{m.description}</p>
          </Link>
        ))}
      </div>
      {modules.length === 0 && (
        <div className="adm-card">
          <p>You have admin access but no modules are enabled for your roles. Contact an administrator.</p>
        </div>
      )}
    </>
  );
}
