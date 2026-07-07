// Shared, PURE CSV cell serializer (consolidation review B6). One authority for every
// CSV export in the app (event downloads, the Action-Log / Change-History export, and the
// per-table dump) so the quoting rule can't drift and the formula-injection guard is
// applied everywhere. No DB / no imports — unit-testable in isolation.
//
// Two responsibilities:
//  1. RFC-4180-ish quoting: wrap a field in double quotes (and double any embedded quote)
//     when it contains a comma, quote, CR or LF.
//  2. Spreadsheet FORMULA-INJECTION neutralization (CSV injection): a *string* cell whose
//     text begins with one of  = + - @  (or a leading TAB / CR, which Excel also treats as
//     a formula lead-in) is prefixed with a single quote so Excel / Google Sheets render it
//     as literal text and never execute it. Only STRING values are guarded — real numbers
//     (e.g. a negative score of -5) and booleans are our own typed values, not attacker
//     text, so they are serialized as-is.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvCell(v) {
  if (v == null) return "";
  if (v === true) return "true";
  if (v === false) return "false";
  const isString = typeof v === "string";
  let s = isString ? v : typeof v === "object" ? JSON.stringify(v) : String(v);
  if (isString && FORMULA_LEAD.test(s)) s = "'" + s; // neutralize a formula lead-in
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
