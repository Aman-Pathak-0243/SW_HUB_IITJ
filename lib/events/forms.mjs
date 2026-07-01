// PURE, client-safe validators / normalizers for the M5 Centralized Event Playground
// (DL-084..088). Mirrored on the client and the server (DL-051): the CMS event handler
// (lib/cms/content-types.mjs) calls normalizeEventPayload() to validate + clean an
// event's hybrid content BEFORE storage; the playground services (lib/events/*.mjs)
// reuse the target/role/status/points/budget normalizers; and the client forms import
// the same helpers — so the rules never drift. No DB / server-only imports here.
//
// The HYBRID ORDERED BLOCKS on an event reuse the M4 block model + normalizer
// (lib/achievements/forms.mjs, DL-080) verbatim — one block schema across modules.
// Markdown (problem statement / eligibility / round descriptions / closure reports) is
// stored RAW and rendered escape-first via lib/markdown/render.mjs (DL-077).
import { CmsValidationError } from "../cms/errors.mjs";
import { normalizeBlocks } from "../achievements/forms.mjs";

const MAX_MARKDOWN = 20000;
const MAX_LABEL = 200;

// ── small pure cleaners ──
function cleanText(v, max) {
  if (v === undefined || v === null) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}
function trimOrNull(v, max = MAX_LABEL) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

// ── event CONTENT payload (the coercePayload hook, DL-084) ──
// Validate + clean an event payload for storage. Reuses the M4 block normalizer for
// `blocks`; trims the new markdown/text fields; passes the existing scalars (body /
// eventDate / audience / publish window / coverMediaId) through untouched (they are
// validated by the DB CHECKs + the event route). Returns a NEW object with only the
// provided keys — runs on create AND edit (an omitted key leaves the stored value).
export function normalizeEventPayload(payload = {}) {
  const out = { ...payload };
  const blocks = normalizeBlocks(payload.blocks); // undefined → omit; [] → clear; throws on bad block
  if (blocks === undefined) delete out.blocks;
  else out.blocks = blocks;
  if (payload.category !== undefined) out.category = trimOrNull(payload.category, 120);
  if (payload.problemStatement !== undefined) out.problemStatement = cleanText(payload.problemStatement, MAX_MARKDOWN);
  if (payload.eligibility !== undefined) out.eligibility = cleanText(payload.eligibility, MAX_MARKDOWN);
  return out;
}

// ── organizer / collaborator tagging (DL-085) ──
export const EVENT_ORGANIZER_KINDS = ["organizer", "collaborator"];
export const EVENT_ORGANIZER_KIND_SET = new Set(EVENT_ORGANIZER_KINDS);

export function normalizeOrganizerKind(kind) {
  if (kind === undefined || kind === null || kind === "") return "organizer";
  if (!EVENT_ORGANIZER_KIND_SET.has(kind)) {
    throw new CmsValidationError(`Organizer kind must be one of: ${EVENT_ORGANIZER_KINDS.join(", ")}.`);
  }
  return kind;
}

// A tag targets EXACTLY ONE of { a club (orgUnitLineageKey) } | { a custom entity
// (entityId) } | { a member (userId | email) }. Returns 'club' | 'entity' | 'user';
// throws when more than one or none is present (the DB CHECK is the final backstop).
export function organizerTargetKind(input = {}) {
  const hasClub = !!(typeof input.orgUnitLineageKey === "string" && input.orgUnitLineageKey.trim());
  const hasEntity = !!(typeof input.entityId === "string" && input.entityId.trim());
  const hasUser = !!(input.userId || (typeof input.email === "string" && input.email.trim()));
  const n = (hasClub ? 1 : 0) + (hasEntity ? 1 : 0) + (hasUser ? 1 : 0);
  if (n > 1) throw new CmsValidationError("An organizer tag targets exactly one of a club, a custom entity, or a member.");
  if (n === 0) throw new CmsValidationError("An organizer tag needs a club (orgUnitLineageKey), an entity (entityId), or a member (userId/email).");
  return hasClub ? "club" : hasEntity ? "entity" : "user";
}

export function normalizeOrganizerRole(role) {
  return trimOrNull(role, 120);
}

// ── custom entities (DL-085) ──
export const EVENT_ENTITY_STATUSES = ["active", "archived"];
export const EVENT_ENTITY_STATUS_SET = new Set(EVENT_ENTITY_STATUSES);

export function normalizeEntityInput(input = {}) {
  const name = trimOrNull(input.name, MAX_LABEL);
  if (!name) throw new CmsValidationError("A custom entity needs a name.");
  return {
    name,
    kind: trimOrNull(input.kind, 60),
    description: cleanText(input.description, 2000),
  };
}

// ── rounds (DL-087) ──
export function validateRoundInput(input = {}, { isCreate = true } = {}) {
  const out = {};
  if (isCreate || input.name !== undefined) {
    const name = trimOrNull(input.name, MAX_LABEL);
    if (isCreate && !name) throw new CmsValidationError("A round needs a name.");
    if (name !== null) out.name = name;
  }
  if (input.description !== undefined) out.description = cleanText(input.description, MAX_MARKDOWN);
  if (input.roundNo !== undefined) {
    const n = Number(input.roundNo);
    if (!Number.isInteger(n) || n < 1) throw new CmsValidationError("roundNo must be a positive integer.");
    out.roundNo = n;
  }
  if (input.startsAt !== undefined) out.startsAt = normalizeDate(input.startsAt, "startsAt");
  if (input.endsAt !== undefined) out.endsAt = normalizeDate(input.endsAt, "endsAt");
  if (input.sortOrder !== undefined && Number.isFinite(Number(input.sortOrder))) out.sortOrder = Math.trunc(Number(input.sortOrder));
  return out;
}

function normalizeDate(v, field) {
  if (v === null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new CmsValidationError(`${field} is not a valid date.`);
  return d;
}

// ── settings / capacity / registration window (DL-084/087) ──
export function normalizeCapacity(v) {
  if (v === undefined) return undefined; // omitted → leave existing
  if (v === null || v === "") return null; // explicit unlimited
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new CmsValidationError("capacity must be a non-negative integer (or empty for unlimited).");
  return n;
}

// PURE: is registration open right now? A manual `registrationClosed` master switch
// closes it; otherwise it is open within the [opensAt, closesAt] window (either bound
// omitted = unbounded on that side). Used by the service AND the client button state.
export function isRegistrationOpen(settings = {}, now = new Date()) {
  if (!settings || settings.registrationClosed === true) return false;
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const opens = settings.registrationOpensAt != null ? new Date(settings.registrationOpensAt).getTime() : null;
  const closes = settings.registrationClosesAt != null ? new Date(settings.registrationClosesAt).getTime() : null;
  if (opens != null && t < opens) return false;
  if (closes != null && t > closes) return false;
  return true;
}

// PURE: the status a NEW confirmed-intent registration should get, given the current
// confirmed count + capacity (null = unlimited). At/over capacity → 'waitlisted'. The
// DB cardinality trigger is the concurrency backstop (DL-009/021).
export function registrationOutcome(confirmedCount, capacity) {
  if (capacity == null) return "confirmed";
  return Number(confirmedCount) < Number(capacity) ? "confirmed" : "waitlisted";
}

// ── registration status (DL-087) ──
export const REGISTRATION_STATUSES = ["confirmed", "waitlisted", "cancelled"];
export const REGISTRATION_STATUS_SET = new Set(REGISTRATION_STATUSES);
export function normalizeRegistrationStatus(status) {
  if (!REGISTRATION_STATUS_SET.has(status)) {
    throw new CmsValidationError(`Registration status must be one of: ${REGISTRATION_STATUSES.join(", ")}.`);
  }
  return status;
}

// ── scores (DL-087) ──
export function normalizePoints(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new CmsValidationError("points must be a finite number.");
  return n;
}

// ── closure report (DL-088) ──
export const CLOSURE_STATUSES = ["submitted", "reviewed"];
export function normalizeBudget(v) {
  if (v === undefined) return undefined; // omitted → leave existing
  if (v === null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new CmsValidationError("Budget must be a non-negative number.");
  return n;
}
export function normalizeReportBody(v) {
  const s = cleanText(v, MAX_MARKDOWN);
  if (!s || !s.trim()) throw new CmsValidationError("A closure report needs a role/contribution write-up.");
  return s;
}

// ── ranking (DL-087) — PURE, unit-testable without a DB ──
// Given rows [{ userId, points, ... }], sort by points DESC and assign STANDARD
// COMPETITION RANK (ties share a rank; the next rank skips: 1,2,2,4). Stable tiebreak
// by userId so the order is deterministic. Returns new rows with a `rank` field.
export function rankEntries(rows = [], { pointsKey = "points" } = {}) {
  const sorted = [...rows].sort((a, b) => {
    const d = Number(b?.[pointsKey] ?? 0) - Number(a?.[pointsKey] ?? 0);
    return d !== 0 ? d : String(a?.userId ?? "").localeCompare(String(b?.userId ?? ""));
  });
  let lastPoints = null;
  let lastRank = 0;
  return sorted.map((r, i) => {
    const pts = Number(r?.[pointsKey] ?? 0);
    const rank = lastPoints !== null && pts === lastPoints ? lastRank : i + 1;
    lastPoints = pts;
    lastRank = rank;
    return { ...r, rank };
  });
}
