// Audit-log VIEWER / reader (Session 8) — the read layer over `audit_log`.
//
// This is a READER, not a writer: the central audit-write choke point (DL-012 /
// DL-028, lib/cms/audit.mjs) already populates `audit_log` for every mutation, and
// this session adds NO new writer. Filtering is by actor / entity / action / year /
// time-range; the DB already has the supporting indexes (entity_type+entity_id+
// created_at, actor_user_id+created_at, action). Newest-first keyset pagination
// uses the monotonic BIGSERIAL `id` (DL-018) as the cursor — stable under inserts.
//
// Reads run on the audit-extended `prisma` client by default; that is safe because
// the audit extension only intercepts MUTATING ops (findMany/groupBy/count pass
// straight through and write no audit rows). An injectable `client` lets a script
// pass `prismaBase`. Every entry surface is gated on `audit.read` OR `dev.console`.
//
// The pure helpers (normalize / build-where / shape / summarize) carry the logic
// and are unit-tested without a DB; the exported async functions are thin gated
// wrappers around them.
import prisma from "../prisma.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import { authorizeConsole } from "./authorize.mjs";

// Mirror the AuditAction Postgres enum (prisma/schema.prisma) so a bad ?action=
// filter is a friendly 422, not a Prisma 500. Kept explicit (not derived) — the
// enum is small and code-coupled.
export const AUDIT_ACTIONS = [
  "create", "update", "delete", "publish", "unpublish", "archive",
  "restore", "login", "transition", "grant_role", "revoke_role",
];

// The audit log carries PII (actor email + per-row ip_address / user_agent), so it
// is gated on the DEDICATED `audit.read` permission — NOT the broader `dev.console`
// (which gates status/reports). A developer / super_admin holds both, so privileged
// users are unaffected; an operations-only `dev.console` grant cannot bulk-export
// audit PII. Keeping the reader and the /api/dev/audit route on the SAME single key
// avoids the boundary-vs-service gate mismatch (Session-8 review).
const READ_PERMS = ["audit.read"];
const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

// ── PURE helpers (no DB; unit-tested) ───────────────────────────────────────

// Clamp a page size into [1, max] with a default for NaN/absent input.
export function clampTake(n, def = DEFAULT_TAKE, max = MAX_TAKE) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return def;
  return Math.min(Math.floor(v), max);
}

// Parse a date-ish input (Date | ISO string | epoch ms) → a valid Date, else null.
// A bare date-only string (YYYY-MM-DD) parses to UTC midnight; with { endOfDay } it
// is bumped to 23:59:59.999 of that day so an inclusive upper bound like
// `?to=2026-12-31` includes everything ON Dec 31 (not just the first instant).
export function parseDateInput(v, { endOfDay = false } = {}) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  const s = String(v).trim();
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T23:59:59.999Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = typeof v === "number" ? new Date(v) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Validate + normalize raw filter input into a stable internal shape. Throws
// CmsValidationError on an unknown action. Unknown/blank keys are dropped.
export function normalizeAuditFilters(raw = {}) {
  const f = {};
  if (raw.actorUserId) f.actorUserId = String(raw.actorUserId);
  if (raw.entityType) f.entityType = String(raw.entityType);
  if (raw.entityId) f.entityId = String(raw.entityId);
  if (raw.academicYearId) f.academicYearId = String(raw.academicYearId);
  if (raw.action) {
    const action = String(raw.action);
    if (!AUDIT_ACTIONS.includes(action)) {
      throw new CmsValidationError(`Unknown audit action '${action}'. Allowed: ${AUDIT_ACTIONS.join(", ")}.`);
    }
    f.action = action;
  }
  const from = parseDateInput(raw.from);
  const to = parseDateInput(raw.to, { endOfDay: true }); // inclusive upper bound
  if (from) f.from = from;
  if (to) f.to = to;
  if (raw.search != null && String(raw.search).trim()) f.search = String(raw.search).trim();
  f.take = clampTake(raw.take);
  if (raw.cursor != null && raw.cursor !== "") f.cursor = String(raw.cursor);
  return f;
}

// Translate normalized filters into a Prisma `where`. The cursor implements
// newest-first keyset pagination: id < cursor (audit_log.id is monotonic).
export function buildAuditWhere(f = {}) {
  const where = {};
  if (f.actorUserId) where.actorUserId = f.actorUserId;
  if (f.entityType) where.entityType = f.entityType;
  if (f.entityId) where.entityId = f.entityId;
  if (f.academicYearId) where.academicYearId = f.academicYearId;
  if (f.action) where.action = f.action;
  if (f.from || f.to) {
    where.createdAt = {};
    if (f.from) where.createdAt.gte = f.from;
    if (f.to) where.createdAt.lte = f.to;
  }
  if (f.search) where.summary = { contains: f.search, mode: "insensitive" };
  if (f.cursor) {
    try {
      where.id = { lt: BigInt(f.cursor) };
    } catch {
      throw new CmsValidationError(`Invalid cursor '${f.cursor}'.`);
    }
  }
  return where;
}

// Shape an audit_log row for display. `id` is a BigInt → string (JSON-safe). Bulk
// LIST/timeline rows show the core "who/what/when" (incl. the actor's email — that
// IS the audit subject) but DATA-MINIMIZE the incidental request metadata: the
// per-row ipAddress / user_agent and the large before/after JSONB snapshots are
// included ONLY in the single-entry detail view (includeData), so high-volume
// listing is not also a bulk IP / user-agent export (Session-8 review).
export function shapeAuditEntry(row, { includeData = false } = {}) {
  if (!row) return null;
  const out = {
    id: row.id != null ? String(row.id) : null,
    actorUserId: row.actorUserId ?? null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId ?? null,
    academicYearId: row.academicYearId ?? null,
    summary: row.summary ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt ?? null,
  };
  if (row.actor) {
    out.actor = { id: row.actor.id, email: row.actor.email ?? null, displayName: row.actor.name ?? null };
  }
  if (includeData) {
    out.ipAddress = row.ipAddress ?? null;
    out.userAgent = row.userAgent ?? null;
    out.before = row.before ?? null;
    out.after = row.after ?? null;
  }
  return out;
}

// Compare two { key, count } entries: count DESC, then key ASC for a stable tie
// order. The single source of truth for the audit dashboards' ordering — used by
// both summarizeByKey and getAuditStats (so the production stats sort is the same
// one the unit tests exercise).
export function compareByCountThenKey(a, b) {
  return b.count - a.count || String(a.key).localeCompare(String(b.key));
}

// Count rows grouped by a key function → array sorted by count desc, then key asc.
export function summarizeByKey(rows, keyFn) {
  const m = new Map();
  for (const r of rows ?? []) {
    const k = keyFn(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, count })).sort(compareByCountThenKey);
}

const ACTOR_SELECT = { select: { id: true, email: true, name: true } };

// ── gated DB reads ──────────────────────────────────────────────────────────

// Page newest-first over audit_log under the given filters. Returns
// { entries, nextCursor, hasMore, count }. Fetches take+1 to detect another page.
export async function listAuditLog(rawFilters = {}, actor = {}, { client = prisma } = {}) {
  await authorizeConsole(actor, READ_PERMS);
  const filters = normalizeAuditFilters(rawFilters);
  const where = buildAuditWhere(filters);
  const rows = await client.auditLog.findMany({
    where,
    orderBy: { id: "desc" },
    take: filters.take + 1,
    include: { actor: ACTOR_SELECT },
  });
  const hasMore = rows.length > filters.take;
  const page = hasMore ? rows.slice(0, filters.take) : rows;
  const entries = page.map((r) => shapeAuditEntry(r));
  const nextCursor = hasMore && page.length ? String(page[page.length - 1].id) : null;
  return { entries, nextCursor, hasMore, count: entries.length };
}

// One audit entry with full before/after, or a 404.
export async function getAuditEntry(id, actor = {}, { client = prisma } = {}) {
  await authorizeConsole(actor, READ_PERMS);
  let bigId;
  try {
    bigId = BigInt(id);
  } catch {
    throw new CmsValidationError(`Invalid audit id '${id}'.`);
  }
  const row = await client.auditLog.findUnique({ where: { id: bigId }, include: { actor: ACTOR_SELECT } });
  if (!row) throw new CmsNotFoundError(`Audit entry ${id} not found.`);
  return shapeAuditEntry(row, { includeData: true });
}

// Full activity timeline for one entity (uses the entity_type+entity_id+created_at
// index). Newest-first; capped.
export async function getEntityTimeline(entityType, entityId, actor = {}, { take = 100, client = prisma } = {}) {
  await authorizeConsole(actor, READ_PERMS);
  if (!entityType || !entityId) throw new CmsValidationError("entityType and entityId are required.");
  const rows = await client.auditLog.findMany({
    where: { entityType: String(entityType), entityId: String(entityId) },
    orderBy: { createdAt: "desc" },
    take: clampTake(take, 100, 500),
    include: { actor: ACTOR_SELECT },
  });
  return rows.map((r) => shapeAuditEntry(r));
}

// Aggregate dashboard stats over a filter window: total + counts by action + by
// entity type. Pagination (cursor) is ignored — stats cover the whole window.
export async function getAuditStats(rawFilters = {}, actor = {}, { client = prisma } = {}) {
  await authorizeConsole(actor, READ_PERMS);
  const filters = normalizeAuditFilters(rawFilters);
  const where = buildAuditWhere({ ...filters, cursor: undefined });
  const [total, byAction, byEntity] = await Promise.all([
    client.auditLog.count({ where }),
    client.auditLog.groupBy({ by: ["action"], where, _count: { _all: true } }),
    client.auditLog.groupBy({ by: ["entityType"], where, _count: { _all: true } }),
  ]);
  const sortDesc = (rows, keyField) =>
    rows.map((g) => ({ key: g[keyField], count: g._count._all })).sort(compareByCountThenKey);
  return { total, byAction: sortDesc(byAction, "action"), byEntity: sortDesc(byEntity, "entityType") };
}
