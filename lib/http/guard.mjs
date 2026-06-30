// HTTP hardening for the state-changing POST routes (Session 10, deploy hardening):
// a same-origin (CSRF) check and a best-effort in-memory rate limiter. Both are
// deliberately dependency-free; the pure decision functions are unit-tested
// (tests/security.test.mjs) and the route handlers wrap them.
import { isIP } from "node:net";

// Best-effort client IP for rate-limit keying / the audit inet column. x-forwarded-
// for may be a comma list; take the first token and only return it if it is a
// STRUCTURALLY VALID IPv4/IPv6 address (net.isIP), so a malformed header can't poison
// the key or fail an inet insert.
export function clientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  const candidate = (xff ? xff.split(",")[0] : req.headers.get("x-real-ip") || "").trim();
  return candidate && isIP(candidate) !== 0 ? candidate : null;
}

// ── CSRF: same-origin check ──────────────────────────────────────────────────
// Cookie-authenticated POST endpoints (/api/admin/action, /api/events) are in
// principle CSRF-able. NextAuth sets SameSite=Lax session cookies (the first line
// of defense); this adds an explicit Origin/Referer check as defense-in-depth.
//
// A browser ALWAYS attaches an Origin header to a cross-origin state-changing
// request, so an Origin that does not match one of the app's own hosts is
// rejected. A request with NEITHER Origin NOR Referer is ALLOWED: that is a
// non-browser API client (e.g. a server-side script POSTing an event), which is
// not a CSRF vector — CSRF requires a cookie-bearing browser, and those always
// send Origin. PURE + tested.

// The host (incl. port) of a URL-ish header value, or null if unparseable.
export function originHost(value) {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

// True when the browser-supplied Origin/Referer host is one of the allowed hosts
// (the request's own Host header + any extra allowlisted hosts). A request with a
// PRESENT-but-opaque/unparseable Origin or Referer (e.g. the literal `Origin: null`
// a sandboxed iframe / data:/blob: document / no-referrer redirect sends) is
// treated as cross-origin and REJECTED — only a request with NEITHER header at all
// (a non-browser API client, which cannot carry the SameSite=Lax session cookie
// and so is not a CSRF vector) short-circuits to allowed.
export function isSameOrigin({ origin, referer, host, allowedHosts = [] }) {
  const provided = origin ?? referer ?? null;
  if (provided === null) return true; // no browser origin at all → not a CSRF vector
  const candidate = originHost(origin) ?? originHost(referer);
  if (!candidate) return false; // header present but opaque/unparseable → reject
  const allowed = new Set([host, ...allowedHosts].filter(Boolean));
  return allowed.has(candidate);
}

// Throw a 403 CSRF error when a request's Origin/Referer is cross-origin. The
// app's own host (from the Host header) plus the NEXTAUTH_URL host are allowed.
export function assertSameOrigin(req, { allowedHosts = [], env = process.env } = {}) {
  const extra = [...allowedHosts];
  const configured = originHost(env.NEXTAUTH_URL);
  if (configured) extra.push(configured);
  const ok = isSameOrigin({
    origin: req.headers.get("origin"),
    referer: req.headers.get("referer"),
    host: req.headers.get("host"),
    allowedHosts: extra,
  });
  if (!ok) {
    const err = new Error("Cross-origin request blocked.");
    err.code = "CSRF_BLOCKED";
    err.status = 403;
    throw err;
  }
}

// ── Rate limiting (best-effort, in-memory) ────────────────────────────────────
// A fixed-window counter keyed by client+route. NOTE: this is PER PROCESS — in a
// multi-instance / serverless deployment each instance keeps its own window, so it
// is a coarse abuse dampener, NOT a strict global quota. For a hard global limit
// use a shared store (Upstash/Redis). Documented in docs/DEPLOYMENT.md.

const DEFAULT_STORE = new Map(); // key -> { count, resetAt }

// Build a rate-limit checker. `check(key, now)` returns { ok, remaining,
// retryAfterMs }. The clock is injectable so the window is testable. PURE state in
// the supplied store (a Map); expired keys are pruned opportunistically so the map
// cannot grow without bound under many distinct clients.
export function makeRateLimiter({ limit = 30, windowMs = 60_000, store = DEFAULT_STORE } = {}) {
  return function check(key, now = Date.now()) {
    if (store.size > 5000) {
      for (const [k, v] of store) if (now >= v.resetAt) store.delete(k);
    }
    const entry = store.get(key);
    if (!entry || now >= entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, remaining: limit - 1, retryAfterMs: 0 };
    }
    if (entry.count >= limit) {
      return { ok: false, remaining: 0, retryAfterMs: entry.resetAt - now };
    }
    entry.count += 1;
    return { ok: true, remaining: limit - entry.count, retryAfterMs: 0 };
  };
}

// Pre-built limiters for the two write surfaces (per-process; see the note above).
// Admin actions come from a small set of authenticated staff (generous); the
// public events POST is tighter.
export const adminActionLimiter = makeRateLimiter({ limit: 60, windowMs: 60_000 });
export const eventsWriteLimiter = makeRateLimiter({ limit: 20, windowMs: 60_000 });
// Public, unauthenticated member-platform endpoints (account/reset requests +
// self-service password change). Tight, keyed by IP — a coarse anti-abuse dampener.
export const accountRequestLimiter = makeRateLimiter({ limit: 10, windowMs: 60_000 });
// Public feedback / support-ticket submissions (M7) — same coarse anti-abuse posture.
export const feedbackLimiter = makeRateLimiter({ limit: 10, windowMs: 60_000 });
// Usage-analytics beacons (M8) — a higher per-IP allowance (a session generates many
// page views), still bounded so a flood can't balloon the page_visit table.
export const usageBeaconLimiter = makeRateLimiter({ limit: 120, windowMs: 60_000 });

// A stable rate-limit key: prefer the authenticated user id (so one abusive
// account is limited regardless of IP), else the client IP, else a constant
// bucket (so an unidentifiable flood is still bounded). Namespaced by route.
export function rateLimitKey(route, { userId, ip } = {}) {
  return `${route}:${userId ?? ip ?? "anon"}`;
}

// Throw a 429 when a limiter denies a key, carrying Retry-After seconds.
export function assertWithinRateLimit(limiter, key) {
  const verdict = limiter(key);
  if (!verdict.ok) {
    const err = new Error("Too many requests — please slow down and try again shortly.");
    err.code = "RATE_LIMITED";
    err.status = 429;
    err.retryAfterSeconds = Math.max(1, Math.ceil(verdict.retryAfterMs / 1000));
    throw err;
  }
}
