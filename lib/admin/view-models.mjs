// Admin Panel view-models (Session 9) — PURE shaping helpers that turn the
// existing service/reader output into the flat, display-ready objects the admin
// screens render. No DB, no server-only imports (it imports only the pure
// content-type catalog), so it is unit-testable and client-safe.
//
// Keeping the shaping here (not inline in components) is what makes the UI logic
// testable without rendering React — the "view-model helper" tests the session
// brief calls for.
import { CONTENT_TYPE_DEFS } from "../cms/content-types.mjs";

// content_type → human label (from the single content-type catalog).
export const CONTENT_TYPE_LABELS = Object.fromEntries(CONTENT_TYPE_DEFS.map((d) => [d.contentType, d.label]));

export function contentTypeLabel(type) {
  return CONTENT_TYPE_LABELS[type] ?? type ?? "—";
}

// A lifecycle status → a coarse display tone the badge component colors by.
export function statusTone(status) {
  switch (status) {
    case "published":
    case "active":
    case "completed":
    case "verified":
      return "good";
    case "draft":
    case "planning":
    case "running":
    case "pending":
      return "info";
    case "review":
    case "inactive": // M1: can log in + browse, but cannot participate in events
      return "warn";
    case "archived":
    case "locked":
    case "revoked": // M1: cannot log in; public site only
    case "failed":
      return "muted";
    default:
      return "neutral";
  }
}

// Shape a raw content_item row (from lib/year/history.mjs#listContentForYear) plus
// a resolved display title into a flat admin row. `title` is resolved by the caller
// (it lives on content_revision, not content_item).
export function shapeContentRow(item, { title } = {}) {
  if (!item) return null;
  const hasDraft = item.draftRevisionId != null;
  const hasPublished = item.publishedRevisionId != null;
  return {
    id: item.id,
    contentType: item.contentType,
    typeLabel: contentTypeLabel(item.contentType),
    slug: item.slug ?? null,
    title: title ?? item.slug ?? "(untitled)",
    status: item.status,
    statusTone: statusTone(item.status),
    pinned: !!item.pinned,
    hasDraft,
    hasPublished,
    orgUnitId: item.orgUnitId ?? null,
    publishedRevisionId: item.publishedRevisionId ?? null,
    draftRevisionId: item.draftRevisionId ?? null,
    updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt ?? null,
  };
}

// Which lifecycle ACTIONS are available for a content row, given its state. Pure —
// the UI uses this to show/hide buttons (the service still authorizes + enforces).
export function availableContentActions(row) {
  if (!row) return [];
  // An archived item has no panel actions — the CMS service exposes no "unarchive"
  // op, so we surface none rather than a phantom action with no dispatcher handler.
  if (row.status === "archived") return [];
  const actions = ["edit"];
  if (row.hasDraft) actions.push("publish");
  if (row.hasPublished) actions.push("unpublish");
  actions.push("archive");
  return actions;
}

// Group shaped content rows by content type for a sectioned list.
export function groupContentByType(rows) {
  const groups = {};
  for (const r of rows ?? []) (groups[r.contentType] ??= { contentType: r.contentType, label: r.typeLabel, rows: [] }).rows.push(r);
  return Object.values(groups).sort((a, b) => a.label.localeCompare(b.label));
}

// PURE, client-safe field-level diff of two revision VIEWS (the shape
// lib/cms/content.mjs#getRevision returns: { title, summary, payload }). Mirrors
// the server-side diffRevisionViews so the admin item editor can diff two
// already-loaded revisions in the browser without a round-trip or importing the
// prisma-backed CMS service. Dates compare by ISO; objects/arrays by value.
function flattenForDiff(view) {
  const flat = { title: view?.title ?? null, summary: view?.summary ?? null };
  if (view?.payload) for (const [k, v] of Object.entries(view.payload)) flat[k] = v ?? null;
  return flat;
}
function valuesEqual(a, b) {
  if (a instanceof Date) a = a.toISOString();
  if (b instanceof Date) b = b.toISOString();
  if ((a && typeof a === "object") || (b && typeof b === "object")) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}
export function diffViews(a, b) {
  const fa = flattenForDiff(a);
  const fb = flattenForDiff(b);
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  const changes = {};
  for (const k of keys) if (!valuesEqual(fa[k], fb[k])) changes[k] = { from: fa[k] ?? null, to: fb[k] ?? null };
  return { changes, changed: Object.keys(changes) };
}

// Turn a diff result ({ changes }) into flat display rows. Object/array values
// are JSON-stringified for a stable, readable cell.
export function buildDiffRows(diff) {
  if (!diff?.changes) return [];
  const fmt = (v) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return Object.entries(diff.changes).map(([field, { from, to }]) => ({ field, from: fmt(from), to: fmt(to) }));
}

// Human label for a role assignment's scope (institute-wide / unit / year).
export function formatAssignmentScope(a) {
  if (!a) return "—";
  const parts = [];
  if (a.orgUnitLineageKey) parts.push("unit-scoped");
  if (a.academicYearId) parts.push(a.academicYearLabel ? `year ${a.academicYearLabel}` : "year-scoped");
  return parts.length ? parts.join(" · ") : "institute-wide";
}

// Shape an academic_year row (optionally with counts) for the years table.
export function shapeYearRow(y) {
  if (!y) return null;
  return {
    id: y.id,
    label: y.label,
    status: y.status,
    statusTone: statusTone(y.status),
    isCurrent: !!y.isCurrent,
    startDate: y.startDate instanceof Date ? y.startDate.toISOString().slice(0, 10) : y.startDate ?? null,
    endDate: y.endDate instanceof Date ? y.endDate.toISOString().slice(0, 10) : y.endDate ?? null,
    counts: y.counts ?? null,
  };
}

// Bytes → a short human size string (for the media library + infra readouts).
export function humanBytes(n) {
  if (n == null) return "—"; // null/undefined "unknown" — distinct from an actual 0 bytes
  const b = Number(n);
  if (!Number.isFinite(b) || b < 0) return "—";
  if (b < 1024) return `${b} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || Number.isInteger(v) ? 0 : 1)} ${units[i]}`;
}
