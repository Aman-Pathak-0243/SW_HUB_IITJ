// PURE normalization helpers for the organization model + the V1 import
// (Session 5). No DB, no side effects — every function here is unit-testable in
// isolation (tests/org.test.mjs) and reused by the dataset modules, the importer,
// and the services. Keeping these pure is what lets the static test suite cover
// the migration's trickiest logic (slug/time/capacity parsing, person identity,
// dedup keys) without a live database.

// ── slugs ───────────────────────────────────────────────────────────────────

// URL-safe slug from a display name: lowercase, ASCII-ish, hyphen-separated.
// Deterministic so the importer can use (year, slug) as an idempotency key.
export function slugify(name) {
  return String(name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

// ── people ───────────────────────────────────────────────────────────────────

// Collapse internal whitespace + trim. The V1 data has stray leading/trailing
// spaces in many names ("Shivam Yadav ", " Sneha Hansrajani ") — normalizing
// here is what makes person dedup-by-name reliable and order-independent.
export function cleanName(name) {
  return String(name ?? "").replace(/\s+/g, " ").trim();
}

// A stable, case-insensitive identity key for a person (dedup by cleaned name).
// V1 "emails" are shared role mailboxes (warden.egret@ used by two different
// wardens; hsec.boys@ by one secretary across four hostels), so they CANNOT be
// the identity key — name is (DL-034).
export function personKey(fullName) {
  return cleanName(fullName).toLowerCase();
}

// Infer person_type from an honorific, falling back to the position's holder_kind
// (a soft hint — no DB trigger enforces it). "Dr."/"Prof." → faculty;
// "Mr."/"Ms."/"Mrs."/"Shri"/"Smt" → staff; otherwise the fallback (default
// 'student', the typical club coordinator / council secretary).
export function inferPersonType(fullName, fallback = "student") {
  const n = cleanName(fullName);
  if (/^(dr|prof|professor)\.?\s/i.test(n) || /^(dr|prof)\.?$/i.test(n)) return "faculty";
  if (/^(mr|ms|mrs|shri|smt|smt\.|mr\.|ms\.|mrs\.)\.?\s/i.test(n)) return "staff";
  return fallback;
}

// ── media (lightweight inventory rows; full Cloudinary migration is Session 7) ─

// Marker URL recorded for a V1 base64 (data:) image instead of the blob itself.
// media_asset.url is NOT NULL, so we store this placeholder; the real bytes live
// in the Session-1 Mongo backup and a curated asset is uploaded in Session 7.
export const BASE64_PLACEHOLDER_URL = "(base64 image pending Cloudinary migration — see Session-1 Mongo backup)";

// Classify a V1 image reference into a media_asset shape. Absolute http(s) URLs
// (mostly already on Cloudinary) → storage_provider 'external'; bare "/public"
// paths → 'local' with original_path preserved for the Session-7 migration tool;
// base64 `data:` URLs (V1 /admin uploads — KNOWN_ISSUES #5) → a lightweight
// 'local' PLACEHOLDER flagged `isBase64` (the multi-MB blob is deliberately NOT
// stored in the row — that would just move the Mongo bloat into Postgres).
// Returns null for empty refs. `kind` is inferred from the extension / data MIME.
export function classifyMedia(ref) {
  const url = String(ref ?? "").trim();
  if (!url) return null;
  // base64 data: URL — store a placeholder, never the blob (KNOWN_ISSUES #5).
  if (/^data:/i.test(url)) {
    const mime = url.slice(5).split(/[;,]/, 1)[0].toLowerCase();
    const kind = mime.includes("pdf") ? "pdf" : mime.includes("svg") ? "svg" : mime.includes("gif") ? "gif" : "image";
    return { storageProvider: "local", url: BASE64_PLACEHOLDER_URL, originalPath: null, kind, isBase64: true };
  }
  const lower = url.toLowerCase();
  const kind = lower.endsWith(".pdf")
    ? "pdf"
    : lower.endsWith(".svg")
      ? "svg"
      : lower.endsWith(".gif")
        ? "gif"
        : "image";
  if (/^https?:\/\//i.test(url)) {
    return { storageProvider: "external", url, originalPath: null, kind };
  }
  // A "/public" asset shipped with the V1 app — keep the path for Session 7.
  const path = url.startsWith("/") ? url : `/${url}`;
  return { storageProvider: "local", url: path, originalPath: path, kind };
}

// Dedup key for a media asset (so the importer reuses one row per image).
export function mediaKey(classified) {
  if (!classified) return null;
  return classified.originalPath ?? classified.url;
}

// ── mess meal timings ─────────────────────────────────────────────────────────

const MEAL_LABEL_TO_TYPE = {
  breakfast: "breakfast",
  lunch: "lunch",
  snacks: "snacks",
  "evening snacks": "snacks",
  snack: "snacks",
  dinner: "dinner",
};

// Map a V1 meal label ("Evening Snacks") to the meal_type enum, or null.
export function mealType(label) {
  return MEAL_LABEL_TO_TYPE[cleanName(label).toLowerCase()] ?? null;
}

// Parse a 12-hour clock string ("7:20 AM", "5:30 PM", "12:20 PM") into a
// canonical 24-hour "HH:MM:SS" string suitable for a Postgres `time` column.
// Returns null when unparseable. 12 AM → 00, 12 PM → 12.
export function parseClock(s) {
  const m = String(s ?? "")
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const min = Number(m[2] ?? "0");
  const mer = m[3].toLowerCase();
  if (hour < 1 || hour > 12 || min > 59) return null;
  if (mer === "am") hour = hour === 12 ? 0 : hour;
  else hour = hour === 12 ? 12 : hour + 12;
  return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

// Parse a V1 timing range ("7:20 AM – 9:20 AM", en-dash or hyphen) into
// { startTime, endTime, wrapsMidnight } with HH:MM:SS strings, or null. The
// wraps_midnight flag is set when the end is not strictly after the start, so a
// late-night window does not violate the mess_meal_time_order_chk CHECK.
export function parseTimingRange(range) {
  const parts = String(range ?? "")
    .split(/\s*[–—-]\s*/) // en-dash, em-dash, or hyphen
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length !== 2) return null;
  const startTime = parseClock(parts[0]);
  const endTime = parseClock(parts[1]);
  if (!startTime || !endTime) return null;
  return { startTime, endTime, wrapsMidnight: endTime <= startTime };
}

// Convert a canonical "HH:MM:SS" string into the Date a Prisma `@db.Time` column
// expects (Prisma reads/writes time-of-day as a 1970-01-01 UTC Date). Null on bad
// input. Kept separate from parsing so buildMealTimings stays string-comparable in
// tests; the importer applies this just before writing the payload.
export function toTimeDate(hhmmss) {
  const m = String(hhmmss ?? "").match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return new Date(`1970-01-01T${m[1]}:${m[2]}:${m[3] ?? "00"}.000Z`);
}

// Format a Prisma `@db.Time` value (Date or "HH:MM[:SS]" string) as "HH:MM" in
// UTC for display. Used by the public org renderer.
export function formatTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 5);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

// Build the normalized mealTimings list (for club/mess profile payloads) from V1
// { label, time } rows. Drops rows that fail to parse (with a stable sort_order).
export function buildMealTimings(rows) {
  const out = [];
  let order = 0;
  for (const r of rows ?? []) {
    const meal = mealType(r.label);
    const parsed = parseTimingRange(r.time);
    if (!meal || !parsed) continue;
    out.push({ meal, ...parsed, sortOrder: order++ });
  }
  return out;
}

// ── misc ──────────────────────────────────────────────────────────────────────

// Pull the leading integer out of a free-text capacity ("360 students" → 360),
// or null. Negative/garbage → null (the mess_capacity_chk CHECK forbids < 0).
export function parseCapacity(s) {
  const m = String(s ?? "").match(/-?\d+/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// A V1 club "coordinator" row's role text → the seeded position key. The V1 data
// uses an optional `role` of "Co-Coordinator" (everything else is a coordinator).
export function coordinatorPositionKey(role) {
  return /co-?coordinator/i.test(String(role ?? "")) ? "co_coordinator" : "coordinator";
}

// Idempotency key for an appointment within a (year-resolved) unit: a person
// holding a position in a unit. Matches the importer's dedup + the appointment
// service's "already appointed" check (and mirrors the transition wizard's key).
export function appointmentKey(orgUnitId, positionId, personId) {
  return `${orgUnitId}:${positionId}:${personId}`;
}
