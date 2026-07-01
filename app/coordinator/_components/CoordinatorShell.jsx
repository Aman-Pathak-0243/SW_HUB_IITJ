"use client";

// The scoped-coordinator shell chrome (Session 13, DL-096) — mirrors AdminShell but for
// the standalone /coordinator surface: a sidebar (nav already filtered server-side by the
// coordinator's scoped capabilities), a topbar, and sign-out. Provides ToastProvider so
// the child management clients' useAdminAction() has its toast context.
import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ToastProvider } from "../../admin/_components/ui";

const ICONS = { home: "🏠", calendar: "📅", users: "👥", gauge: "📊" };

function isActive(pathname, href) {
  if (href === "/coordinator") return pathname === "/coordinator";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function CoordinatorShell({ nav = [], user, children }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase();

  return (
    <ToastProvider>
      <div className="adm-shell">
        {open && <div className="adm-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />}
        <aside className={`adm-sidebar ${open ? "open" : ""}`}>
          <div className="adm-brand">
            <h1>Coordinator</h1>
            <p>IIT Jammu · My units</p>
          </div>
          <nav className="adm-nav">
            {nav.map((m) => (
              <Link key={m.key} href={m.href} className={isActive(pathname, m.href) ? "active" : ""} onClick={() => setOpen(false)}>
                <span className="adm-nav-ico">{ICONS[m.icon] ?? "•"}</span>
                {m.label}
              </Link>
            ))}
          </nav>
          <div className="adm-sidebar-foot">Scoped coordinator surface</div>
        </aside>

        <div className="adm-main">
          <header className="adm-topbar">
            <button
              className="adm-btn ghost sm adm-mobile-toggle"
              onClick={() => setOpen((o) => !o)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              ☰
            </button>
            <div className="adm-topbar-meta">
              <span className="adm-yearchip">Coordinator dashboard</span>
            </div>
            <div className="adm-user">
              <div className="adm-avatar">{initial}</div>
              <div className="adm-user-info">
                <p>{user?.name || "Coordinator"}</p>
                <p>{user?.email}</p>
              </div>
              <Link className="adm-btn ghost sm" href="/member">Member</Link>
              <button className="adm-btn danger sm" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button>
            </div>
          </header>
          <main className="adm-content">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
