// Monitoring + status (Session 8) — the READ-ONLY operational dashboard:
//   • DB connectivity / Neon compute state (round-trip latency probe);
//   • migration status (a `prisma migrate status`-shaped diff of the on-disk
//     migrations against the `_prisma_migrations` ledger);
//   • Transition Wizard history + per-run counts (reusing lib/year/transition.mjs);
//   • the /public→Cloudinary media-migration PLAN/counts — the same buckets a
//     `migratePublicAssets({ dryRun:true })` reports, computed here as a pure read
//     (reusing migrate.mjs#selectMigrationCandidates) so it never routes a read
//     through the migration tool's `media.migrate` gate.
//
// Nothing here mutates. The pure helpers (classifyLatency / diffMigrations /
// summarizeTransitionRuns / shapeTransitionRun) are unit-tested without a DB; the
// async functions are thin reads. `getSystemStatus` is the one gated aggregator
// (dev.console) and degrades gracefully — a failing sub-check becomes `{ error }`
// rather than throwing the whole dashboard (a cold/suspended Neon compute is a
// STATE to report, not an exception to bubble — see the Neon-latency memory).
import { readdir } from "node:fs/promises";
import path from "node:path";
import prisma from "../prisma.mjs";
import { authorizeConsole } from "./authorize.mjs";
import { listTransitionRuns } from "../year/transition.mjs";
import { selectMigrationCandidates } from "../media/migrate.mjs";

const STATUS_PERMS = ["dev.console"];

// ── DB connectivity ───────────────────────────────────────────────────────

// Coarse label for a measured round-trip latency. Neon auto-suspends and has high
// per-query latency on a cold compute; a first warm-up query of 1–3s is normal,
// not a fault.
export function classifyLatency(ms) {
  if (ms == null || !Number.isFinite(ms)) return "unknown";
  if (ms < 250) return "warm";
  if (ms < 1500) return "normal";
  if (ms < 5000) return "cold";
  return "very-slow";
}

const UNREACHABLE_RE = /can't reach database|ECONNREFUSED|ETIMEDOUT|terminating connection|connection terminated|P1001/i;

// Probe DB connectivity + latency. NEVER throws — a failure is returned as
// { ok:false, error, unreachable } so the dashboard reports it as a state. `probe`
// is injectable for tests (default: a trivial `SELECT 1`).
export async function checkDatabase({ client = prisma, probe } = {}) {
  const started = Date.now();
  try {
    if (probe) await probe();
    else await client.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - started;
    return { ok: true, latencyMs, state: classifyLatency(latencyMs) };
  } catch (e) {
    const message = e?.message ?? String(e);
    const unreachable = UNREACHABLE_RE.test(message);
    // Don't surface the raw driver message to the client — a Prisma P1001 embeds the
    // Neon host:port. Log the full detail server-side; return a coarse status.
    if (unreachable) console.warn("[devconsole] DB unreachable:", message);
    return {
      ok: false,
      latencyMs: Date.now() - started,
      unreachable,
      error: unreachable ? "Database is unreachable (the Neon compute may be suspended)." : "Database health check failed.",
    };
  }
}

// ── migration status ──────────────────────────────────────────────────────

// Read a `_prisma_migrations` row's name regardless of column-name casing (raw
// SQL yields snake_case; a Prisma model would yield camelCase).
function migName(r) {
  return r?.migration_name ?? r?.migrationName ?? null;
}
function isFinished(r) {
  return (r?.finished_at ?? r?.finishedAt) != null;
}
function isRolledBack(r) {
  return (r?.rolled_back_at ?? r?.rolledBackAt) != null;
}

// Diff on-disk migration directory names against the `_prisma_migrations` ledger.
// Mirrors `prisma migrate status`:
//   • applied — on disk AND recorded finished (and not rolled back);
//   • failed  — recorded but unfinished, or rolled back;
//   • pending — on disk but with no ledger row (never applied);
//   • extra   — a ledger row with no on-disk directory (drift / remote-only).
export function diffMigrations(localNames = [], appliedRows = []) {
  const byName = new Map();
  for (const r of appliedRows) {
    const n = migName(r);
    if (n) byName.set(n, r);
  }
  const applied = [];
  const failed = [];
  const pending = [];
  for (const name of localNames) {
    const r = byName.get(name);
    if (!r) {
      pending.push(name);
    } else if (isRolledBack(r)) {
      failed.push({ name, reason: "rolled_back" });
    } else if (!isFinished(r)) {
      failed.push({ name, reason: "unfinished" });
    } else {
      applied.push(name);
    }
  }
  const localSet = new Set(localNames);
  const extra = appliedRows.map(migName).filter((n) => n && !localSet.has(n));
  return { total: localNames.length, applied, pending, failed, extra, upToDate: pending.length === 0 && failed.length === 0 };
}

// Read the migration status: on-disk directories vs the DB ledger. Both reads are
// defensive (a missing dir / unreadable ledger degrades to empty + an error note).
export async function getMigrationStatus({ client = prisma, migrationsDir } = {}) {
  let localNames = [];
  try {
    // turbopackIgnore: don't trace this runtime fs read (it would pull the whole
    // project into the NFT list — KNOWN_ISSUES #32). The dir is bundled explicitly
    // via outputFileTracingIncludes in next.config.mjs.
    const dir = migrationsDir ?? path.join(/* turbopackIgnore: true */ process.cwd(), "prisma", "migrations");
    const entries = await readdir(dir, { withFileTypes: true });
    localNames = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    localNames = [];
  }
  let rows = [];
  try {
    rows = await client.$queryRaw`
      SELECT migration_name, finished_at, rolled_back_at, applied_steps_count
      FROM _prisma_migrations
      ORDER BY started_at ASC`;
  } catch (e) {
    // The ledger is unreadable (cold/suspended Neon, perms, etc.). Do NOT diff
    // against an empty ledger — that would mislabel every applied migration as
    // 'pending' / upToDate:false (the opposite of the truth). Return a distinct
    // "undetermined" shape so a consumer can tell "couldn't check" from "nothing
    // applied" (Session-8 review).
    console.warn("[devconsole] migration ledger unreadable:", e?.message ?? e);
    return { status: "ledger-unreadable", error: "Could not read the migration ledger.", localNames, total: localNames.length, applied: [], pending: [], failed: [], extra: [], upToDate: null };
  }
  return { ...diffMigrations(localNames, rows), localNames };
}

// ── transition history ──────────────────────────────────────────────────────

// Compact, JSON-safe view of a transition_run row (dates → ISO; counts as-is).
export function shapeTransitionRun(r) {
  if (!r) return null;
  return {
    id: r.id,
    sourceYearId: r.sourceYearId,
    targetYearId: r.targetYearId,
    status: r.status,
    copyStructure: r.copyStructure,
    copyAppointments: r.copyAppointments,
    copyContent: r.copyContent,
    copyRoleAssignments: r.copyRoleAssignments,
    counts: r.counts ?? null,
    startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt ?? null,
    completedAt: r.completedAt instanceof Date ? r.completedAt.toISOString() : r.completedAt ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt ?? null,
  };
}

// Aggregate transition runs (already newest-first): total, counts by status, the
// latest run, and how many (source→target) pairs reached 'completed'.
export function summarizeTransitionRuns(runs = []) {
  const byStatus = {};
  for (const r of runs) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  return {
    total: runs.length,
    byStatus,
    completed: runs.filter((r) => r.status === "completed").length,
    latest: runs[0] ? shapeTransitionRun(runs[0]) : null,
  };
}

// Transition history + summary, optionally scoped to a target/source year.
export async function getTransitionStatus({ targetYearId, sourceYearId, client = prisma } = {}) {
  const runs = await listTransitionRuns({ targetYearId, sourceYearId }, { client });
  return { summary: summarizeTransitionRuns(runs), runs: runs.map(shapeTransitionRun) };
}

// ── media-migration plan ──────────────────────────────────────────────────

// The /public→Cloudinary migration PLAN/counts as a pure read — buckets the
// media_asset inventory with the EXISTING selectMigrationCandidates (the same
// classification migratePublicAssets({dryRun:true}) uses), without invoking the
// gated mutator. `pendingPublic` is how many /public files would upload on the next
// `--apply`; `base64Pending` are the Session-6 placeholders awaiting reconciliation.
export async function getMediaMigrationStatus({ client = prisma } = {}) {
  const assets = await client.mediaAsset.findMany({
    where: { archivedAt: null },
    select: { id: true, storageProvider: true, cloudinaryPublicId: true, url: true, originalPath: true, kind: true, archivedAt: true },
  });
  const b = selectMigrationCandidates(assets);
  const totalActive = assets.length;
  return {
    counts: {
      pendingPublic: b.public.length,
      base64Pending: b.base64.length,
      alreadyMigrated: b.migrated.length,
      external: b.external.length,
      skipped: b.skipped.length,
    },
    totalActiveAssets: totalActive,
    fullyMigrated: b.public.length === 0 && b.base64.length === 0,
  };
}

// ── aggregator ──────────────────────────────────────────────────────────────

// The one gated system-status dashboard (dev.console). Runs every sub-check in
// parallel; each non-connectivity check is wrapped so a failure becomes
// { error } rather than failing the whole dashboard.
export async function getSystemStatus(actor = {}, { client = prisma } = {}) {
  await authorizeConsole(actor, STATUS_PERMS);
  const safe = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      return { error: e?.message ?? String(e) };
    }
  };
  const [database, migrations, transitions, media] = await Promise.all([
    checkDatabase({ client }),
    safe(() => getMigrationStatus({ client })),
    safe(() => getTransitionStatus({ client })),
    safe(() => getMediaMigrationStatus({ client })),
  ]);
  return { checkedAt: new Date().toISOString(), database, migrations, transitions, media };
}
