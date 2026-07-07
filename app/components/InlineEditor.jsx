"use client";

// Inline edit-on-public-page control (Session 15, DL-103). Rendered ONLY when the server
// resolved the viewer's scoped content.update for this item (`resolveInlineEditCapability`).
// Opens a small modal of the type's inline-editable fields and posts the EXISTING gated
// content actions to /api/admin/action (same-origin + requireUser active-only; the service
// re-authorizes at the item's scope). With publish rights it "saves & makes live"
// (content.editAndPublish); a draft-only editor (co_coordinator) "saves a draft" (content.edit)
// which an authorized publisher later promotes. The button state is a UX aid — the server
// is the authority, so a forged request from a non-authorized account is still rejected.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { getInlineFields, buildEditPatch, patchHasChanges } from "../../lib/cms/inline.mjs";

export default function InlineEditor({ contentType, itemId, values = {}, canPublish = false, label = "Edit details" }) {
  const router = useRouter();
  const fields = getInlineFields(contentType);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? ""])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!fields.length) return null;

  const missingRequired = fields.some((f) => f.required && !String(form[f.key] ?? "").trim());

  async function save() {
    setError(null);
    // Build the patch from ONLY the fields the user actually changed (vs the seeded values),
    // so an unchanged Save is a true no-op and we don't fork/publish an identical revision.
    const changed = {};
    for (const f of fields) {
      const cur = String(form[f.key] ?? "").trim();
      const orig = String(values[f.key] ?? "").trim();
      if (cur !== orig) changed[f.key] = form[f.key];
    }
    const patch = buildEditPatch(contentType, changed);
    if (!patchHasChanges(patch)) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      // Publisher → save & make live in one call; draft-only → save a draft for later publish.
      const action = canPublish ? "content.editAndPublish" : "content.edit";
      const res = await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, args: { itemId, patch } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "The change could not be saved.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md border border-[#003f87]/30 bg-white/80 px-2.5 py-1 text-xs font-semibold text-[#003f87] shadow-sm hover:bg-[#003f87] hover:text-white transition"
        title="Edit these details on this page (your changes are audited)"
      >
        ✏ {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}
        >
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#003f87]">{label}</h3>
              <button type="button" className="text-gray-400 hover:text-gray-700" disabled={busy} onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>

            <div className="space-y-4">
              {fields.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-1 block text-sm font-medium text-gray-700">
                    {f.label}{f.required ? " *" : ""}
                  </span>
                  {f.type === "textarea" ? (
                    <textarea
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#003f87] focus:outline-none focus:ring-1 focus:ring-[#003f87]"
                      rows={4}
                      value={form[f.key] ?? ""}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  ) : (
                    <input
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-[#003f87] focus:outline-none focus:ring-1 focus:ring-[#003f87]"
                      value={form[f.key] ?? ""}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  )}
                </label>
              ))}
            </div>

            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            {!canPublish && (
              <p className="mt-3 text-xs text-amber-700">You can save a draft; a publisher must approve it before it appears publicly.</p>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
              <button
                type="button"
                className="rounded-md bg-[#003f87] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00306a] disabled:opacity-50"
                disabled={busy || missingRequired}
                onClick={save}
              >
                {busy ? "Saving…" : canPublish ? "Save & publish" : "Save draft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
