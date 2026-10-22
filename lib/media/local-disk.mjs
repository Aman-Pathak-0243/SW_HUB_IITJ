// Local-disk uploads (outside git) — the storage path for Events / Announcements /
// Wall of Fame files specifically, so they survive a git-based redeploy WITHOUT
// needing Cloudinary.
//
// UPLOADS_DIR (e.g. /home/ubuntu/sw_uploads) is the SOURCE OF TRUTH — it lives
// outside the repo, so nothing here ever touches it. Every save also copies the
// same bytes into public/uploads/<folder>/ (gitignored, NOT committed) so Next
// serves it as a normal static file — no custom route, no image-optimizer
// workaround needed. A manifest.json in UPLOADS_DIR records every upload, so if
// public/uploads/ is ever missing after a fresh deploy (a clean checkout, a wiped
// working tree), `npm run uploads:sync` (or the admin "Sync" button) replays it
// from UPLOADS_DIR without needing the database.
import { mkdir, writeFile, readFile, copyFile, stat } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

// The only three folders this accepts — one per content type that asked for local
// (not Cloudinary) storage. Keeping this an allowlist (not a free-text folder from
// the client) closes path-traversal at the source: `folder` can never become `..`.
export const UPLOAD_FOLDERS = ["events", "announcements", "wall-of-fame"];

export const LOCAL_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const LOCAL_UPLOAD_ALLOWED_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "application/pdf"];

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "application/pdf": "pdf",
};

// Resolved once per process. Falls back to a gitignored folder under the repo for
// local dev; production sets UPLOADS_DIR (e.g. /home/ubuntu/sw_uploads) so the data
// lives OUTSIDE the directory `git`/the deploy rebuilds.
export function getUploadsRoot() {
  return process.env.UPLOADS_DIR?.trim() || path.join(process.cwd(), ".local-uploads");
}

// Where synced copies are served from — a plain subfolder of public/, like any
// other static asset. Gitignored: this is a runtime mirror of UPLOADS_DIR, never
// committed.
function publicUploadsRoot({ cwd = process.cwd() } = {}) {
  return path.join(cwd, "public", "uploads");
}

function manifestPath(root) {
  return path.join(root, "manifest.json");
}

async function readManifest(root) {
  try {
    return JSON.parse(await readFile(manifestPath(root), "utf8"));
  } catch {
    return [];
  }
}

async function appendManifestEntry(root, entry) {
  const list = await readManifest(root);
  list.push(entry);
  await writeFile(manifestPath(root), JSON.stringify(list, null, 2));
}

// A filesystem- and URL-safe basename: keep only the stem the editor's filename
// suggests (for a readable file on disk), then force a random+time suffix so two
// uploads named "poster.jpg" never collide or overwrite each other.
function safeName(filename, mimeType) {
  const stem = String(filename ?? "upload")
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "file";
  const ext = EXT_BY_MIME[String(mimeType ?? "").toLowerCase()] ?? "jpg";
  const suffix = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  return `${stem}-${suffix}.${ext}`;
}

// Save bytes to <UPLOADS_DIR>/<folder>/<generated-name>, mirror the same file into
// public/uploads/<folder>/ for serving, and record it in UPLOADS_DIR/manifest.json.
// Returns the URL path the app should store/serve: "/uploads/<folder>/<name>".
export async function saveLocalUpload({ bytes, filename, mimeType, folder }) {
  if (!bytes?.length) throw new Error("No file was received.");
  if (bytes.length > LOCAL_UPLOAD_MAX_BYTES) {
    throw new Error(`That file is ${Math.round(bytes.length / 1024 / 1024)}MB — the limit is ${LOCAL_UPLOAD_MAX_BYTES / 1024 / 1024}MB. Compress it and try again.`);
  }
  if (mimeType && !LOCAL_UPLOAD_ALLOWED_MIME.includes(String(mimeType).toLowerCase())) {
    throw new Error(`'${mimeType}' is not a type this accepts (${LOCAL_UPLOAD_ALLOWED_MIME.join(", ")}).`);
  }
  if (!UPLOAD_FOLDERS.includes(folder)) {
    throw new Error(`'${folder}' is not a valid upload folder (expected one of: ${UPLOAD_FOLDERS.join(", ")}).`);
  }

  const root = getUploadsRoot();
  const dir = path.join(root, folder);
  await mkdir(dir, { recursive: true });
  const name = safeName(filename, mimeType);
  await writeFile(path.join(dir, name), bytes);

  const publicDir = path.join(publicUploadsRoot(), folder);
  await mkdir(publicDir, { recursive: true });
  await writeFile(path.join(publicDir, name), bytes);

  await appendManifestEntry(root, { folder, name, bytes: bytes.length, uploadedAt: new Date().toISOString() }).catch(() => {
    // The manifest is a recovery aid, not the source of truth for THIS upload
    // (the file is already saved in both places) — never fail the upload over it.
  });

  return { urlPath: `/uploads/${folder}/${name}`, bytes: bytes.length };
}

// Replay UPLOADS_DIR/manifest.json into public/uploads/ — copies back whatever is
// missing there (a fresh checkout, a wiped working tree). Idempotent: an entry
// already present on disk (same size) is left alone. Used by `npm run uploads:sync`
// and the admin "Sync" button.
export async function syncUploadsToPublic({ cwd = process.cwd() } = {}) {
  const root = getUploadsRoot();
  const manifest = await readManifest(root);
  let synced = 0;
  let skipped = 0;
  let failed = 0;
  for (const entry of manifest) {
    if (!entry?.folder || !entry?.name || !UPLOAD_FOLDERS.includes(entry.folder)) continue;
    const src = path.join(root, entry.folder, entry.name);
    const destDir = path.join(publicUploadsRoot({ cwd }), entry.folder);
    const dest = path.join(destDir, entry.name);
    try {
      const existing = await stat(dest).catch(() => null);
      if (existing && (entry.bytes == null || existing.size === entry.bytes)) {
        skipped += 1;
        continue;
      }
      await mkdir(destDir, { recursive: true });
      await copyFile(src, dest);
      synced += 1;
    } catch {
      failed += 1; // source file missing from UPLOADS_DIR — nothing to recover it from
    }
  }
  return { total: manifest.length, synced, skipped, failed };
}
