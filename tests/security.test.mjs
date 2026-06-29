// Session 10 — deploy hardening: unit tests for the pure decision functions in
// lib/http/guard.mjs (the same-origin/CSRF check and the in-memory rate limiter).
// No DB, no network — these run in the always-green static suite.
import { describe, it, expect } from "vitest";
import {
  originHost,
  isSameOrigin,
  assertSameOrigin,
  makeRateLimiter,
  rateLimitKey,
  assertWithinRateLimit,
} from "../lib/http/guard.mjs";

// A minimal Request-like stub: only headers.get(name) is used by the guard.
function reqWith(headers = {}) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (k) => lower[k.toLowerCase()] ?? null } };
}

describe("originHost", () => {
  it("extracts host:port from a URL", () => {
    expect(originHost("https://portal.example.edu")).toBe("portal.example.edu");
    expect(originHost("http://localhost:3000")).toBe("localhost:3000");
  });
  it("returns null for a missing/garbage value", () => {
    expect(originHost(null)).toBeNull();
    expect(originHost("not a url")).toBeNull();
  });
});

describe("isSameOrigin (CSRF)", () => {
  it("allows a same-origin POST (Origin host == Host header)", () => {
    expect(isSameOrigin({ origin: "https://app.iitj.ac.in", host: "app.iitj.ac.in" })).toBe(true);
  });
  it("blocks a cross-origin POST (Origin host != Host)", () => {
    expect(isSameOrigin({ origin: "https://evil.example.com", host: "app.iitj.ac.in" })).toBe(false);
  });
  it("falls back to Referer when Origin is absent", () => {
    expect(isSameOrigin({ referer: "https://app.iitj.ac.in/admin", host: "app.iitj.ac.in" })).toBe(true);
    expect(isSameOrigin({ referer: "https://evil.example.com/x", host: "app.iitj.ac.in" })).toBe(false);
  });
  it("allows when NO browser origin/referer is present (non-browser API client)", () => {
    expect(isSameOrigin({ host: "app.iitj.ac.in" })).toBe(true);
  });
  it("rejects a PRESENT-but-opaque Origin (literal 'null' / unparseable) rather than treating it as absent", () => {
    expect(isSameOrigin({ origin: "null", host: "app.iitj.ac.in" })).toBe(false);
    expect(isSameOrigin({ origin: "garbage", host: "app.iitj.ac.in" })).toBe(false);
    // falls back to a parseable Referer when Origin is opaque
    expect(isSameOrigin({ origin: "null", referer: "https://app.iitj.ac.in/x", host: "app.iitj.ac.in" })).toBe(true);
  });
  it("honors an extra allowed host (e.g. the configured NEXTAUTH_URL)", () => {
    expect(isSameOrigin({ origin: "https://portal.iitj.ac.in", host: "internal-host", allowedHosts: ["portal.iitj.ac.in"] })).toBe(true);
  });
});

describe("assertSameOrigin", () => {
  it("throws a 403 CSRF_BLOCKED on a cross-origin request", () => {
    let err;
    try {
      assertSameOrigin(reqWith({ origin: "https://evil.com", host: "app.iitj.ac.in" }), { env: {} });
    } catch (e) {
      err = e;
    }
    expect(err).toBeTruthy();
    expect(err.code).toBe("CSRF_BLOCKED");
    expect(err.status).toBe(403);
  });
  it("does not throw on a same-origin request", () => {
    expect(() => assertSameOrigin(reqWith({ origin: "https://app.iitj.ac.in", host: "app.iitj.ac.in" }), { env: {} })).not.toThrow();
  });
  it("allows a cross-origin host that matches NEXTAUTH_URL", () => {
    expect(() =>
      assertSameOrigin(reqWith({ origin: "https://portal.iitj.ac.in", host: "10.0.0.5" }), { env: { NEXTAUTH_URL: "https://portal.iitj.ac.in" } })
    ).not.toThrow();
  });
});

describe("makeRateLimiter (fixed window)", () => {
  it("allows up to the limit then denies, with a retry-after", () => {
    const store = new Map();
    const limiter = makeRateLimiter({ limit: 3, windowMs: 1000, store });
    expect(limiter("k", 0).ok).toBe(true);
    expect(limiter("k", 10).ok).toBe(true);
    expect(limiter("k", 20).ok).toBe(true);
    const denied = limiter("k", 30);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });
  it("resets after the window elapses", () => {
    const store = new Map();
    const limiter = makeRateLimiter({ limit: 1, windowMs: 1000, store });
    expect(limiter("k", 0).ok).toBe(true);
    expect(limiter("k", 500).ok).toBe(false);
    expect(limiter("k", 1000).ok).toBe(true); // new window
  });
  it("tracks distinct keys independently", () => {
    const store = new Map();
    const limiter = makeRateLimiter({ limit: 1, windowMs: 1000, store });
    expect(limiter("a", 0).ok).toBe(true);
    expect(limiter("b", 0).ok).toBe(true); // different key, own window
    expect(limiter("a", 0).ok).toBe(false);
  });
});

describe("rateLimitKey", () => {
  it("prefers userId, then ip, then anon — namespaced by route", () => {
    expect(rateLimitKey("admin.action", { userId: "u1", ip: "1.2.3.4" })).toBe("admin.action:u1");
    expect(rateLimitKey("events.write", { ip: "1.2.3.4" })).toBe("events.write:1.2.3.4");
    expect(rateLimitKey("events.write", {})).toBe("events.write:anon");
  });
});

describe("assertWithinRateLimit", () => {
  it("throws a 429 RATE_LIMITED with retryAfterSeconds once the limit is hit", () => {
    const store = new Map();
    const limiter = makeRateLimiter({ limit: 1, windowMs: 60000, store });
    expect(() => assertWithinRateLimit(limiter, "x")).not.toThrow();
    let err;
    try {
      assertWithinRateLimit(limiter, "x");
    } catch (e) {
      err = e;
    }
    expect(err.code).toBe("RATE_LIMITED");
    expect(err.status).toBe(429);
    expect(err.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
