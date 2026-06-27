"use client";

import React, { useState } from "react";
import { useSession, signIn, signOut } from "next-auth/react";
import Header from "../components/Header";
import Footer from "../components/Footer";

const AdminPage = () => {
  const { data: session, status } = useSession();

  const [form, setForm] = useState({
    title: "",
    description: "",
    date: "",
    image: "",
  });
  const [message, setMessage] = useState("");
  const [toast, setToast] = useState(null); // { text, type: 'success'|'error'|'loading' }

  const showToast = (text, type = "success") => {
    setToast({ text, type });
    if (type !== "loading") {
      setTimeout(() => setToast(null), 3500);
    }
  };
  const [imagePreview, setImagePreview] = useState(null);

  // ---------------- LOADING ----------------
  if (status === "loading") {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap');
          .admin-loading {
            font-family: 'Outfit', sans-serif;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #f0f4fb;
            gap: 16px;
          }
          .admin-spinner {
            width: 40px; height: 40px;
            border: 3px solid rgba(0,48,135,0.15);
            border-top-color: #003087;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          .admin-loading p {
            color: #6b7280;
            font-size: 0.9rem;
            letter-spacing: 0.04em;
          }
        `}</style>
        <div className="admin-loading">
          <div className="admin-spinner" />
          <p>Loading session…</p>
        </div>
      </>
    );
  }

  // ---------------- LOGIN PAGE ----------------
  if (!session) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@300;400;500;600&display=swap');

          .login-page {
            font-family: 'Outfit', sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f0f4fb;
            position: relative;
            overflow: hidden;
            padding: 24px;
          }
          /* Decorative background blobs */
          .login-page::before {
            content: '';
            position: absolute;
            top: -120px; left: -120px;
            width: 500px; height: 500px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(0,48,135,0.08) 0%, transparent 70%);
            pointer-events: none;
          }
          .login-page::after {
            content: '';
            position: absolute;
            bottom: -100px; right: -100px;
            width: 400px; height: 400px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255,107,0,0.07) 0%, transparent 70%);
            pointer-events: none;
          }

          .login-card {
            position: relative;
            z-index: 1;
            background: #ffffff;
            width: 100%;
            max-width: 420px;
            border-radius: 24px;
            box-shadow: 0 20px 60px rgba(0,48,135,0.12), 0 4px 16px rgba(0,0,0,0.06);
            overflow: hidden;
            animation: fadeUp 0.5s ease both;
          }
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(24px); }
            to   { opacity: 1; transform: translateY(0); }
          }

          /* Blue top accent */
          .login-card-top {
            background: linear-gradient(135deg, #001f5c 0%, #003087 60%, #00419e 100%);
            padding: 36px 32px 32px;
            text-align: center;
            position: relative;
            overflow: hidden;
          }
          .login-card-top::before {
            content: '';
            position: absolute;
            inset: 0;
            background: repeating-linear-gradient(
              -55deg, transparent, transparent 30px,
              rgba(255,255,255,0.02) 30px, rgba(255,255,255,0.02) 60px
            );
          }
          .login-card-top::after {
            content: '';
            position: absolute;
            bottom: 0; left: 0; right: 0;
            height: 2px;
            background: linear-gradient(90deg, transparent, #FF6B00 50%, transparent);
            opacity: 0.8;
          }
          .login-icon {
            width: 64px; height: 64px;
            border-radius: 50%;
            background: rgba(255,255,255,0.12);
            border: 1.5px solid rgba(255,255,255,0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 16px;
            font-size: 1.6rem;
          }
          .login-card-top h1 {
            font-family: 'Cormorant Garamond', serif;
            font-size: 1.8rem;
            font-weight: 700;
            color: #ffffff;
            letter-spacing: 0.05em;
            margin-bottom: 6px;
          }
          .login-card-top p {
            font-size: 0.8rem;
            color: rgba(255,255,255,0.65);
            letter-spacing: 0.04em;
          }

          /* Body */
          .login-card-body {
            padding: 32px;
          }
          .google-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            width: 100%;
            padding: 14px 20px;
            border: 1.5px solid rgba(0,48,135,0.15);
            border-radius: 12px;
            background: #fff;
            color: #374151;
            font-family: 'Outfit', sans-serif;
            font-size: 0.9rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.22s ease;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
            letter-spacing: 0.02em;
          }
          .google-btn:hover {
            background: #f0f4fb;
            border-color: #003087;
            box-shadow: 0 4px 16px rgba(0,48,135,0.12);
            transform: translateY(-1px);
          }
          .login-footer-note {
            text-align: center;
            margin-top: 20px;
            font-size: 0.72rem;
            color: #9ca3af;
            letter-spacing: 0.03em;
          }
        `}</style>

        <main className="login-page">
          <div className="login-card">
            <div className="login-card-top">
              <div className="login-icon">🔐</div>
              <h1>Admin Portal</h1>
              <p>Student Affairs Council · IIT Jammu</p>
            </div>
            <div className="login-card-body">
              <button onClick={() => signIn("google")} className="google-btn">
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.66 1.22 9.14 3.62l6.82-6.82C35.82 2.34 30.47 0 24 0 14.64 0 6.48 5.38 2.56 13.22l7.94 6.17C12.6 13.09 17.9 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.1 24.55c0-1.64-.15-3.21-.43-4.73H24v9.03h12.45c-.54 2.9-2.17 5.36-4.62 7.03l7.1 5.51c4.15-3.83 6.17-9.48 6.17-15.84z"/>
                  <path fill="#FBBC05" d="M10.5 28.39c-.49-1.45-.77-2.99-.77-4.39s.28-2.94.77-4.39l-7.94-6.17C.92 16.53 0 20.16 0 24s.92 7.47 2.56 10.56l7.94-6.17z"/>
                  <path fill="#34A853" d="M24 48c6.47 0 11.82-2.13 15.76-5.79l-7.1-5.51c-1.97 1.33-4.49 2.11-8.66 2.11-6.1 0-11.4-3.59-13.5-8.89l-7.94 6.17C6.48 42.62 14.64 48 24 48z"/>
                </svg>
                Sign in with Google
              </button>
              <p className="login-footer-note">Only authorized admin emails can access this portal</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ---------------- ACCESS DENIED ----------------
  if (!session.user.isAdmin) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap');
          .denied-page {
            font-family: 'Outfit', sans-serif;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #f0f4fb;
            gap: 12px;
            padding: 24px;
          }
          .denied-card {
            background: white;
            border-radius: 20px;
            padding: 48px 40px;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.08);
            max-width: 360px;
            width: 100%;
            border-top: 3px solid #ef4444;
          }
          .denied-icon { font-size: 2.5rem; margin-bottom: 12px; }
          .denied-card h1 { font-size: 1.2rem; font-weight: 600; color: #ef4444; margin-bottom: 6px; }
          .denied-card p  { font-size: 0.82rem; color: #6b7280; margin-bottom: 24px; }
          .denied-btn {
            padding: 10px 24px;
            background: #003087;
            color: white;
            border: none;
            border-radius: 10px;
            font-family: 'Outfit', sans-serif;
            font-size: 0.85rem;
            font-weight: 500;
            cursor: pointer;
            transition: background 0.2s;
          }
          .denied-btn:hover { background: #001f5c; }
        `}</style>
        <main className="denied-page">
          <div className="denied-card">
            <div className="denied-icon">⛔</div>
            <h1>Access Denied</h1>
            <p>{session.user.email}</p>
            <button onClick={() => signOut()} className="denied-btn">Sign Out</button>
          </div>
        </main>
      </>
    );
  }

  // ---------------- FORM LOGIC ----------------
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
      setForm((prev) => ({ ...prev, image: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    showToast("Publishing event...", "loading");

    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    console.log("res =", res);

    if (res.ok) {
      showToast("Event published successfully!", "success");
      setForm({ title: "", description: "", date: "", image: "" });
      setImagePreview(null);
    } else {
      showToast("Failed to add event. Try again.", "error");
    }
  };

  // ---------------- ADMIN DASHBOARD ----------------
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@300;400;500;600&display=swap');

        .admin-page {
          font-family: 'Outfit', sans-serif;
          min-height: 100vh;
          background: #f0f4fb;
          position: relative;
          overflow-x: hidden;
        }
        .admin-page::before {
          content: '';
          position: fixed;
          inset: 0;
          background-image:
            linear-gradient(rgba(0,48,135,0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,48,135,0.03) 1px, transparent 1px);
          background-size: 48px 48px;
          pointer-events: none;
          z-index: 0;
        }

        .admin-inner {
          position: relative;
          z-index: 1;
          max-width: 640px;
          margin: 0 auto;
          padding: 48px 24px 80px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 28px;
        }

        /* Page title */
        .admin-heading {
          text-align: center;
        }
        .admin-heading-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 0.68rem;
          font-weight: 600;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          color: #FF6B00;
          margin-bottom: 10px;
        }
        .admin-heading-eyebrow::before,
        .admin-heading-eyebrow::after {
          content: '';
          display: block;
          width: 24px;
          height: 1.5px;
          background: #FF6B00;
          opacity: 0.6;
          border-radius: 2px;
        }
        .admin-heading h1 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 2rem;
          font-weight: 700;
          color: #003087;
          letter-spacing: 0.04em;
          line-height: 1.1;
        }

        /* Top bar */
        .admin-topbar {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #ffffff;
          border-radius: 16px;
          padding: 14px 20px;
          box-shadow: 0 2px 16px rgba(0,48,135,0.08);
          border: 1px solid rgba(0,48,135,0.08);
        }
        .admin-user {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .admin-avatar {
          width: 40px; height: 40px;
          border-radius: 50%;
          background: linear-gradient(135deg, #003087, #00419e);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 1rem;
          box-shadow: 0 2px 8px rgba(0,48,135,0.25);
          flex-shrink: 0;
        }
        .admin-user-info p:first-child {
          font-size: 0.68rem;
          color: #9ca3af;
          letter-spacing: 0.04em;
          margin-bottom: 1px;
        }
        .admin-user-info p:last-child {
          font-size: 0.85rem;
          font-weight: 500;
          color: #1f2937;
        }
        .admin-logout-btn {
          font-family: 'Outfit', sans-serif;
          font-size: 0.78rem;
          font-weight: 500;
          padding: 7px 16px;
          border-radius: 8px;
          border: 1.5px solid rgba(239,68,68,0.25);
          background: rgba(239,68,68,0.05);
          color: #dc2626;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .admin-logout-btn:hover {
          background: rgba(239,68,68,0.1);
          border-color: #ef4444;
        }

        /* Form card */
        .admin-form-card {
          width: 100%;
          background: #ffffff;
          border-radius: 20px;
          box-shadow: 0 8px 40px rgba(0,48,135,0.1), 0 2px 8px rgba(0,0,0,0.04);
          overflow: hidden;
          animation: fadeUp 0.5s ease both;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* Card header */
        .admin-form-header {
          background: linear-gradient(135deg, #001f5c 0%, #003087 60%, #00419e 100%);
          padding: 24px 28px;
          position: relative;
          overflow: hidden;
        }
        .admin-form-header::before {
          content: '';
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            -55deg, transparent, transparent 30px,
            rgba(255,255,255,0.02) 30px, rgba(255,255,255,0.02) 60px
          );
        }
        .admin-form-header::after {
          content: '';
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #FF6B00 50%, transparent);
          opacity: 0.7;
        }
        .admin-form-header h2 {
          font-family: 'Cormorant Garamond', serif;
          font-size: 1.3rem;
          font-weight: 700;
          color: #fff;
          letter-spacing: 0.06em;
          position: relative;
        }
        .admin-form-header p {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.55);
          margin-top: 3px;
          letter-spacing: 0.04em;
          position: relative;
        }

        /* Form body */
        .admin-form-body {
          padding: 28px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .field-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field-label {
          font-size: 0.72rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #6b7280;
        }

        .admin-input,
        .admin-textarea {
          width: 100%;
          padding: 12px 16px;
          border: 1.5px solid rgba(0,48,135,0.12);
          border-radius: 10px;
          font-family: 'Outfit', sans-serif;
          font-size: 0.88rem;
          color: #1f2937;
          background: #fafbff;
          transition: border-color 0.2s, box-shadow 0.2s;
          outline: none;
        }
        .admin-input:focus,
        .admin-textarea:focus {
          border-color: #003087;
          box-shadow: 0 0 0 3px rgba(0,48,135,0.08);
          background: #fff;
        }
        .admin-textarea {
          resize: vertical;
          min-height: 100px;
        }

        .admin-submit-btn {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #001f5c 0%, #003087 100%);
          color: #fff;
          border: none;
          border-radius: 12px;
          font-family: 'Outfit', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          cursor: pointer;
          transition: all 0.25s ease;
          box-shadow: 0 4px 16px rgba(0,48,135,0.3);
          margin-top: 4px;
        }
        .admin-submit-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(0,48,135,0.35);
        }
        .admin-submit-btn:active { transform: translateY(0); }

        .img-upload-zone {
          width: 100%;
          border: 2px dashed rgba(0,48,135,0.2);
          border-radius: 12px;
          background: #fafbff;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
          overflow: hidden;
          position: relative;
        }
        .img-upload-zone:hover {
          border-color: #003087;
          background: #f0f4ff;
        }
        .img-upload-zone input[type="file"] {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
          width: 100%;
          height: 100%;
          z-index: 2;
        }
        .img-upload-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 32px 16px;
          pointer-events: none;
        }
        .img-upload-icon {
          width: 48px; height: 48px;
          border-radius: 12px;
          background: rgba(0,48,135,0.08);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.4rem;
        }
        .img-upload-placeholder p {
          font-size: 0.82rem;
          color: #6b7280;
          text-align: center;
          line-height: 1.5;
        }
        .img-upload-placeholder span {
          font-size: 0.72rem;
          color: #003087;
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .img-preview-wrap {
          position: relative;
          width: 100%;
          height: 180px;
          pointer-events: none;
        }
        .img-preview-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .img-preview-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          color: white;
          font-size: 0.78rem;
          font-weight: 500;
          letter-spacing: 0.04em;
          opacity: 0;
          transition: opacity 0.2s;
        }
        .img-upload-zone:hover .img-preview-overlay {
          opacity: 1;
        }

        .admin-message {
          display: none;
        }

        /* ── Toast notification ── */
        .toast {
          position: fixed;
          top: 24px;
          left: 50%;
          transform: translateX(-50%) translateY(-80px);
          z-index: 9999;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 22px;
          border-radius: 14px;
          font-family: 'Outfit', sans-serif;
          font-size: 0.88rem;
          font-weight: 500;
          letter-spacing: 0.02em;
          box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1);
          min-width: 260px;
          max-width: 90vw;
          text-align: center;
          justify-content: center;
          animation: toastIn 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards;
          pointer-events: none;
        }
        .toast.hide {
          animation: toastOut 0.3s ease forwards;
        }
        .toast.success {
          background: #003087;
          color: #ffffff;
          border: 1px solid rgba(255,255,255,0.15);
        }
        .toast.error {
          background: #dc2626;
          color: #ffffff;
        }
        .toast.loading {
          background: #1f2937;
          color: #ffffff;
        }
        .toast-icon {
          font-size: 1.1rem;
          flex-shrink: 0;
        }
        .toast-bar {
          position: absolute;
          bottom: 0; left: 0;
          height: 3px;
          background: rgba(255,255,255,0.4);
          border-radius: 0 0 14px 14px;
          animation: toastBar 3.5s linear forwards;
        }
        .toast.loading .toast-bar { display: none; }

        @keyframes toastIn {
          from { transform: translateX(-50%) translateY(-80px); opacity: 0; }
          to   { transform: translateX(-50%) translateY(0);    opacity: 1; }
        }
        @keyframes toastOut {
          from { transform: translateX(-50%) translateY(0);    opacity: 1; }
          to   { transform: translateX(-50%) translateY(-80px); opacity: 0; }
        }
        @keyframes toastBar {
          from { width: 100%; }
          to   { width: 0%; }
        }
      `}</style>

      <Header />

      {/* Toast notification */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          <span className="toast-icon">
            {toast.type === "success" ? "✅" : toast.type === "error" ? "❌" : "⏳"}
          </span>
          {toast.text}
          <div className="toast-bar" />
        </div>
      )}
      <main className="admin-page">
        <div className="admin-inner">

          {/* Page heading */}
          <div className="admin-heading">
            <p className="admin-heading-eyebrow">Portal</p>
            <h1>Admin Dashboard</h1>
          </div>

          {/* Top bar */}
          <div className="admin-topbar">
            <div className="admin-user">
              <div className="admin-avatar">
                {session.user.email.charAt(0).toUpperCase()}
              </div>
              <div className="admin-user-info">
                <p>Logged in as</p>
                <p>{session.user.email}</p>
              </div>
            </div>
            <button onClick={() => signOut()} className="admin-logout-btn">
              Sign Out
            </button>
          </div>

          {/* Form card */}
          <div className="admin-form-card">
            <div className="admin-form-header">
              <h2>Publish New Event</h2>
              <p>Fill in the details below to add an event</p>
            </div>
            <div className="admin-form-body">
              <form onSubmit={handleSubmit} style={{ display: 'contents' }}>

                <div className="field-group">
                  <label className="field-label">Event Title *</label>
                  <input
                    type="text"
                    name="title"
                    placeholder="e.g. Annual Sports Meet 2025"
                    value={form.title}
                    onChange={handleChange}
                    required
                    className="admin-input"
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">Description</label>
                  <textarea
                    name="description"
                    placeholder="Describe the event..."
                    value={form.description}
                    onChange={handleChange}
                    className="admin-textarea"
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">Event Date *</label>
                  <input
                    type="date"
                    name="date"
                    value={form.date}
                    onChange={handleChange}
                    required
                    className="admin-input"
                  />
                </div>

                <div className="field-group">
                  <label className="field-label">Event Image</label>
                  <div className="img-upload-zone">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                    />
                    {imagePreview ? (
                      <div className="img-preview-wrap">
                        <img src={imagePreview} alt="Preview" />
                        <div className="img-preview-overlay">
                          🖼️ Click to change image
                        </div>
                      </div>
                    ) : (
                      <div className="img-upload-placeholder">
                        <div className="img-upload-icon">📷</div>
                        <p>Click to select an image<br />from your gallery</p>
                        <span>JPG, PNG, WEBP supported</span>
                      </div>
                    )}
                  </div>
                </div>

                <button type="submit" className="admin-submit-btn">
                  Publish Event
                </button>

              </form>
            </div>
          </div>

        </div>
      </main>
      <Footer />
    </>
  );
};

export default AdminPage;