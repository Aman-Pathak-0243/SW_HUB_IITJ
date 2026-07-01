// Club-membership constants + PURE, client-safe validators / CSV parser (M3,
// DL-075). The single source of truth for the status vocabulary and the bulk-CSV
// parse, mirrored by the server service (lib/memberships/service.mjs) so the admin
// UI can validate a pasted CSV before it POSTs without being the authority (the
// DL-051 pattern). No DB / server-only imports.

export const MEMBERSHIP_STATUSES = ["active", "inactive"];
export const MEMBERSHIP_STATUS_SET = new Set(MEMBERSHIP_STATUSES);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_MAX = 80;

// Normalize a role label (trim, cap length) → string or null. PURE.
export function normalizeMembershipRole(role) {
  const r = String(role ?? "").trim();
  if (!r) return null;
  return r.slice(0, ROLE_MAX);
}

// Parse a membership bulk-CSV. Each data line is `email[,role]` — coordinators submit
// a member email list for ONE club; the admin uploads it against that club (the
// service resolves each email → account and syncs the mapping, idempotent by (user,
// lineage)). Skips a header row whose FIRST cell is exactly "email" (case-insensitive).
// Dedups within the file (last role wins is avoided — first occurrence is kept, the
// duplicate is reported). Returns { rows: [{ email, role? }], errors: [{ line, email,
// reason }] }. PURE — no account existence check (that is the server's job).
export function parseMembershipCsv(text) {
  const rows = [];
  const errors = [];
  const seen = new Set();
  // Iterate the RAW split with a true 1-based file-line counter so a blank line or a
  // header before a bad row never shifts the reported `line` (the coordinator sees the
  // real file line to fix). Blank lines are skipped without collapsing the counter.
  let firstData = true;
  String(text ?? "").split(/\r?\n/).forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return; // blank line — skipped, but the file-line counter already advanced
    const lineNo = idx + 1;
    const cols = line.split(",").map((c) => c.trim());
    const rawEmail = cols[0] ?? "";
    if (firstData && rawEmail.toLowerCase() === "email") { firstData = false; return; } // header row
    firstData = false;
    const email = rawEmail.toLowerCase();
    if (!EMAIL_RE.test(email)) {
      errors.push({ line: lineNo, email: rawEmail, reason: "Invalid email address" });
      return;
    }
    if (seen.has(email)) {
      errors.push({ line: lineNo, email, reason: "Duplicate email within the file" });
      return;
    }
    seen.add(email);
    const row = { email };
    const role = normalizeMembershipRole(cols[1]);
    if (role) row.role = role;
    rows.push(row);
  });
  return { rows, errors };
}
