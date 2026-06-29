// Testing reports + cost estimation (Session 8) — surfaces (1) the test-suite
// catalog (what exists + how to run it; outcomes come from `npm test`), (2) the
// per-session token usage parsed from docs/Token_Usage.md, and (3) a simple
// Neon/Cloudinary free-tier cost view from live DB + media-asset sizes.
//
// All the number-crunching lives in PURE, unit-tested helpers (parse / summarize /
// estimate); the DB touch is one read (`getInfraUsage`) and the gated aggregator
// `getDevConsoleReports` (dev.console). Cost figures are INDICATIVE and clearly
// labelled — pricing/free-tier limits are parameters a maintainer should verify,
// not authoritative billing.
import { readFile } from "node:fs/promises";
import path from "node:path";
import prisma from "../prisma.mjs";
import { authorizeConsole } from "./authorize.mjs";

const REPORT_PERMS = ["dev.console"];

// ── test-suite catalog ──────────────────────────────────────────────────────

// Data catalog of the test suites — NOT a runner. The static suite is default-green
// (no DB); the live-DB suites self-skip unless RUN_DB_TESTS=1. Live counts mirror
// CURRENT_STATUS / CHANGELOG and are indicative (the authoritative outcome is the
// `npm test` run).
export const TEST_SUITES = [
  { kind: "static", suite: "all static", description: "Pure logic across all tests/*.test.mjs — default-green, no DB", command: "npm test" },
  { kind: "live", suite: "tests/cms.db.test.mjs", count: 8, description: "CMS lifecycle / restore / version / audit / visibility" },
  { kind: "live", suite: "tests/year.db.test.mjs", count: 6, description: "Year resolution / history / transition / lock" },
  { kind: "live", suite: "tests/org.db.test.mjs", count: 4, description: "Org-unit + hierarchy / appointment guards / importer / public read" },
  { kind: "live", suite: "tests/events.db.test.mjs", count: 10, description: "Events/announcements windows / split / pinned / importer / audience / concurrency" },
  { kind: "live", suite: "tests/resources.db.test.mjs", count: 4, description: "Resources publish→visible / importer idempotency / dedup / resume" },
  { kind: "live", suite: "tests/media.db.test.mjs", count: 3, description: "Media migrate idempotent+reversible / curated CRUD one-audit-row / RBAC" },
  { kind: "live", suite: "tests/devconsole.db.test.mjs", count: null, description: "Audit-log reader filters/stats/timeline + status + backup ledger (Session 8)" },
  { kind: "command", suite: "RUN_DB_TESTS=1 dotenv -e .env.local -- npm test", description: "Adds every live-DB suite to the default static run" },
];

// ── token-usage parsing (docs/Token_Usage.md) ───────────────────────────────

// Parse the per-session markdown table into rows. Tolerant of the table: a data row
// starts `| <n> | <date> | <focus> | <tokens-cell> | ...`. The measured workflow
// token count is the bolded **N,NNN** in the tokens cell (null when absent, e.g. an
// unstarted future session row whose cell is "—").
export function parseTokenUsage(markdown = "") {
  const rows = [];
  for (const line of String(markdown).split("\n")) {
    const m = line.match(/^\|\s*(\d+)\s*\|([^|]*)\|([^|]*)\|([^|]*)\|/);
    if (!m) continue; // header / separator / prose lines don't match a leading integer cell
    const session = Number(m[1]);
    const date = m[2].trim();
    const focus = m[3].trim();
    const bold = m[4].match(/\*\*([\d,]+)\*\*/);
    const workflowTokens = bold ? Number(bold[1].replace(/,/g, "")) : null;
    rows.push({ session, date: date && date !== "—" ? date : null, focus, workflowTokens });
  }
  return rows;
}

// Summarize parsed token-usage rows: totals + a compact per-session list.
export function summarizeTokenUsage(rows = []) {
  const measured = rows.filter((r) => r.workflowTokens != null);
  const totalWorkflowTokens = measured.reduce((s, r) => s + r.workflowTokens, 0);
  return {
    sessions: rows.length,
    sessionsMeasured: measured.length,
    totalWorkflowTokens,
    bySession: rows.map((r) => ({ session: r.session, focus: r.focus, workflowTokens: r.workflowTokens })),
  };
}

// ── cost estimation ──────────────────────────────────────────────────────────

// Indicative USD per 1M OUTPUT tokens (verify current Claude pricing before
// quoting). Token_Usage records workflow subagent OUTPUT tokens only; the true
// billable total (input + output, main loop + workflows) comes from `/cost`.
export const DEFAULT_OUTPUT_PRICE_PER_MTOK = 15;

export function estimateBuildCost(totalWorkflowTokens = 0, { outputPricePerMTok = DEFAULT_OUTPUT_PRICE_PER_MTOK } = {}) {
  const usd = (Number(totalWorkflowTokens) / 1_000_000) * outputPricePerMTok;
  return {
    totalWorkflowTokens: Number(totalWorkflowTokens) || 0,
    outputPricePerMTok,
    estimatedUsd: Math.round(usd * 100) / 100,
    note: "Workflow subagent OUTPUT tokens only — not the billable total (input + main loop). Run /cost for the true figure.",
  };
}

// Documented free-tier limits at build time (parameters — verify before relying).
// Neon free tier: 0.5 GB storage. Cloudinary free tier: 25 monthly credits, where
// ~1 credit ≈ 1 GB stored (also bandwidth/transformations — modelled on storage).
export const NEON_FREE_STORAGE_BYTES = 512 * 1024 * 1024;
export const CLOUDINARY_FREE_CREDITS = 25;
const GB = 1024 ** 3;

const round = (n, d = 4) => {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
};

// Free-tier headroom for the two infra dependencies. PURE.
export function estimateInfraCost({ dbSizeBytes = 0, mediaBytes = 0, mediaCount = 0 } = {}) {
  const cloudinaryCredits = mediaBytes / GB; // ~1 credit per GB stored (indicative)
  return {
    neon: {
      storageBytes: Number(dbSizeBytes) || 0,
      freeStorageBytes: NEON_FREE_STORAGE_BYTES,
      usedFraction: round((Number(dbSizeBytes) || 0) / NEON_FREE_STORAGE_BYTES),
      withinFreeTier: (Number(dbSizeBytes) || 0) <= NEON_FREE_STORAGE_BYTES,
    },
    cloudinary: {
      mediaCount: Number(mediaCount) || 0,
      storageBytes: Number(mediaBytes) || 0,
      estimatedCredits: round(cloudinaryCredits),
      freeCredits: CLOUDINARY_FREE_CREDITS,
      withinFreeTier: cloudinaryCredits <= CLOUDINARY_FREE_CREDITS,
    },
    note: "Indicative free-tier headroom only; verify provider limits/pricing before relying on these.",
  };
}

// ── live infra usage ──────────────────────────────────────────────────────

// Read the raw sizes the cost estimate consumes: total DB size (pg_database_size)
// and the tracked media inventory's count + summed bytes (non-archived).
export async function getInfraUsage({ client = prisma } = {}) {
  let dbSizeBytes = null;
  try {
    const r = await client.$queryRaw`SELECT pg_database_size(current_database())::bigint AS bytes`;
    dbSizeBytes = r?.[0]?.bytes != null ? Number(r[0].bytes) : null;
  } catch {
    dbSizeBytes = null;
  }
  // Guard the aggregate too (mirrors the size guard): on an unreachable/cold Neon
  // this must degrade to nulls, not throw — otherwise it sinks the whole status
  // endpoint in exactly the failure mode the dashboard exists to report.
  let mediaCount = null;
  let mediaBytes = 0;
  try {
    const agg = await client.mediaAsset.aggregate({ _sum: { bytes: true }, _count: { _all: true }, where: { archivedAt: null } });
    mediaCount = agg._count._all;
    mediaBytes = agg._sum.bytes != null ? Number(agg._sum.bytes) : 0;
  } catch {
    mediaCount = null;
    mediaBytes = 0;
  }
  return { dbSizeBytes, mediaCount, mediaBytes };
}

// ── gated aggregator ──────────────────────────────────────────────────────

// Testing + cost reports for the console (dev.console). Token usage is read from
// docs/Token_Usage.md (degrades to { error } if unreadable); infra usage from the DB.
export async function getDevConsoleReports(actor = {}, { client = prisma, tokenUsagePath } = {}) {
  await authorizeConsole(actor, REPORT_PERMS);
  let tokenUsage;
  try {
    const p = tokenUsagePath ?? path.join(process.cwd(), "docs", "Token_Usage.md");
    tokenUsage = summarizeTokenUsage(parseTokenUsage(await readFile(p, "utf8")));
  } catch (e) {
    tokenUsage = { error: e?.message ?? String(e) };
  }
  // Isolate the infra read so a cold/unreachable Neon degrades it to { error }
  // (like tokenUsage) rather than rejecting the whole reports call — which would
  // sink the status route alongside the resilient system-status payload.
  let infra;
  try {
    infra = await getInfraUsage({ client });
  } catch (e) {
    infra = { error: e?.message ?? String(e) };
  }
  return {
    tests: TEST_SUITES,
    tokenUsage,
    buildCost: tokenUsage?.totalWorkflowTokens != null ? estimateBuildCost(tokenUsage.totalWorkflowTokens) : null,
    infra,
    infraCost: estimateInfraCost(infra),
  };
}
