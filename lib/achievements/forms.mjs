// PURE, client-safe validators/normalizers for the M4 "achievement" content type
// (DL-080) + its contribution credits (DL-081). Mirrored on the client and the
// server (DL-051): the CMS achievement handler (lib/cms/content-types.mjs) calls
// normalizeAchievementPayload() to VALIDATE + CLEAN caller input before it is stored,
// the credit service (lib/achievements/credits.mjs) reuses creditTargetKind /
// normalizeCreditRole, and a future admin editor imports the same helpers — so the
// client and server rules never drift. No DB / server-only imports here.
//
// The HYBRID ORDERED BLOCKS (markdown / markdown+image / banner / link / gallery) are
// stored RAW in achievement_payload.blocks (JSONB) and rendered SAFELY at the
// presentation layer via lib/markdown/render.mjs (escape-first, DL-077) — this module
// NEVER produces or stores HTML. Link hrefs are scheme-validated with the SAME
// isSafeHref the markdown renderer uses (no parallel allowlist).
import { CmsValidationError } from "../cms/errors.mjs";
import { isSafeHref } from "../markdown/render.mjs";

export const BLOCK_KINDS = ["markdown", "markdown_image", "banner", "link", "gallery"];
export const BLOCK_KIND_SET = new Set(BLOCK_KINDS);

const MAX_BLOCKS = 50;
const MAX_GALLERY = 30;
const MAX_BODY = 20000;

// ── small pure cleaners ──
function cleanId(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
}
function cleanText(v, max) {
  if (v === undefined || v === null) return null;
  const s = String(v);
  const t = s.length > max ? s.slice(0, max) : s;
  return t;
}

// Validate + normalize ONE block → a clean, minimal object (unknown fields dropped,
// so a caller can't smuggle extra keys into the JSONB). Throws CmsValidationError on
// a structurally invalid block. `index` is for a human-readable message.
export function normalizeBlock(block, index = 0) {
  if (!block || typeof block !== "object" || Array.isArray(block)) {
    throw new CmsValidationError(`Block ${index + 1} is not an object.`);
  }
  const kind = block.kind;
  if (!BLOCK_KIND_SET.has(kind)) {
    throw new CmsValidationError(`Block ${index + 1} has an unknown kind '${kind}'. Allowed: ${BLOCK_KINDS.join(", ")}.`);
  }
  switch (kind) {
    case "markdown": {
      const body = cleanText(block.body, MAX_BODY);
      if (!body || !body.trim()) throw new CmsValidationError(`Markdown block ${index + 1} needs a non-empty body.`);
      return { kind, body };
    }
    case "markdown_image": {
      const mediaId = cleanId(block.mediaId);
      if (!mediaId) throw new CmsValidationError(`Markdown+image block ${index + 1} needs a mediaId.`);
      const out = { kind, mediaId, imagePosition: block.imagePosition === "left" ? "left" : "right" };
      const body = cleanText(block.body, MAX_BODY);
      if (body && body.trim()) out.body = body;
      return out;
    }
    case "banner": {
      const mediaId = cleanId(block.mediaId);
      if (!mediaId) throw new CmsValidationError(`Banner block ${index + 1} needs a mediaId.`);
      const out = { kind, mediaId };
      const caption = cleanText(block.caption, 500);
      if (caption && caption.trim()) out.caption = caption;
      return out;
    }
    case "link": {
      const url = typeof block.url === "string" ? block.url.trim() : "";
      if (!url) throw new CmsValidationError(`Link block ${index + 1} needs a url.`);
      // Reuse the markdown renderer's scheme allowlist — javascript:/data: rejected.
      if (!isSafeHref(url)) {
        throw new CmsValidationError(`Link block ${index + 1} has an unsafe or unsupported url (only http(s), mailto, or relative links).`);
      }
      const out = { kind, url };
      const label = cleanText(block.label, 300);
      if (label && label.trim()) out.label = label;
      return out;
    }
    case "gallery": {
      const raw = Array.isArray(block.mediaIds) ? block.mediaIds : [];
      const mediaIds = raw.map(cleanId).filter(Boolean).slice(0, MAX_GALLERY);
      if (!mediaIds.length) throw new CmsValidationError(`Gallery block ${index + 1} needs at least one mediaId.`);
      const out = { kind, mediaIds };
      const caption = cleanText(block.caption, 500);
      if (caption && caption.trim()) out.caption = caption;
      return out;
    }
    default:
      // Unreachable (kind is validated above) — defensive.
      throw new CmsValidationError(`Unhandled block kind '${kind}'.`);
  }
}

// Validate + normalize an ORDERED block list. `undefined` → undefined (omitted: the
// handler leaves any existing blocks untouched on an edit); an explicit array (incl.
// []) → the cleaned array. Throws on too many blocks or any invalid block.
export function normalizeBlocks(blocks) {
  if (blocks === undefined) return undefined;
  if (blocks === null) return null;
  if (!Array.isArray(blocks)) throw new CmsValidationError("`blocks` must be an array of blocks.");
  if (blocks.length > MAX_BLOCKS) throw new CmsValidationError(`Too many blocks (max ${MAX_BLOCKS}).`);
  return blocks.map((b, i) => normalizeBlock(b, i));
}

// Coerce achievement_date input (a Date or a parseable date string) → a Date, or
// null. Throws CmsValidationError on a non-empty but unparseable value (so a bad
// caller string never reaches Prisma as an "Invalid Date"). PURE.
export function normalizeAchievementDate(v) {
  if (v === undefined) return undefined; // omitted → leave existing
  if (v === null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new CmsValidationError("achievementDate is not a valid date.");
  return d;
}

// Normalize a caller-supplied achievement payload for storage: validate + clean the
// blocks and the date, pass the other scalars through. Returns a NEW object (only the
// provided keys). Used by the CMS handler's coerce hook so achievements flow through
// the ordinary content service (no parallel pipeline). PURE.
export function normalizeAchievementPayload(payload = {}) {
  const out = { ...payload };
  const blocks = normalizeBlocks(payload.blocks);
  if (blocks === undefined) delete out.blocks;
  else out.blocks = blocks;
  const date = normalizeAchievementDate(payload.achievementDate);
  if (date === undefined) delete out.achievementDate;
  else out.achievementDate = date;
  if (payload.category !== undefined) out.category = cleanText(payload.category, 120);
  return out;
}

// Collect every media id referenced by a block list (the hero is resolved separately)
// so the public read layer resolves delivery URLs in ONE query. PURE.
export function blockMediaIds(blocks) {
  const ids = [];
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b) continue;
    if (b.mediaId) ids.push(b.mediaId);
    if (Array.isArray(b.mediaIds)) for (const m of b.mediaIds) if (m) ids.push(m);
  }
  return ids;
}

// ── credits (DL-081) ──

// Normalize a credit's free-text role label (e.g. "Winner", "Organizing club").
export function normalizeCreditRole(role) {
  if (role === undefined || role === null) return null;
  const s = String(role).trim();
  return s ? s.slice(0, 120) : null;
}

// A credit targets EXACTLY ONE of { a member (userId | email) } OR { a club
// (orgUnitLineageKey) }. Returns 'user' | 'club'; throws when both or neither is
// present (the DB CHECK is the final backstop, DL-081). PURE + exported so the client
// form and the server enforce the identical rule.
export function creditTargetKind(input = {}) {
  const hasUser = !!(input.userId || (typeof input.email === "string" && input.email.trim()));
  const hasClub = !!(typeof input.orgUnitLineageKey === "string" && input.orgUnitLineageKey.trim());
  if (hasUser && hasClub) throw new CmsValidationError("A credit targets a member OR a club, not both.");
  if (!hasUser && !hasClub) throw new CmsValidationError("A credit needs a member (userId/email) or a club (orgUnitLineageKey).");
  return hasUser ? "user" : "club";
}
