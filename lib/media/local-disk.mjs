// Local-disk uploads (outside git) — the storage path for Events / Announcements /
// Wall of Fame images specifically, so they survive a `git`-based redeploy or Docker
// rebuild WITHOUT needing Cloudinary. Unlike public/ (rebuilt from git on every
// deploy — see public/images/README.md), this directory lives outside the repo
// entirely, e.g. /home/ubuntu/sw_uploads on the production host, and must be backed
// up / preserved by the ops side (a Docker bind mount pointed at it, or just "don't
// delete this folder on the VM").
//
// Served back to the browser by app/api/uploads/[...path]/route.js — Next's static
// file server only knows about public/, so anything outside it needs its own route.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// The only three folders this accepts — one per content type that asked for local
// (not Cloudinary) storage. Keeping this an allowlist (not a free-text folder from
// the client) closes path-traversal at the source: `folder` can never become `..`.
export const UPLOAD_FOLDERS = ["events", "announcements", "wall-of-fame"];

export const LOCAL_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const LOCAL_UPLOAD_ALLOWED_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif"];

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

// Resolved once per process. Falls back to a gitignored folder under the repo for
// local dev; production sets UPLOADS_DIR (e.g. /home/ubuntu/sw_uploads) so the data
// lives OUTSIDE the directory `git`/the deploy rebuilds.
export function getUploadsRoot() {
  return process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), ".local-uploads");
}

// A filesystem- and URL-safe basename: keep only the stem the editor's filename
// suggests (for a readable file on disk), then force a random+time suffix so two
// uploads named "poster.jpg" never collide or overwrite each other.
function safeName(filename, mimeType) {
  const stem = String(filename ?? "upload")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "image";
  const ext = EXT_BY_MIME[String(mimeType ?? "").toLowerCase()] ?? "jpg";
  const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  return `${stem}-${suffix}.${ext}`;
}

// Save bytes to <UPLOADS_DIR>/<folder>/<generated-name>. Returns the URL path the
// app should store/serve (always "/uploads/<folder>/<name>" — the custom route
// below resolves that prefix back to UPLOADS_DIR, independent of where
// UPLOADS_DIR itself physically lives).
export async function saveLocalUpload({ bytes, filename, mimeType, folder }) {
  if (!bytes?.length) throw new Error("No file was received.");
  if (bytes.length > LOCAL_UPLOAD_MAX_BYTES) {
    throw new Error(`That file is ${Math.round(bytes.length / 1024 / 1024)}MB — the limit is ${LOCAL_UPLOAD_MAX_BYTES / 1024 / 1024}MB. Compress it and try again.`);
  }
  if (mimeType && !LOCAL_UPLOAD_ALLOWED_MIME.includes(String(mimeType).toLowerCase())) {
    throw new Error(`'${mimeType}' is not an image type this accepts (${LOCAL_UPLOAD_ALLOWED_MIME.join(", ")}).`);
  }
  if (!UPLOAD_FOLDERS.includes(folder)) {
    throw new Error(`'${folder}' is not a valid upload folder (expected one of: ${UPLOAD_FOLDERS.join(", ")}).`);
  }

  const root = getUploadsRoot();
  const dir = path.join(root, folder);
  await mkdir(dir, { recursive: true });
  const name = safeName(filename, mimeType);
  await writeFile(path.join(dir, name), bytes);

  return { urlPath: `/uploads/${folder}/${name}`, bytes: bytes.length };
}
