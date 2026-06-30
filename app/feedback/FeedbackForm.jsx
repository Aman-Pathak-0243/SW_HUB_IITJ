"use client";

import React, { useState } from "react";
import Link from "next/link";
import { validateFeedbackForm, FEEDBACK_CATEGORIES } from "../../lib/feedback/forms.mjs";

const CATEGORY_LABEL = { bug: "Bug", issue: "Issue", query: "Question", suggestion: "Suggestion" };

// Public feedback / support-ticket form (M7). Validates client-side with the SAME
// pure validator the server uses, posts to /api/feedback, and shows the returned
// reference id so the submitter can quote it.
export default function FeedbackForm() {
  const [form, setForm] = useState({ category: "bug", subject: "", body: "", component: "", email: "" });
  const [errors, setErrors] = useState({});
  const [msg, setMsg] = useState(null); // { type, text }
  const [ref, setRef] = useState(null);
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    const v = validateFeedbackForm(form);
    setErrors(v.errors);
    if (!v.ok) return;
    setBusy(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(v.value),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: "error", text: data?.error || "Could not submit your feedback." });
      } else {
        setRef(data.referenceId);
        setMsg({ type: "success", text: `Thank you — your reference id is ${data.referenceId}.` });
        setForm({ category: "bug", subject: "", body: "", component: "", email: "" });
      }
    } catch {
      setMsg({ type: "error", text: "Network error — please try again." });
    } finally {
      setBusy(false);
    }
  };

  if (ref) {
    return (
      <div className="acc-card">
        <h1>Feedback received</h1>
        <p className="acc-msg success">Your reference id is <strong>{ref}</strong>. Quote it in any follow-up.</p>
        <div className="acc-links">
          <button className="acc-btn" onClick={() => { setRef(null); setMsg(null); }}>Submit another</button>
        </div>
        <div className="acc-links" style={{ marginTop: 12 }}><Link href="/">Back to the site</Link></div>
      </div>
    );
  }

  return (
    <form className="acc-card" onSubmit={submit}>
      <h1>Send feedback</h1>
      <p className="acc-sub">Report a bug, ask a question, or suggest an improvement. Every submission gets a unique reference id.</p>
      {msg && <p className={`acc-msg ${msg.type}`}>{msg.text}</p>}

      <div className="acc-field">
        <label>Category</label>
        <select className="acc-input" value={form.category} onChange={set("category")}>
          {FEEDBACK_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</option>)}
        </select>
      </div>
      <div className="acc-field">
        <label>Subject</label>
        <input className="acc-input" value={form.subject} onChange={set("subject")} placeholder="A short summary" />
        {errors.subject && <div className="acc-field-err">{errors.subject}</div>}
      </div>
      <div className="acc-field">
        <label>Details</label>
        <textarea className="acc-input" rows={5} value={form.body} onChange={set("body")} placeholder="What happened? What did you expect?" />
        {errors.body && <div className="acc-field-err">{errors.body}</div>}
      </div>
      <div className="acc-field">
        <label>Component / page (optional)</label>
        <input className="acc-input" value={form.component} onChange={set("component")} placeholder="e.g. /events, the login page, a service id" />
        {errors.component && <div className="acc-field-err">{errors.component}</div>}
      </div>
      <div className="acc-field">
        <label>Your email (optional, for a reply)</label>
        <input className="acc-input" type="email" value={form.email} onChange={set("email")} placeholder="you@iitjammu.ac.in" />
        {errors.email && <div className="acc-field-err">{errors.email}</div>}
      </div>

      <button className="acc-btn" type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit feedback"}</button>
      <div className="acc-links" style={{ marginTop: 12 }}><Link href="/">Back to the site</Link></div>
    </form>
  );
}
