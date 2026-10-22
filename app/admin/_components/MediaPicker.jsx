"use client";

// The admin IMAGE PICKER (Session 15) — the control that replaced a text box
// asking an editor to type a media_asset UUID.
//
// Two ways to attach an image, because they have different costs:
//   • "Already on the site" — search the files shipped in public/ by name, with a
//     debounced type-ahead against GET /api/admin/media/static. Picking one POSTs
//     media.static.pick, which registers (or REUSES) a `local` media_asset for
//     that path. No Cloudinary credit is spent.
//   • "Upload" — POST the file to /api/admin/media/upload, the one multipart admin
//     route, which pushes it to Cloudinary and registers the asset.
// Both branches hand back a media_asset id, which is what every *MediaId payload
// column stores, so the editor does not care which was used.
//
// `value` is the current media id (or null); `onChange(id, asset)` fires with the
// new id. The parent owns the value — this component keeps only the search/upload
// UI state, so it works inside the content editor's single form state object.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { callAdmin, useToast } from "./ui";

// Keystrokes settle for this long before a search goes out. 250ms is the usual
// sweet spot: short enough to feel instant, long enough that typing a name is one
// request rather than one per letter.
const DEBOUNCE_MS = 250;

function humanKb(bytes) {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function MediaPicker({ value, asset: initialAsset = null, onChange, disabled = false, folder = null }) {
  const toast = useToast();
  // The asset currently attached, for the preview. Starts from what the server
  // rendered (if the draft already had one) and updates as the editor picks.
  const [asset, setAsset] = useState(initialAsset);
  const [mode, setMode] = useState(null); // null = collapsed, 'static' | 'upload'
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  // Guards against a slow earlier search overwriting a newer one's results.
  const seqRef = useRef(0);

  // Debounced search. Runs on open too (empty query = browse the first few).
  useEffect(() => {
    if (mode !== "static") return;
    const seq = ++seqRef.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/media/static?q=${encodeURIComponent(q)}&limit=24`);
        const data = await res.json().catch(() => ({}));
        if (seq !== seqRef.current) return; // a newer keystroke already fired
        if (!res.ok) throw new Error(data?.error || "Search failed.");
        setResults(data.results ?? []);
      } catch (e) {
        if (seq === seqRef.current) {
          setResults([]);
          toast(e.message || "Could not search the public folder.", "error");
        }
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, mode, toast]);

  const attach = useCallback(
    (a) => {
      setAsset(a);
      onChange?.(a?.id ?? null, a);
      setMode(null);
      setQ("");
      setResults([]);
    },
    [onChange]
  );

  const pickStatic = async (path) => {
    setBusy(true);
    try {
      const result = await callAdmin("media.static.pick", { input: { path } });
      attach(result.asset);
      toast(result.reused ? "Image attached (reused the existing library entry)." : "Image attached.", "success");
    } catch (e) {
      toast(e.message || "Could not attach that image.", "error");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      if (folder) body.append("folder", folder);
      const res = await fetch("/api/admin/media/upload", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Upload failed.");
      attach(data.asset);
      toast(folder ? "Saved to the database and attached." : "Uploaded to Cloudinary and attached.", "success");
    } catch (e) {
      toast(e.message || "Upload failed.", "error");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const previewUrl = asset?.deliveryUrl || asset?.url || null;
  const isStatic = asset?.storageProvider === "local";
  const isDbStored = asset?.storageProvider === "db";

  return (
    <div className="adm-mediapicker">
      {/* Current selection */}
      {value ? (
        <div className="adm-mediapicker-current">
          {asset?.kind === "pdf" ? (
            <div className="adm-mediapicker-thumb" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>📄</div>
          ) : previewUrl ? (
            // A plain <img>, not next/image: the source is whatever an editor just
            // picked (a /public path or any Cloudinary URL), and the optimizer's
            // allowlist would reject anything unexpected. This is an admin preview,
            // not a public page, so unoptimized is the right trade.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={asset?.altText || "Selected image"} className="adm-mediapicker-thumb" />
          ) : (
            <div className="adm-mediapicker-thumb adm-mediapicker-thumb-empty">?</div>
          )}
          <div className="adm-mediapicker-meta">
            <code className="adm-code">{asset?.originalPath || asset?.cloudinaryPublicId || value}</code>
            <span className="adm-muted">
              {isStatic ? "in public/ — no Cloudinary credit" : isDbStored ? "in the database" : "on Cloudinary"}
              {asset?.bytes ? ` · ${humanKb(asset.bytes)}` : ""}
            </span>
          </div>
          {!disabled && (
            <button type="button" className="adm-btn ghost sm" disabled={busy} onClick={() => attach(null)}>
              Remove
            </button>
          )}
        </div>
      ) : (
        <p className="adm-muted adm-mediapicker-none">No image. This field is optional — leave it empty and the page renders without one.</p>
      )}

      {/* Mode buttons */}
      {!disabled && (
        <div className="adm-mediapicker-tabs">
          <button type="button" className={`adm-btn ghost sm ${mode === "static" ? "active" : ""}`} disabled={busy} onClick={() => setMode(mode === "static" ? null : "static")}>
            {value ? "Change" : "Choose"} from the site
          </button>
          <button type="button" className={`adm-btn ghost sm ${mode === "upload" ? "active" : ""}`} disabled={busy} onClick={() => setMode(mode === "upload" ? null : "upload")}>
            Upload new
          </button>
        </div>
      )}

      {/* Static search */}
      {mode === "static" && (
        <div className="adm-mediapicker-panel">
          <input
            className="adm-input"
            autoFocus
            placeholder="Search images in the public folder — e.g. nitin, coding, nac"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <p className="adm-muted" style={{ margin: "6px 0 10px" }}>
            {searching ? "Searching…" : `${results.length} match${results.length === 1 ? "" : "es"}${q ? "" : " (showing the first few — type to narrow)"}`}
          </p>
          <div className="adm-mediapicker-grid">
            {results.map((r) => (
              <button type="button" key={r.path} className="adm-mediapicker-result" disabled={busy} onClick={() => pickStatic(r.path)} title={r.path}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.path} alt="" loading="lazy" />
                <span>{r.path.slice(r.path.lastIndexOf("/") + 1)}</span>
                <span className="adm-muted">{humanKb(r.bytes)}</span>
              </button>
            ))}
            {!searching && results.length === 0 && <p className="adm-empty">Nothing matched. Try fewer words, or upload the image instead.</p>}
          </div>
        </div>
      )}

      {/* Upload */}
      {mode === "upload" && (
        <div className="adm-mediapicker-panel">
          <input
            ref={fileRef}
            className="adm-input"
            type="file"
            accept={folder ? "image/*,application/pdf" : "image/*"}
            disabled={busy}
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <p className="adm-muted" style={{ marginTop: 8 }}>
            {folder ? (
              <>Images or PDFs (10MB max) — saved straight into the database. Survives any redeploy, no filesystem involved.</>
            ) : (
              <>
                Goes to Cloudinary (10MB max). Prefer “from the site” when the image is already there — Cloudinary storage is a limited budget, and
                <code className="adm-code" style={{ margin: "0 4px" }}>npm run media:export</code>
                downloads the pile later so it can be moved into the public folder.
              </>
            )}
          </p>
          {busy && <p className="adm-muted">Uploading…</p>}
        </div>
      )}
    </div>
  );
}
