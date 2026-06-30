"use client";

// Member-platform auth client components (M0, DL-058). Email+password sign-in,
// the public account-creation request + forgot-password forms, and the
// self-service / forced change-password form. The REAL boundaries are server-side
// (NextAuth credentials authorize + the gated /api/account/* routes + the
// middleware); these are the friendly forms.
import React, { useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { validateChangePasswordForm, passwordRequirements } from "../../../lib/admin/forms.mjs";

function Card({ title, subtitle, children }) {
  return (
    <div className="acc-root">
      <div className="acc-card">
        <h1>{title}</h1>
        {subtitle && <p className="acc-sub">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

// ── Email + password sign-in ──
export function SignInCard({ callbackUrl = "/", showRequestLinks = true }) {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });
    setBusy(false);
    if (res?.error) {
      setError("Incorrect email or password, or your account is not active.");
      return;
    }
    // The middleware redirects a must-change account to /account/password.
    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <Card title="Sign in" subtitle="Use your IIT Jammu portal account (email + password).">
      {error && <div className="acc-msg error">{error}</div>}
      <form onSubmit={submit}>
        <div className="acc-field">
          <label htmlFor="email">Email</label>
          <input id="email" className="acc-input" type="email" autoComplete="username" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div className="acc-field">
          <label htmlFor="password">Password</label>
          <input id="password" className="acc-input" type="password" autoComplete="current-password" value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </div>
        <button className="acc-btn" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      {showRequestLinks && (
        <div className="acc-links">
          <Link href="/account/forgot">Forgot password?</Link>
          <Link href="/account/request">Request an account</Link>
        </div>
      )}
    </Card>
  );
}

// ── Public account-creation request ──
export function RequestAccountCard() {
  const [form, setForm] = useState({ email: "", name: "", message: "" });
  const [state, setState] = useState({ status: null, text: null });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setState({ status: null, text: null });
    try {
      const res = await fetch("/api/account/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ status: "error", text: data?.error || "Could not submit your request." });
      } else {
        setState({ status: "success", text: `Request received${data.referenceId ? ` (ref ${data.referenceId})` : ""}. The portal team will create your account and email your initial password.` });
        setForm({ email: "", name: "", message: "" });
      }
    } catch {
      setState({ status: "error", text: "Network error — please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Request an account" subtitle="An administrator will create your account and send your initial password via the institute's email.">
      {state.text && <div className={`acc-msg ${state.status}`}>{state.text}</div>}
      <form onSubmit={submit}>
        <div className="acc-field">
          <label htmlFor="r-email">Institute email</label>
          <input id="r-email" className="acc-input" type="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </div>
        <div className="acc-field">
          <label htmlFor="r-name">Your name</label>
          <input id="r-name" className="acc-input" type="text" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="acc-field">
          <label htmlFor="r-msg">Why do you need access? (optional)</label>
          <input id="r-msg" className="acc-input" type="text" value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })} />
        </div>
        <button className="acc-btn" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button>
      </form>
      <div className="acc-links"><Link href="/login">Back to sign in</Link></div>
    </Card>
  );
}

// ── Public forgot-password request ──
export function ForgotCard() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ status: null, text: null });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setState({ status: null, text: null });
    try {
      const res = await fetch("/api/account/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ status: "error", text: data?.error || "Could not submit your request." });
      } else {
        setState({ status: "success", text: data.message || "If an account exists, the portal team has been notified." });
        setEmail("");
      }
    } catch {
      setState({ status: "error", text: "Network error — please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Forgot password" subtitle="Enter your email. A portal administrator will reset your password and send a new one via the institute's email (resets are admin-mediated by design).">
      {state.text && <div className={`acc-msg ${state.status}`}>{state.text}</div>}
      <form onSubmit={submit}>
        <div className="acc-field">
          <label htmlFor="f-email">Email</label>
          <input id="f-email" className="acc-input" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <button className="acc-btn" type="submit" disabled={busy}>{busy ? "Submitting…" : "Request a reset"}</button>
      </form>
      <div className="acc-links"><Link href="/login">Back to sign in</Link></div>
    </Card>
  );
}

// ── Self-service / forced change-password ──
export function ChangePasswordCard({ email, forced = false }) {
  const router = useRouter();
  const { update } = useSession();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ status: null, text: null });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setState({ status: null, text: null });
    const v = validateChangePasswordForm(form, { requireCurrent: true });
    setErrors(v.errors);
    if (!v.ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: form.currentPassword, newPassword: form.newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ status: "error", text: data?.error || "Could not change your password." });
        setBusy(false);
        return;
      }
      // Refresh the JWT so must_change_password clears (the middleware stops
      // redirecting), then leave the change page.
      await update();
      setState({ status: "success", text: "Password changed. Redirecting…" });
      router.push("/");
      router.refresh();
    } catch {
      setState({ status: "error", text: "Network error — please try again." });
      setBusy(false);
    }
  };

  return (
    <Card
      title="Change your password"
      subtitle={forced ? "You must set a new password before continuing." : `Signed in as ${email ?? "your account"}.`}
    >
      {forced && <div className="acc-msg info">Your account was issued a temporary password. Please choose a new one.</div>}
      {state.text && <div className={`acc-msg ${state.status}`}>{state.text}</div>}
      <form onSubmit={submit}>
        <div className="acc-field">
          <label htmlFor="cp-cur">Current password</label>
          <input id="cp-cur" className="acc-input" type="password" autoComplete="current-password" value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} />
          {errors.currentPassword && <span className="acc-field-err">{errors.currentPassword}</span>}
        </div>
        <div className="acc-field">
          <label htmlFor="cp-new">New password</label>
          <input id="cp-new" className="acc-input" type="password" autoComplete="new-password" value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
          {errors.newPassword && <span className="acc-field-err">{errors.newPassword}</span>}
        </div>
        <ul className="acc-reqs">{passwordRequirements().map((r) => <li key={r}>{r}</li>)}</ul>
        <div className="acc-field">
          <label htmlFor="cp-conf">Confirm new password</label>
          <input id="cp-conf" className="acc-input" type="password" autoComplete="new-password" value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
          {errors.confirm && <span className="acc-field-err">{errors.confirm}</span>}
        </div>
        <button className="acc-btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
      </form>
    </Card>
  );
}

// Shown when a member page is reached while the plugin is OFF.
export function FeatureOff() {
  return (
    <div className="acc-root">
      <div className="acc-card">
        <h1>Not available</h1>
        <p className="acc-disabled-note">
          The member platform is not enabled on this portal yet. Please check back later, or
          contact a portal administrator.
        </p>
        <div className="acc-links"><Link href="/">Back to the site</Link></div>
      </div>
    </div>
  );
}
