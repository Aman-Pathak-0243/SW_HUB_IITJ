"use client";

// Shared Admin Panel client primitives (Session 9): the single POST helper to the
// gated /api/admin/action route, a toast system, an action hook (runs a mutation,
// toasts the outcome, refreshes the server-rendered data), and small UI bits
// (Modal, Badge, Field). Keeping these here keeps every module client lean.
import React, { createContext, useContext, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

// POST one admin action; throws an Error carrying { code, status } on failure.
export async function callAdmin(action, args = {}) {
  const res = await fetch("/api/admin/action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, args }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    const err = new Error(data?.error || "The request failed.");
    err.code = data?.code;
    err.status = res.status;
    throw err;
  }
  return data.result;
}

// ── toasts ──
const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text, type = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="adm-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`adm-toast ${t.type}`}>{t.text}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx) ?? (() => {});
}

// Run an admin mutation with toast + refresh wiring. Returns { run, busy }.
export function useAdminAction() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (action, args, { success, refresh = true, onSuccess } = {}) => {
      setBusy(true);
      try {
        const result = await callAdmin(action, args);
        if (success) toast(success, "success");
        if (onSuccess) onSuccess(result);
        if (refresh) router.refresh();
        return result;
      } catch (e) {
        toast(e.message || "Something went wrong.", "error");
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [router, toast]
  );
  return { run, busy };
}

// ── small components ──
export function Badge({ tone = "neutral", children }) {
  return <span className={`adm-badge ${tone}`}>{children}</span>;
}

export function Modal({ title, onClose, children, footer }) {
  return (
    <div className="adm-modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="adm-modal" role="dialog" aria-modal="true">
        <div className="adm-modal-head">
          <h3>{title}</h3>
          <button className="adm-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="adm-modal-body">{children}</div>
        {footer && <div className="adm-modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, error, children }) {
  return (
    <div className="adm-field">
      {label && <label>{label}</label>}
      {children}
      {error && <span className="adm-field-err">{error}</span>}
    </div>
  );
}

// A confirm-then-run button for destructive/lifecycle actions.
export function ConfirmButton({ className = "adm-btn ghost sm", confirm, onConfirm, busy, children }) {
  const onClick = () => {
    if (!confirm || window.confirm(confirm)) onConfirm?.();
  };
  return (
    <button className={className} onClick={onClick} disabled={busy}>
      {children}
    </button>
  );
}
