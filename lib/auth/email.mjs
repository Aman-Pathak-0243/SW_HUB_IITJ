// Shared email normalization/validation (M0). The app_user.email column is citext
// (case-insensitive unique); we still trim whitespace and require a single @ with a
// dotted host. PURE + dependency-free so both the users service and the notification
// queue (and the client forms, via lib/admin/forms.mjs) can agree on one rule.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Trim + validate. Returns the cleaned email, or null when invalid.
export function normalizeEmail(raw) {
  const email = String(raw ?? "").trim();
  if (!email || !EMAIL_RE.test(email)) return null;
  return email;
}

// The IIT Jammu institutional email shape:
//   <year><level u|p|r><branch><serial>@iitjammu.ac.in   (e.g. 2023ume0243@…)
// A pure PARSER used by the M2 smart search; defined here in M0 so the email rule
// lives in one place. Returns the parsed parts or null when the local part /
// domain don't match. (Domain check is lenient: any iitjammu.ac.in host.)
const IITJ_LOCAL_RE = /^(\d{4})([upr])([a-z]{2})(\d{3,4})$/;

export function parseInstituteEmail(raw) {
  const email = normalizeEmail(raw);
  if (!email) return null;
  const [local, host] = email.toLowerCase().split("@");
  if (host !== "iitjammu.ac.in") return null;
  const m = IITJ_LOCAL_RE.exec(local);
  if (!m) return null;
  const levelMap = { u: "ug", p: "pg", r: "research" };
  return {
    email,
    year: Number(m[1]),
    level: levelMap[m[2]],
    levelCode: m[2],
    branch: m[3],
    serial: m[4],
  };
}
