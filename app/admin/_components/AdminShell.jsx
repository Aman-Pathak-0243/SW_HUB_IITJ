"use client";

// The admin shell chrome (Session 9): a permission-filtered sidebar + a topbar
// with the current-year indicator, a developer badge, the signed-in user, and
// sign-out. Receives `nav` (already filtered server-side by the viewer's
// permissions — lib/admin/nav.mjs) so the client never decides visibility.
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ToastProvider } from "./ui";

const ICONS = {
  home: "🏠", doc: "📄", sitemap: "🗂️", calendar: "📅", image: "🖼️", users: "👥", terminal: "🖥️",
};

function isActive(pathname, href) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminShell({ nav = [], user, currentYearLabel, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <ToastProvider>
      <div className="adm-shell">
        <aside className={`adm-sidebar ${open ? "open" : ""}`}>
          <div className="adm-brand">
            <h1>Student Affairs</h1>
            <p>IIT Jammu · Admin</p>
          </div>
          <nav className="adm-nav">
            {nav.map((m) => (
              <Link key={m.key} href={m.href} className={isActive(pathname, m.href) ? "active" : ""} onClick={() => setOpen(false)}>
                <span className="adm-nav-ico">{ICONS[m.icon] ?? "•"}</span>
                {m.label}
              </Link>
            ))}
          </nav>
          <div className="adm-sidebar-foot">Portal V2 · Session-built admin</div>
        </aside>

        <div className="adm-main">
          <header className="adm-topbar">
            <button className="adm-btn ghost sm" style={{ display: "none" }} onClick={() => setOpen((o) => !o)} data-mobile-toggle>
              ☰
            </button>
            <div className="adm-topbar-meta">
              {currentYearLabel ? (
                <span className="adm-yearchip">Current year · {currentYearLabel}</span>
              ) : (
                <span className="adm-yearchip" style={{ color: "var(--adm-warn)", background: "var(--adm-warn-bg)" }}>No current year set</span>
              )}
              {user?.isDeveloper && <span className="adm-badge dev">Developer</span>}
            </div>
            <div className="adm-user">
              <div className="adm-avatar">{initial}</div>
              <div className="adm-user-info">
                <p>{user?.name || "Admin"}</p>
                <p>{user?.email}</p>
              </div>
              <button className="adm-btn danger sm" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button>
            </div>
          </header>
          <main className="adm-content">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
