// Member-platform smart search (M2) — PURE, dependency-light, client-safe helpers
// over the institute email format. Email is the unique identifier everywhere
// (app_user.email citext unique), and a student email encodes identity:
//   <year><level u|p|r><branch><serial>@iitjammu.ac.in   (e.g. 2023ume0243@…)
// These functions back BOTH the server-side coarse narrowing in
// lib/users/admin.mjs#listUsers AND the debounced client-side admin filter, so the
// matching predicate lives in exactly ONE place (no client/server drift). No DB,
// no server-only imports — safe to import from a Client Component.
import { parseInstituteEmail } from "../auth/email.mjs";

const LEVEL_BY_CODE = { u: "ug", p: "pg", r: "research" };
const CODE_BY_LEVEL = { ug: "u", pg: "p", research: "r" };

// Normalize a level filter (accepts the full word 'ug'|'pg'|'research' OR the
// single-char code 'u'|'p'|'r') to the canonical full word; null if unrecognized.
export function normalizeLevel(level) {
  if (!level) return null;
  const l = String(level).trim().toLowerCase();
  if (LEVEL_BY_CODE[l]) return LEVEL_BY_CODE[l];
  if (CODE_BY_LEVEL[l]) return l;
  return null;
}

function levelCode(level) {
  const full = normalizeLevel(level);
  return full ? CODE_BY_LEVEL[full] : null;
}

// The parsed institute identity for a user row ({ email }), or null when the email
// is not a student-format institute address (staff/role mailboxes, externals).
export function userEmailIdentity(user) {
  return parseInstituteEmail(user?.email);
}

// Build the LEADING email prefix implied by (year[, level[, branch]]) — the part
// the DB can narrow with a cheap `startsWith`. Returns null unless a 4-digit year
// anchors it (branch/level alone are not a prefix). branch only contributes when a
// level is also present (it follows the level in the local part).
export function instituteEmailPrefix({ year, level, branch } = {}) {
  const y = year == null ? "" : String(year).trim();
  if (!/^\d{4}$/.test(y)) return null;
  let prefix = y;
  const lc = levelCode(level);
  if (lc) {
    prefix += lc;
    const b = branch ? String(branch).trim().toLowerCase() : null;
    if (b && /^[a-z]{2}$/.test(b)) prefix += b;
  }
  return prefix;
}

// Does a (shaped) user match the smart-search criteria? All provided criteria are
// AND-combined; an absent/empty criterion is ignored. `category` matches a role
// KEY among the user's active roles (the stakeholder-category facet). `q` is a
// case-insensitive substring over email+name. The email-format criteria
// (year/level/branch) require the email to PARSE as an institute student address —
// a non-matching address is excluded when any of them is set.
export function matchesUserFilter(user, { year, level, branch, category, status, q } = {}) {
  if (!user) return false;
  if (status && user.status !== status) return false;
  if (category && !((user.roles ?? []).some((r) => r?.key === category))) return false;
  if (q) {
    const needle = String(q).trim().toLowerCase();
    if (needle) {
      // Per-FIELD match (email OR name), identical to the server's
      // `where.OR=[{email contains},{name contains}]` — so the client and server
      // agree exactly (no boundary-spanning artifact from concatenating fields).
      const email = String(user.email ?? "").toLowerCase();
      const name = String(user.name ?? "").toLowerCase();
      if (!email.includes(needle) && !name.includes(needle)) return false;
    }
  }
  const hasYear = year != null && String(year).trim() !== "";
  if (hasYear || level || branch) {
    const parsed = parseInstituteEmail(user.email);
    if (!parsed) return false;
    if (hasYear && String(parsed.year) !== String(year).trim()) return false;
    if (level) {
      const want = normalizeLevel(level);
      if (!want || parsed.level !== want) return false;
    }
    if (branch && parsed.branch !== String(branch).trim().toLowerCase()) return false;
  }
  return true;
}

// Filter a list of (shaped) users by the criteria.
export function filterUsers(users, criteria = {}) {
  return (users ?? []).filter((u) => matchesUserFilter(u, criteria));
}

// Distinct facet values present in a user list, for populating the filter dropdowns
// (years descending; levels/branches/categories ascending).
export function userFilterFacets(users) {
  const years = new Set();
  const levels = new Set();
  const branches = new Set();
  const categories = new Set();
  for (const u of users ?? []) {
    const p = parseInstituteEmail(u.email);
    if (p) {
      years.add(p.year);
      levels.add(p.level);
      branches.add(p.branch);
    }
    for (const r of u.roles ?? []) if (r?.key) categories.add(r.key);
  }
  return {
    years: [...years].sort((a, b) => b - a),
    levels: [...levels].sort(),
    branches: [...branches].sort(),
    categories: [...categories].sort(),
  };
}
