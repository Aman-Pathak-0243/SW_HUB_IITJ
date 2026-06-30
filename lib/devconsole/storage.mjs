// Per-table size monitoring + thresholds + export / guarded truncate (M8, DL-072).
//
// A developer sets a byte threshold per table; `getStorageReport` compares each
// table's LIVE size (pg_total_relation_size) against its threshold and FLAGS the
// ones over — NON-blocking (the site + feature keep working past the warning) — and
// can raise a deduped `threshold_alert` notification. `exportTable` dumps any table
// (JSON/CSV) and records a `backup_record` ledger entry; `truncateTable` rolls over
// an ALLOWLISTED high-volume log table after export (destructive → developer-only
// `storage.manage`, audited, confirm-gated). Reads gate on dev.console/storage.manage;
// mutations gate on storage.manage.
import prisma, { prismaBase } from "../prisma.mjs";
import { authorizeConsole } from "./authorize.mjs";
import { assertActorPermission } from "../year/context.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { recordBackup } from "./backups.mjs";
import { recordAudit } from "../cms/audit.mjs";
import { createNotification, NOTIFICATION_TYPES } from "../notifications/service.mjs";
import { CmsValidationError, CmsError } from "../cms/errors.mjs";

const READ_PERMS = ["dev.console", "storage.manage"];
const MANAGE_PERM = "storage.manage";
const ENTITY = "table_threshold";
const EXPORT_MAX_ROWS = 50000;

// TRUNCATE is whole-table + irreversible, so it is restricted to an explicit
// allowlist of genuinely append-only / high-volume LOG tables that are safe to roll
// over after an export. `page_visit` (hidden analytics) is the realistic
// unbounded-growth case. Deliberately conservative — adding a table here is a code
// change a reviewer sees (never let the dashboard truncate content/RBAC/audit data).
export const TRUNCATABLE_TABLES = new Set(["page_visit"]);

// ── PURE helpers (unit-tested) ──
// Annotate table sizes with their threshold + an `exceeded` flag. NON-blocking: this
// only reports; nothing here stops a write. Returns rows sorted largest-first plus
// the `flagged` subset (over threshold).
export function buildStorageReport(sizes = [], thresholds = []) {
  const tmap = new Map(thresholds.map((t) => [t.tableName, Number(t.thresholdBytes)]));
  const rows = (sizes ?? [])
    .map((s) => {
      const threshold = tmap.has(s.tableName) ? tmap.get(s.tableName) : null;
      const exceeded = threshold != null && Number(s.bytes) > threshold;
      return { tableName: s.tableName, bytes: Number(s.bytes), estRows: Number(s.estRows ?? 0), threshold, exceeded };
    })
    .sort((a, b) => b.bytes - a.bytes);
  return { rows, flagged: rows.filter((r) => r.exceeded), totalBytes: rows.reduce((n, r) => n + r.bytes, 0) };
}

// Minimal CSV (shared with the audit exporter's quoting rule).
export function toCsv(rows = []) {
  if (!rows.length) return "";
  const cols = [...rows.reduce((set, r) => { Object.keys(r).forEach((k) => set.add(k)); return set; }, new Set())];
  const cell = (v) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}

// JSON-safe (BigInt → string) replacer for arbitrary table rows.
function jsonSafe(_k, v) {
  return typeof v === "bigint" ? v.toString() : v;
}

// ── live sizes (raw SQL; guarded — degrades to [] on a cold/unreachable Neon) ──
export async function getTableSizes({ client = prismaBase } = {}) {
  try {
    const rows = await client.$queryRawUnsafe(
      `SELECT c.relname AS table_name, pg_total_relation_size(c.oid)::bigint AS bytes, c.reltuples::bigint AS est_rows
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
       ORDER BY pg_total_relation_size(c.oid) DESC`
    );
    return rows.map((r) => ({ tableName: r.table_name, bytes: Number(r.bytes), estRows: Number(r.est_rows) }));
  } catch {
    return [];
  }
}

// Validate a table name against the LIVE set of public tables before it is ever
// interpolated into raw SQL (export/truncate) — closes SQL injection.
async function assertRealTable(tableName) {
  const name = String(tableName ?? "");
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new CmsValidationError(`Invalid table name '${tableName}'.`);
  const sizes = await getTableSizes();
  if (!sizes.some((s) => s.tableName === name)) {
    throw new CmsValidationError(`Unknown table '${tableName}'.`, { status: 404, code: "UNKNOWN_TABLE" });
  }
  return name;
}

// ── thresholds (read = dev.console/storage.manage; write = storage.manage, audited) ──
export async function listTableThresholds(actor = {}, { client = prisma } = {}) {
  await authorizeConsole(actor, READ_PERMS);
  const rows = await client.tableThreshold.findMany({ orderBy: { tableName: "asc" } });
  return rows.map((t) => ({ tableName: t.tableName, thresholdBytes: Number(t.thresholdBytes), note: t.note ?? null }));
}

export async function setTableThreshold(tableName, thresholdBytes, { note } = {}, actor = {}) {
  await assertActorPermission(actor, MANAGE_PERM);
  const name = await assertRealTable(tableName);
  const bytes = Number(thresholdBytes);
  if (!Number.isFinite(bytes) || bytes < 0) throw new CmsValidationError("thresholdBytes must be a non-negative number.");
  const { row } = await auditedMutation(
    actor,
    async (tx) => ({
      row: await tx.tableThreshold.upsert({
        where: { tableName: name },
        update: { thresholdBytes: BigInt(Math.floor(bytes)), note: note ?? null, updatedById: actor?.userId ?? null },
        create: { tableName: name, thresholdBytes: BigInt(Math.floor(bytes)), note: note ?? null, updatedById: actor?.userId ?? null },
      }),
    }),
    ({ row }) => ({
      action: "update",
      entityType: ENTITY,
      after: { tableName: row.tableName, thresholdBytes: Number(row.thresholdBytes) },
      summary: `Set size threshold for "${name}" → ${Math.floor(bytes)} bytes`,
    })
  );
  return { threshold: { tableName: row.tableName, thresholdBytes: Number(row.thresholdBytes), note: row.note ?? null } };
}

export async function removeTableThreshold(tableName, actor = {}) {
  await assertActorPermission(actor, MANAGE_PERM);
  const name = String(tableName ?? "");
  const existing = await prisma.tableThreshold.findUnique({ where: { tableName: name } });
  if (!existing) return { removed: false };
  await auditedMutation(
    actor,
    async (tx) => ({ row: await tx.tableThreshold.delete({ where: { tableName: name } }) }),
    () => ({ action: "delete", entityType: ENTITY, before: { tableName: name, thresholdBytes: Number(existing.thresholdBytes) }, summary: `Removed size threshold for "${name}"` })
  );
  return { removed: true };
}

// ── the report (gated read) — flags exceeded tables; optionally raises alerts ──
export async function getStorageReport(actor = {}, { client = prisma, raiseAlerts = false } = {}) {
  await authorizeConsole(actor, READ_PERMS);
  const [sizes, thresholds] = await Promise.all([
    getTableSizes({ client: prismaBase }),
    client.tableThreshold.findMany(),
  ]);
  const report = buildStorageReport(
    sizes,
    thresholds.map((t) => ({ tableName: t.tableName, thresholdBytes: Number(t.thresholdBytes) }))
  );
  // Raise a deduped dashboard notification per flagged table (non-blocking).
  if (raiseAlerts) {
    for (const f of report.flagged) {
      await createNotification({
        type: NOTIFICATION_TYPES.THRESHOLD_ALERT,
        label: "storage",
        title: `Table "${f.tableName}" exceeded its size threshold`,
        body: `"${f.tableName}" is ${f.bytes} bytes (threshold ${f.threshold}). Consider exporting + truncating it. The site keeps working.`,
        data: { table: f.tableName, bytes: f.bytes, threshold: f.threshold },
        dedupeKey: `storage:${f.tableName}`,
      }).catch(() => {});
    }
  }
  return report;
}

// ── export (gated storage.manage, audited via the backup ledger) ──
// Dumps a table as JSON or CSV (capped) and records a backup_record ledger row.
export async function exportTable(tableName, actor = {}, { format = "json", max = EXPORT_MAX_ROWS } = {}) {
  await assertActorPermission(actor, MANAGE_PERM);
  const name = await assertRealTable(tableName);
  const cap = Math.min(Math.max(Number(max) || EXPORT_MAX_ROWS, 1), EXPORT_MAX_ROWS);
  const rows = await prismaBase.$queryRawUnsafe(`SELECT * FROM "${name}" LIMIT ${cap}`);
  const fmt = format === "csv" ? "csv" : "json";
  const content = fmt === "csv" ? toCsv(rows) : JSON.stringify(rows, jsonSafe, 2);
  const bytes = Buffer.byteLength(content, "utf8");

  // GUARANTEED audit trail (Session-11 review): an export is a sensitive full-table
  // dump (it can include app_user.password_hash / auth tokens), so it MUST always
  // leave an attributed audit row INDEPENDENT of the backup ledger. Writing it via
  // recordAudit (a single insert on prismaBase) does NOT depend on the actor holding
  // backup.create / dev.console, so a storage.manage-only actor — and a transient
  // ledger failure — can no longer produce an untracked dump.
  await recordAudit(prismaBase, {
    actorUserId: actor?.userId ?? null,
    action: "create",
    entityType: "table_export",
    after: { table: name, format: fmt, rows: rows.length, bytes },
    summary: `Exported table "${name}" (${rows.length} rows, ${fmt}, ${bytes} bytes)`,
  }).catch((e) => console.warn(`[storage] export audit for ${name} failed:`, e?.message ?? e));

  // Best-effort backup-ledger row (a convenience locator; the audit row above is the
  // authoritative trail). Swallowed because the actor may lack backup.create — the
  // export is already audited regardless.
  const { backup } = await recordBackup(
    { scope: `table:${name}`, format: fmt, location: `download:${name}.${fmt}`, bytes },
    actor
  ).catch(() => ({ backup: null }));
  return { format: fmt, filename: `${name}.${fmt}`, contentType: fmt === "csv" ? "text/csv" : "application/json", content, count: rows.length, truncatedAtCap: rows.length >= cap, backupId: backup?.id ?? null };
}

// ── truncate (gated storage.manage, DESTRUCTIVE, allowlisted, confirm-gated) ──
export async function truncateTable(tableName, actor = {}, { confirm = false } = {}) {
  await assertActorPermission(actor, MANAGE_PERM);
  const name = await assertRealTable(tableName);
  if (!TRUNCATABLE_TABLES.has(name)) {
    throw new CmsError(`Table "${name}" is not allowlisted for truncation.`, { status: 403, code: "NOT_TRUNCATABLE" });
  }
  if (confirm !== true) {
    throw new CmsValidationError("Truncation must be explicitly confirmed (confirm:true). Export first.", { code: "CONFIRM_REQUIRED" });
  }
  const before = await prismaBase
    .$queryRawUnsafe(`SELECT count(*)::bigint AS n FROM "${name}"`)
    .then((r) => (r?.[0]?.n != null ? Number(r[0].n) : null))
    .catch(() => null);
  await auditedMutation(
    actor,
    async (tx) => {
      await tx.$executeRawUnsafe(`TRUNCATE TABLE "${name}"`);
      return { ok: true };
    },
    () => ({
      action: "delete",
      entityType: name,
      before: { rows: before },
      summary: `Truncated "${name}"${before != null ? ` (${before} rows)` : ""}`,
    })
  );
  return { truncated: true, table: name, rowsBefore: before };
}
