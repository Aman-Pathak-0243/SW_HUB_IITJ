// Hidden usage analytics (M8, DL-071) — which sections of the site are visited
// most. A best-effort `recordPageVisit` writes a lightweight `page_visit` row
// (never audited — it is in AUTO_AUDIT_SKIP, and we use prismaBase to skip the audit
// extension AND keep the write cheap); the developer dashboard reads aggregates via
// `getUsageAnalytics` (gated on dev.console). It is deliberately minimal + PII-light:
// path + an optional section label + an OPTIONAL user id + when.
import prisma, { prismaBase } from "../prisma.mjs";
import { authorizeConsole } from "./authorize.mjs";

const READ_PERMS = ["dev.console"];
const PATH_MAX = 512;
const SECTION_MAX = 120;

// ── PURE helpers (unit-tested) ──
// Derive a coarse "section" from a pathname (first non-empty segment), so analytics
// group by area (e.g. /org/clubs/x → "org", /events → "events", / → "home"). Keeps
// cardinality low and avoids storing per-id deep paths as their own section.
export function sectionFromPath(path) {
  if (!path) return "home";
  const clean = String(path).split(/[?#]/)[0];
  const seg = clean.split("/").filter(Boolean)[0];
  return seg ? seg.toLowerCase() : "home";
}

// Sort grouped { key, count } rows by count desc, then key asc; take top n.
export function topByCount(rows = [], n = 20) {
  return [...rows]
    .map((r) => ({ key: r.key, count: r.count }))
    .sort((a, b) => b.count - a.count || String(a.key).localeCompare(String(b.key)))
    .slice(0, n);
}

// ── write (best-effort, unauthenticated/system; NEVER throws) ──
// Called from a tracking route / Server Component. A failed analytics write must
// never break a page render, so all errors are swallowed. Returns true/false.
export async function recordPageVisit({ path, section, userId = null } = {}) {
  try {
    const p = String(path ?? "").slice(0, PATH_MAX);
    if (!p) return false;
    const sec = (section ? String(section) : sectionFromPath(p)).slice(0, SECTION_MAX);
    await prismaBase.pageVisit.create({ data: { path: p, section: sec, userId: userId ?? null } });
    return true;
  } catch {
    return false;
  }
}

// ── read (gated dev.console) ──
// Aggregate usage over the last `windowDays`: total visits, top sections, top paths.
// Uses groupBy (one round-trip each). Degrades to zeros on a read error rather than
// throwing (mirrors the status readers — analytics must not sink the dashboard).
export async function getUsageAnalytics({ windowDays = 30, take = 20 } = {}, actor = {}, { client = prisma } = {}) {
  await authorizeConsole(actor, READ_PERMS);
  const days = Math.min(Math.max(Number(windowDays) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  try {
    const where = { createdAt: { gte: since } };
    const [total, bySection, byPath] = await Promise.all([
      client.pageVisit.count({ where }),
      client.pageVisit.groupBy({ by: ["section"], where, _count: { _all: true } }),
      client.pageVisit.groupBy({ by: ["path"], where, _count: { _all: true } }),
    ]);
    const norm = (rows, k) => rows.map((g) => ({ key: g[k] ?? "(none)", count: g._count._all }));
    return {
      windowDays: days,
      since: since.toISOString(),
      totalVisits: total,
      bySection: topByCount(norm(bySection, "section"), take),
      byPath: topByCount(norm(byPath, "path"), take),
    };
  } catch (e) {
    return { windowDays: days, since: since.toISOString(), totalVisits: 0, bySection: [], byPath: [], error: e?.message ?? "usage read failed" };
  }
}
