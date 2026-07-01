// M5 — PURE CSV builders for the event playground downloads (DL-087). No DB / no auth
// here: the export SERVICE (lib/events/downloads.mjs) authorizes + fetches, then calls
// these to serialize. Kept dependency-free + pure so the quoting is unit-tested without
// a DB (RFC-4180-ish: quote a field containing a comma / quote / newline; double quotes).
// A dedicated local csvCell avoids importing the devconsole audit module (which pulls
// prisma) into this pure layer.

export function csvCell(v) {
  if (v == null) return "";
  if (v === true) return "true";
  if (v === false) return "false";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Generic: columns = [{ key, label }]; rows = objects. Returns a CSV string.
export function toCsv(columns, rows = []) {
  const header = columns.map((c) => csvCell(c.label ?? c.key)).join(",");
  const lines = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(","));
  return [header, ...lines].join("\n");
}

export const PARTICIPANT_COLUMNS = [
  { key: "userName", label: "Name" },
  { key: "userEmail", label: "Email" },
  { key: "status", label: "Status" },
  { key: "teamName", label: "Team" },
  { key: "registeredAt", label: "Registered At" },
];
export function participantsToCsv(regs = []) {
  return toCsv(PARTICIPANT_COLUMNS, regs);
}

export const SCORE_COLUMNS = [
  { key: "userName", label: "Name" },
  { key: "userEmail", label: "Email" },
  { key: "round", label: "Round" },
  { key: "points", label: "Points" },
  { key: "note", label: "Note" },
];
export function scoresToCsv(rows = []) {
  return toCsv(SCORE_COLUMNS, rows);
}

export const RANKING_COLUMNS = [
  { key: "rank", label: "Rank" },
  { key: "name", label: "Name" },
  { key: "points", label: "Points" },
];
export function rankingToCsv(rows = []) {
  return toCsv(RANKING_COLUMNS, rows);
}

export const ATTENDANCE_COLUMNS = [
  { key: "userName", label: "Name" },
  { key: "userEmail", label: "Email" },
  { key: "round", label: "Round" },
  { key: "present", label: "Present" },
  { key: "note", label: "Note" },
];
export function attendanceToCsv(rows = []) {
  return toCsv(ATTENDANCE_COLUMNS, rows);
}
