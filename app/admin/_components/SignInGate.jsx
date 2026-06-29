"use client";

// Sign-in / access states for the admin shell (Session 9). The REAL authorization
// boundary is server-side (every /api/admin/action call re-checks live RBAC); this
// is only the friendly UI a Server Component renders when the viewer is not signed
// in, is not active, or has no admin permissions.
import React from "react";
import { signIn, signOut } from "next-auth/react";

export function SignInGate() {
  return (
    <div className="adm-root">
      <div className="adm-denied">
        <div className="adm-denied-card" style={{ borderTopColor: "var(--adm-blue)" }}>
          <div style={{ fontSize: "2.2rem", marginBottom: 10 }}>🔐</div>
          <h1>Admin sign-in</h1>
          <p>Sign in with your authorized IIT Jammu account to manage the portal.</p>
          <button className="adm-btn primary" onClick={() => signIn("google", { callbackUrl: "/admin" })}>
            Sign in with Google
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccessDenied({ email, reason }) {
  return (
    <div className="adm-root">
      <div className="adm-denied">
        <div className="adm-denied-card">
          <div style={{ fontSize: "2.2rem", marginBottom: 10 }}>⛔</div>
          <h1>No admin access</h1>
          <p>
            {reason === "inactive"
              ? "Your account is not active. Contact a portal administrator."
              : "Your account has no admin permissions yet. Ask an administrator to grant you a role."}
          </p>
          {email && <p style={{ color: "var(--adm-faint)", fontSize: "0.78rem" }}>{email}</p>}
          <button className="adm-btn danger sm" onClick={() => signOut({ callbackUrl: "/" })}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
