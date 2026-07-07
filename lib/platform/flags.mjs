// Feature flags / PLUGINS — the developer-controlled control plane for the
// Session 11+ member platform (DL-058). The whole member platform is gated behind
// ONE flag, `member_platform`: when a DEVELOPER turns it on, the member-platform
// features activate (email+password-only auth, member pages, account/reset request
// flows, forced first-login password change); when off, the portal behaves exactly
// as Sessions 1–10. Sub-modules (M1…M8) reuse the same master flag — no parallel
// pipeline.
//
// Design:
//   • TOGGLING is DEVELOPER-ONLY (app_user.is_developer) + audited — a grants_all
//     super_admin holds every permission but is NOT a developer, so it cannot flip
//     the platform on/off (parity with the DL-049 is_developer guard).
//   • READING the flag for GATING (`isFeatureEnabled`) is ungated, fail-CLOSED
//     (false on a missing row or any DB error), and cached briefly so hot paths
//     (every member-platform page/route) don't hammer Neon. Fail-closed means a DB
//     hiccup degrades to the safe legacy (plugin-off) behavior, never accidental
//     activation.
//   • The admin LISTING (`listFeatureFlags`) is gated on `dev.console`.
import prisma, { prismaBase } from "../prisma.mjs";
import { assertActorPermission } from "../year/context.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsError, CmsNotFoundError } from "../cms/errors.mjs";

const FLAG_ENTITY = "feature_flag";

// The master plugin gating the entire member platform.
export const MEMBER_PLATFORM_FLAG = "member_platform";

// Seed catalog (source of truth). Re-seeding upserts name/description/category but
// NEVER overwrites `enabled` (preserve the operator's chosen state — see seed.mjs).
export const PLUGIN_DEFS = [
  {
    key: MEMBER_PLATFORM_FLAG,
    name: "Member Platform (Session 11+)",
    description:
      "Email+password-only accounts, member sign-in & account/password-reset request flows, " +
      "and the forced first-login password change. Turn on to activate the member platform; " +
      "off keeps the Sessions 1–10 portal behavior. Developer-only.",
    category: "plugin",
  },
];

export const PLUGIN_KEYS = PLUGIN_DEFS.map((p) => p.key);

// ── tiny TTL cache (so gating reads don't hit Neon on every request) ──
const FLAG_CACHE_TTL_MS = 10_000;
const _cache = new Map(); // key -> { value, expiresAt }

// Exported so tests can reset between cases. Clears one key or the whole cache.
export function clearFlagCache(key) {
  if (key) _cache.delete(key);
  else _cache.clear();
}

// ── PURE helper ──
export function shapeFlag(f) {
  if (!f) return null;
  return {
    key: f.key,
    name: f.name,
    description: f.description ?? null,
    enabled: !!f.enabled,
    category: f.category ?? "plugin",
    updatedAt: f.updatedAt instanceof Date ? f.updatedAt.toISOString() : f.updatedAt ?? null,
    updatedByEmail: f.updatedBy?.email ?? null,
  };
}

// ── developer-only guard (mirrors lib/users/admin.mjs#assertCanSetDeveloper) ──
async function assertDeveloperActor(actor) {
  if (actor?.system) return;
  if (!actor?.userId) {
    const err = new Error("Authentication required.");
    err.status = 401;
    err.code = "UNAUTHENTICATED";
    throw err;
  }
  const me = await prisma.user.findUnique({ where: { id: actor.userId }, select: { isDeveloper: true } });
  if (!me?.isDeveloper) {
    throw new CmsError("Only a developer can enable or disable plugins / feature flags.", {
      status: 403,
      code: "DEVELOPER_ONLY",
    });
  }
}

// ── gating read (ungated, cached) ──
// Returns whether a flag is enabled. Never throws. A missing row resolves to
// `false`. On a DB ERROR it returns `onError` (default `false` = fail-CLOSED, the
// safe direction for FEATURE GATING — a Neon hiccup never accidentally activates a
// feature) WITHOUT caching, so the error value never leaks to other callers and a
// recovered DB is read fresh next call. A caller using the flag for an allow/DENY
// auth restriction (where "off" means "allow the legacy path") passes `onError:true`
// so a read failure fails toward the safe DENY. `client` is injectable for tests;
// `useCache:false` forces a fresh read (used right after a toggle).
export async function isFeatureEnabled(key, { client, useCache = true, now = Date.now(), onError = false } = {}) {
  if (!key) return false;
  if (useCache) {
    const hit = _cache.get(key);
    if (hit && hit.expiresAt > now) return hit.value;
  }
  try {
    const db = client ?? prisma;
    const row = await db.featureFlag.findUnique({ where: { key }, select: { enabled: true } });
    const value = !!row?.enabled;
    _cache.set(key, { value, expiresAt: now + FLAG_CACHE_TTL_MS }); // cache only real reads
    return value;
  } catch (e) {
    console.warn(`[flags] isFeatureEnabled(${key}) read failed — returning onError=${onError}:`, e?.message ?? e);
    return onError;
  }
}

// Convenience: is the whole member platform active?
export function isMemberPlatformEnabled(opts) {
  return isFeatureEnabled(MEMBER_PLATFORM_FLAG, opts);
}

// Route/page guard: throw a 404-shaped error when a feature is disabled, so a
// member-platform endpoint is invisible (not merely forbidden) while off.
export async function assertFeatureEnabled(key, opts) {
  if (!(await isFeatureEnabled(key, opts))) {
    throw new CmsError("This feature is not enabled.", { status: 404, code: "FEATURE_DISABLED" });
  }
}

// ── reads (gated) ──
export async function listFeatureFlags(actor = {}) {
  await assertActorPermission(actor, "dev.console");
  const rows = await prisma.featureFlag.findMany({
    orderBy: [{ category: "asc" }, { key: "asc" }],
    include: { updatedBy: { select: { email: true } } },
  });
  return rows.map(shapeFlag);
}

// ── mutation (developer-only, audited) ──
// Enable/disable a plugin. Only a known seeded flag may be toggled. Idempotent: a
// no-op when already in the requested state. Writes exactly one semantic audit row.
export async function setFeatureFlag(key, enabled, actor = {}) {
  await assertDeveloperActor(actor);
  if (!PLUGIN_KEYS.includes(key)) throw new CmsNotFoundError(`Unknown feature flag '${key}'.`);
  const want = !!enabled;
  const def = PLUGIN_DEFS.find((p) => p.key === key);

  const existing = await prisma.featureFlag.findUnique({ where: { key } });
  if (existing && existing.enabled === want) {
    clearFlagCache(key);
    return { flag: shapeFlag(existing), changed: false };
  }

  const { flag } = await auditedMutation(
    actor,
    async (tx) => {
      const flag = await tx.featureFlag.upsert({
        where: { key },
        update: { enabled: want, updatedById: actor?.userId ?? null },
        create: {
          key,
          name: def.name,
          description: def.description ?? null,
          category: def.category ?? "plugin",
          enabled: want,
          updatedById: actor?.userId ?? null,
        },
      });
      return { flag };
    },
    ({ flag }) => ({
      action: "update",
      entityType: FLAG_ENTITY,
      // feature_flag's PK is a text slug, not a uuid → leave entityId null and name
      // the flag in the summary + before/after (audit_log.entity_id is @db.Uuid).
      before: existing ? { key, enabled: existing.enabled } : { key, enabled: false },
      after: { key, enabled: flag.enabled },
      summary: `${want ? "Enabled" : "Disabled"} plugin "${flag.name}" (${key})`,
    })
  );
  clearFlagCache(key);
  return { flag: shapeFlag(flag), changed: true };
}
