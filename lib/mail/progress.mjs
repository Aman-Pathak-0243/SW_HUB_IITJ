// Bulk-mail rate-limiting + progress accounting (M8, DL-073) — PURE, client-safe
// helpers (no nodemailer / DB), so the "X of Y sent; you can send N more now"
// progress bar logic is unit-tested and shared by the server send loop AND the UI.

export const DEFAULT_RATE_PER_MINUTE = 60; // institute-VM-friendly default

// Split recipients into rate-sized batches (one batch sends per rolling minute).
export function chunk(arr = [], size = DEFAULT_RATE_PER_MINUTE) {
  const n = Math.max(1, Math.floor(size) || 1);
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// How many more may be sent in the CURRENT fixed window ("you can send N more now").
export function remainingAllowance({ limit = DEFAULT_RATE_PER_MINUTE, sentInWindow = 0 } = {}) {
  return Math.max(0, Math.floor(limit) - Math.floor(sentInWindow));
}

// A progress snapshot for the bar. percent is integer 0..100 over total.
export function mailProgress({ total = 0, sent = 0, failed = 0 } = {}) {
  const done = sent + failed;
  const remaining = Math.max(0, total - done);
  // FLOOR (not round) so the bar only reads 100% when every recipient is actually
  // done — Math.round would show 100% at >= 99.5% with sends still pending (review).
  const percent = total > 0 ? (done >= total ? 100 : Math.floor((done / total) * 100)) : 0;
  return { total, sent, failed, done, remaining, percent };
}

// De-dupe + lightly validate a recipient list (lowercased, unique, syntactically
// email-ish). Returns { valid, invalid }.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function normalizeRecipients(list = []) {
  const seen = new Set();
  const valid = [];
  const invalid = [];
  for (const raw of list ?? []) {
    const e = String(raw ?? "").trim().toLowerCase();
    if (!e) continue;
    if (!EMAIL_RE.test(e)) { invalid.push(raw); continue; }
    if (seen.has(e)) continue;
    seen.add(e);
    valid.push(e);
  }
  return { valid, invalid };
}
