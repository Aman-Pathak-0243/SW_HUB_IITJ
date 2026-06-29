// Cloudinary config + URL building + the (signed) upload path for the Session-7
// Media layer. The PURE helpers here (delivery-URL building, signature, public_id
// derivation, env config) are unit-testable WITHOUT a network or credentials; the
// one network function (uploadFileToCloudinary) is the only impure part and is
// INJECTED into the migration tool so the tests can substitute a deterministic
// fake uploader (lib/media/migrate.mjs).
//
// Two V1 Cloudinary accounts already hold the migrated assets referenced in code
// (dveqd1vm1 for photos/logos, dabviijid for the infrastructure PDFs —
// DATA_MIGRATION_REPORT §3). The /public → Cloudinary migration uploads into ONE
// env-configured account (CLOUDINARY_CLOUD_NAME) so all new assets live in one
// place; the existing external URLs are left untouched (they already resolve).
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Cloudinary's canonical delivery host (also the only image host allowlisted in
// next.config.mjs — every migrated asset resolves through it).
export const CLOUDINARY_DELIVERY_HOST = "res.cloudinary.com";

// ── config (env) ─────────────────────────────────────────────────────────────

// Read the env-configured Cloudinary account. Returns null when unconfigured so
// callers (the migration tool) can surface a friendly "set CLOUDINARY_* in
// .env.local" message rather than a stack trace. cloudName ALONE is enough to
// build delivery URLs; an apiKey/apiSecret are only needed for the upload path.
export function getCloudinaryConfig(env = process.env) {
  const cloudName = env.CLOUDINARY_CLOUD_NAME || null;
  const apiKey = env.CLOUDINARY_API_KEY || null;
  const apiSecret = env.CLOUDINARY_API_SECRET || null;
  const folder = env.CLOUDINARY_UPLOAD_FOLDER || "iitj-portal";
  if (!cloudName) return null;
  return { cloudName, apiKey, apiSecret, folder };
}

// Can we actually upload (vs only build URLs)? Upload needs the signing secret.
export function canUpload(config) {
  return !!(config && config.cloudName && config.apiKey && config.apiSecret);
}

// ── pure URL building ─────────────────────────────────────────────────────────

// Build a Cloudinary delivery URL from a public_id. PURE + exported so URL
// resolution is unit-testable. resourceType is 'image' for images/PDFs delivered
// as images, 'raw' for non-rendered files (we deliver PDFs as 'image' so the
// PdfSlideshow can fetch real pages, matching the V1 infra PDFs).
export function cloudinaryUrl(publicId, { cloudName, resourceType = "image", format, transformation } = {}) {
  if (!publicId || !cloudName) return null;
  const parts = [`https://${CLOUDINARY_DELIVERY_HOST}`, cloudName, resourceType, "upload"];
  if (transformation) parts.push(transformation);
  const id = format ? `${publicId}.${format}` : publicId;
  parts.push(id);
  return parts.join("/");
}

// The Cloudinary upload API endpoint for an account + resource type.
export function uploadEndpoint(cloudName, resourceType = "image") {
  return `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;
}

// ── pure public_id derivation ─────────────────────────────────────────────────

// Derive a STABLE, deterministic Cloudinary public_id from a legacy "/public"
// path so re-running the migration always targets the same asset (idempotency).
// "/coding coordinator.jpg" → "iitj-portal/coding-coordinator". The extension is
// dropped (Cloudinary derives format), spaces/punctuation become hyphens, and a
// folder prefix groups the migrated batch. PURE + exported (tested).
export function publicIdFromPath(originalPath, { folder = "iitj-portal" } = {}) {
  const raw = String(originalPath ?? "").trim();
  if (!raw) return null;
  // strip a leading "/" and a trailing file extension
  const noLead = raw.replace(/^\/+/, "");
  const noExt = noLead.replace(/\.[a-z0-9]+$/i, "");
  const slug = noExt
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, "-")
    .replace(/\/{2,}/g, "/")
    .replace(/(^-+|-+$)/g, "")
    .replace(/-{2,}/g, "-");
  if (!slug) return null;
  return folder ? `${folder}/${slug}` : slug;
}

// Map a legacy "/public" path to the on-disk absolute path under public/.
// "/coding coordinator.jpg" → <cwd>/public/coding coordinator.jpg. PURE.
export function publicAbsPath(originalPath, { cwd = process.cwd() } = {}) {
  const raw = String(originalPath ?? "").trim();
  if (!raw) return null;
  return path.join(cwd, "public", raw.replace(/^\/+/, ""));
}

// ── pure signature ─────────────────────────────────────────────────────────────

// Build Cloudinary's upload signature: SHA-1 of the sorted "k=v" params (minus
// file/api_key/signature) joined by "&", with the api_secret appended. PURE +
// exported so the signing logic is testable against a known vector without a
// network call. (https://cloudinary.com/documentation/signatures)
export function signUploadParams(params, apiSecret) {
  const toSign = Object.keys(params)
    .filter((k) => k !== "file" && k !== "api_key" && k !== "resource_type" && params[k] !== undefined && params[k] !== null && params[k] !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return createHash("sha1").update(`${toSign}${apiSecret}`).digest("hex");
}

// ── delivery-URL resolution off a media_asset row ─────────────────────────────

// Resolve the best public delivery URL for a media_asset row. PURE (no DB):
//   • a migrated/cloudinary asset with a public_id → a built Cloudinary URL
//     (transformation-ready), preferring the stored `url` when present;
//   • otherwise the stored url (an external Cloudinary URL or a "/public" path).
// This is the single resolver the app uses so a later transformation/CDN change
// lives in one place. `transformation` (e.g. "f_auto,q_auto,w_400") is applied
// only when we build the URL from a public_id.
export function resolveDeliveryUrl(asset, { transformation } = {}) {
  if (!asset) return null;
  if (asset.cloudinaryPublicId) {
    // If a transformation is requested, (re)build from the public_id so it can be
    // injected; else trust the stored canonical url, falling back to a built one.
    if (transformation) {
      // PDFs live on Cloudinary under resource_type=image (so PdfSlideshow can
      // fetch the real pages — see the header note), but the URL MUST carry the
      // `.pdf` format or Cloudinary rasterizes page 1 instead of returning the
      // file. Images need no explicit format.
      const isPdf = asset.kind === "pdf";
      const built = cloudinaryUrl(asset.cloudinaryPublicId, {
        cloudName: cloudNameFromUrl(asset.url),
        resourceType: "image",
        format: isPdf ? "pdf" : undefined,
        transformation,
      });
      if (built) return built;
    }
    if (asset.url) return asset.url;
    return cloudinaryUrl(asset.cloudinaryPublicId, { cloudName: cloudNameFromUrl(asset.url) });
  }
  return asset.url ?? null;
}

// Extract the cloud name from a res.cloudinary.com URL (so resolveDeliveryUrl can
// rebuild a transformed URL for an already-migrated asset). PURE. Null if absent.
export function cloudNameFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/res\.cloudinary\.com\/([^/]+)\//);
  return m ? m[1] : null;
}

// Core Web Vitals (Session 10): inject Cloudinary's automatic format + quality
// (`f_auto,q_auto`) into an EXISTING res.cloudinary.com delivery URL so the CDN
// serves modern formats (AVIF/WebP) at an auto-tuned quality — shrinking image
// bytes on the public pages (org/events covers, logos, photos). PURE + idempotent:
//   • only rewrites res.cloudinary.com `/<type>/upload/<rest>` URLs (image/video);
//   • a no-op if a transformation is already present right after `/upload/`
//     (so it never double-applies or clobbers an existing transform);
//   • returns any non-Cloudinary URL (a "/public" path, a Drive link) unchanged.
// Applied in the public read layers to IMAGE assets only — NOT to PDFs/raw files
// (a delivered PDF must keep its `.pdf` URL; resolveDeliveryUrl owns that path).
export function cloudinaryAutoUrl(url, transformation = "f_auto,q_auto") {
  if (!url || typeof url !== "string") return url ?? null;
  // Match "https://res.cloudinary.com/<cloud>/<resourceType>/upload/<rest>".
  const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/[^/]+\/upload\/)(.*)$/);
  if (!m) return url; // not a Cloudinary delivery URL — leave it alone
  const [, prefix, rest] = m;
  // The first path segment after /upload/ is a transformation iff it looks like
  // one (contains an underscore-prefixed directive or a comma). If so, don't touch
  // it — the caller already chose a transform (idempotent re-application safe).
  const firstSeg = rest.split("/")[0] ?? "";
  const looksTransformed = /(^|,)[a-z]{1,3}_/.test(firstSeg);
  if (looksTransformed) return url;
  return `${prefix}${transformation}/${rest}`;
}

// ── the one impure function: a real signed upload ─────────────────────────────

// Upload a local file to the configured Cloudinary account (signed). Returns
// { publicId, url, bytes, format, width, height }. This is the ONLY function that
// touches the network/filesystem; the migration tool takes it as an injectable
// dependency so tests pass a deterministic fake instead. `now` is injectable so
// the (timestamp-based) signature is reproducible in any test of this function.
export async function uploadFileToCloudinary(absPath, { config, publicId, resourceType = "image", now } = {}) {
  if (!canUpload(config)) {
    const err = new Error("Cloudinary upload is not configured (set CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET).");
    err.code = "CLOUDINARY_UNCONFIGURED";
    err.status = 500;
    throw err;
  }
  const bytes = await readFile(absPath);
  const timestamp = Math.floor((now ?? Date.now()) / 1000);
  const signParams = { timestamp, public_id: publicId, overwrite: "true" };
  const signature = signUploadParams(signParams, config.apiSecret);

  const form = new FormData();
  form.append("file", new Blob([bytes]), path.basename(absPath));
  form.append("api_key", config.apiKey);
  form.append("timestamp", String(timestamp));
  form.append("public_id", publicId);
  form.append("overwrite", "true");
  form.append("signature", signature);

  const res = await fetch(uploadEndpoint(config.cloudName, resourceType), { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Cloudinary upload failed (${res.status}): ${text.slice(0, 300)}`);
    err.code = "CLOUDINARY_UPLOAD_FAILED";
    err.status = 502;
    throw err;
  }
  const json = await res.json();
  return {
    publicId: json.public_id,
    url: json.secure_url ?? json.url,
    bytes: json.bytes ?? bytes.length,
    format: json.format ?? null,
    width: json.width ?? null,
    height: json.height ?? null,
  };
}
