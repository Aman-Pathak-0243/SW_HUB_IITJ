"use client";

// Sign-in / access states for the admin shell. The REAL authorization boundary is
// server-side (every /api/admin/action call re-checks live RBAC); this is only the
// friendly UI a Server Component renders when the viewer is not signed in, is not
// active, or has no admin permissions.
//
// M0 (DL-058): the admin sign-in is now email + password (credentials). The legacy
// Google button is gone — when the member-platform plugin is on, Google is rejected
// at the auth layer anyway, and admins use the same credentials login as members.
import React, { useState } from "react";
import { signIn, signOut } from "next-auth/react";

export function SignInGate() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await signIn("credentials", { email: form.email, password: form.password, redirect: false });
    setBusy(false);
    if (res?.error) {
      setError("Incorrect email or password, or your account is not active.");
      return;
    }
    // Reload so the server re-renders the (now-authenticated) admin shell. A
    // must-change account is redirected to /account/password by the middleware.
    window.location.href = "/admin";
  };

  return (
    <div className="adm-root">
      <div className="adm-denied">
        <div className="adm-denied-card" style={{ borderTopColor: "var(--adm-blue)", textAlign: "left" }}>
          <div style={{ fontSize: "2.2rem", marginBottom: 10, textAlign: "center" }}>🔐</div>
          <h1 style={{ textAlign: "center" }}>Admin sign-in</h1>
          <p style={{ textAlign: "center" }}>Sign in with your authorized IIT Jammu account.</p>
          {error && <p className="adm-banner danger" style={{ marginTop: 10 }}>{error}</p>}
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
            <input className="adm-input" type="email" placeholder="Email" autoComplete="username"
              value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <input className="adm-input" type="password" placeholder="Password" autoComplete="current-password"
              value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
            <button className="adm-btn primary" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
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
