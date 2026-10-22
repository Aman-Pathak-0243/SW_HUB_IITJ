// The STATIC image index (Session 15) — "which images are already shipped in
// public/?", so the admin image picker can offer them instead of forcing every
// illustration through Cloudinary.
//
// WHY it matters for cost. Cloudinary's free tier is a fixed credit budget; an
// image that is going to live on the site permanently is cheaper and faster as a
// file in public/ (served by nginx, cached by next/image) than as a Cloudinary
// asset. So the picker has two modes:
//   • STATIC  — point at a file already in public/. No upload, no Cloudinary
//     credit, no network. Registers a `local` media_asset whose originalPath is
//     the "/public" path, exactly like the V1 importers' inventory rows.
//   • UPLOAD  — a genuinely new image goes to Cloudinary (the only writable store
//     at runtime; the app server's public/ is rebuilt from git on every deploy, so
//     a file written there at runtime would not survive).
// scripts/export-cloudinary.mjs then closes the loop: download the Cloudinary pile
// with its metadata, drop the files into public/, and re-point the assets at the
// static paths to free the credits again.
//
// The walk is CACHED (public/ only changes on deploy) and the scoring/filtering
// helpers are PURE so they unit-test without touching a filesystem.
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

// Extensions the picker offers. Matches the media_kind enum's image-ish kinds
// (lib/media/service.mjs#MEDIA_KINDS minus pdf) — a PDF is picked through the
// resources module, not the image picker.
export const STATIC_IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".avif"];

// Directories under public/ the walk skips. Next's build output and VCS noise
// would otherwise swamp the index.
const SKIP_DIRS = new Set([".git", "node_modules", "_next", ".next"]);

// ── pure helpers ──────────────────────────────────────────────────────────────

// Is this filename one the picker should offer?
export function isStaticImage(filename) {
  const lower = String(filename).toLowerCase();
  return STATIC_IMAGE_EXTS.some((e) => lower.endsWith(e));
}

// Normalize an on-disk path under public/ into the WEB path the app references:
//   "<cwd>/public/images-2026-27-v1/a.jpg" → "/images-2026-27-v1/a.jpg"
// Always forward slashes, so a Windows dev box and the Linux VM agree (the stored
// originalPath must match the string that appears in lib/org/data/*).
export function toWebPath(absPath, publicRoot) {
  const rel = path.relative(publicRoot, absPath).split(path.sep).join("/");
  return `/${rel}`;
}

// Score a candidate path against a query. Higher is better; 0 means "no match".
// PURE — the ranking is the part worth testing, not the directory walk.
//
// The ordering a human expects when they type "nitin": an exact basename hit
// first, then a basename prefix, then a basename substring, then a hit anywhere
// in the path. Multi-word queries ("prasant singh", "nac priyanka") must match
// regardless of separator, because public/ mixes spaces, hyphens and underscores
// ("PIC coding.JPG" vs "images-2026-27-v1/priyanka-nac.jpeg").
export function scoreStaticPath(webPath, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return 0;
  const lower = String(webPath).toLowerCase();
  const base = lower.slice(lower.lastIndexOf("/") + 1);
  const baseNoExt = base.replace(/\.[a-z0-9]+$/, "");
  // Treat space / hyphen / underscore / dot as the same separator on both sides.
  const flatten = (s) => s.replace(/[\s\-_.]+/g, " ").trim();
  const fBase = flatten(baseNoExt);
  const fPath = flatten(lower);
  const terms = flatten(q).split(" ").filter(Boolean);
  if (!terms.length) return 0;
  // Every term must appear somewhere in the path, else it is not a match at all.
  if (!terms.every((t) => fPath.includes(t))) return 0;

  const joined = terms.join(" ");
  if (fBase === joined) return 100;
  if (fBase.startsWith(joined)) return 80;
  if (fBase.includes(joined)) return 60;
  if (terms.every((t) => fBase.includes(t))) return 40;
  return 20; // matched only via the directory part
}

// Rank + trim a list of indexed entries for a query. PURE.
// With an empty query it returns the first `limit` entries (the picker's initial
// "browse" state) rather than nothing.
export function searchIndex(entries, query, { limit = 20 } = {}) {
  const q = String(query ?? "").trim();
  if (!q) return entries.slice(0, limit);
  return entries
    .map((e) => ({ e, score: scoreStaticPath(e.path, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.e.path.localeCompare(b.e.path))
    .slice(0, limit)
    .map((r) => r.e);
}

// ── the impure part: the cached walk ──────────────────────────────────────────

let CACHE = { root: null, at: 0, entries: [] };
const TTL_MS = 60_000;

async function walk(dir, publicRoot, out) {
  let dirents;
  try {
    dirents = await readdir(dir, { withFileTypes: true });
  } catch {
    return out; // unreadable directory → skip rather than fail the picker
  }
  for (const d of dirents) {
    if (d.isDirectory()) {
      if (SKIP_DIRS.has(d.name)) continue;
      await walk(path.join(dir, d.name), publicRoot, out);
      continue;
    }
    if (!d.isFile() || !isStaticImage(d.name)) continue;
    const abs = path.join(dir, d.name);
    let bytes = null;
    try {
      bytes = (await stat(abs)).size;
    } catch {
      /* a file that vanished mid-walk is simply omitted */
    }
    out.push({ path: toWebPath(abs, publicRoot), bytes });
  }
  return out;
}

// Index every image under public/. Cached for 60s (and keyed on the root, so a
// test passing a fixture directory never reads the real cache).
export async function listStaticImages({ cwd = process.cwd(), force = false } = {}) {
  const publicRoot = path.join(cwd, "public");
  const fresh = CACHE.root === publicRoot && Date.now() - CACHE.at < TTL_MS;
  if (fresh && !force) return CACHE.entries;
  const entries = (await walk(publicRoot, publicRoot, [])).sort((a, b) => a.path.localeCompare(b.path));
  CACHE = { root: publicRoot, at: Date.now(), entries };
  return entries;
}

// Drop the cache (used by the tests and after the organize script moves files).
export function clearStaticIndexCache() {
  CACHE = { root: null, at: 0, entries: [] };
}

// The picker's one entry point: search public/ for images matching `q`.
export async function searchStaticImages(q, { limit = 20, cwd = process.cwd() } = {}) {
  const entries = await listStaticImages({ cwd });
  return searchIndex(entries, q, { limit });
}

// Does this web path actually exist under public/? The pick action must verify it
// before registering a media_asset — the path arrives from the browser, so it is
// untrusted input and a traversal attempt ("/../../etc/passwd") must not resolve.
export async function resolveStaticImage(webPath, { cwd = process.cwd() } = {}) {
  const raw = String(webPath ?? "").trim();
  if (!raw.startsWith("/")) return null;
  if (!isStaticImage(raw)) return null;
  const publicRoot = path.join(cwd, "public");
  // path.resolve collapses any ".." BEFORE the containment check.
  const abs = path.resolve(publicRoot, `.${raw}`);
  const rel = path.relative(publicRoot, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null; // escaped public/
  try {
    const s = await stat(abs);
    if (!s.isFile()) return null;
    return { path: toWebPath(abs, publicRoot), bytes: s.size, absPath: abs };
  } catch {
    return null;
  }
}
