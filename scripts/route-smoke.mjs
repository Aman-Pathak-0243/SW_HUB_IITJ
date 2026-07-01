// Route-render smoke test — the "is the hosted site actually up?" check.
//
// The unit + live-DB suites exercise the SERVICE layer; they do not render pages.
// This script hits every real route of a RUNNING server (default http://localhost:3000)
// as an ANONYMOUS visitor and asserts that no page/route returns a 5xx (a crashed
// Server Component / route handler). Gated pages are expected to render a sign-in or
// "access denied" screen (200) or redirect (3xx) — NOT crash — so a 2xx/3xx/401/403/
// 404/405 is a PASS and only a 5xx (or a Next.js error-boundary body) is a FAIL.
//
// Usage:
//   npm run dev            # in one terminal (or `npm run build && npm start`)
//   npm run test:routes    # in another  (== node scripts/route-smoke.mjs)
//   BASE_URL=https://portal.example npm run test:routes   # against a deployed host
//
// It resolves one real dynamic param (org unit, event slug, user id) from the DB when
// DATABASE_URL is available; if the DB is unreachable it skips only those dynamic rows.
// Documented in docs/WEBSITE_TESTING_SOP.md (Layer 2).

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");

// Static, always-present routes. `kind` documents the EXPECTED audience so the
// report is readable; every one of them must NOT 5xx regardless of auth.
const STATIC_ROUTES = [
  // ── public V1/marketing pages ──
  { path: "/", kind: "public" },
  { path: "/Team", kind: "public" },
  { path: "/Contact-Us", kind: "public" },
  { path: "/Flagship-events", kind: "public" },
  { path: "/hostels", kind: "public" },
  { path: "/messes", kind: "public" },
  // ── public data-driven pages ──
  { path: "/announcements", kind: "public" },
  { path: "/past-events", kind: "public" },
  { path: "/wall-of-fame", kind: "public (plugin-gated)" },
  { path: "/org/councils", kind: "public" },
  { path: "/org/clubs", kind: "public" },
  // ── auth / account entry points ──
  { path: "/login", kind: "auth" },
  { path: "/account/request", kind: "auth" },
  { path: "/account/forgot", kind: "auth" },
  { path: "/account/password", kind: "auth (must-change)" },
  { path: "/feedback", kind: "public form" },
  // ── member surfaces (render a sign-in card when logged out) ──
  { path: "/member", kind: "member (sign-in when anon)" },
  { path: "/member/profile", kind: "member (sign-in when anon)" },
  // ── event playground (login-only when plugin ON) ──
  { path: "/events", kind: "events (login-only when plugin ON)" },
  { path: "/events/organized", kind: "events" },
  // ── scoped-coordinator surface (sign-in card when anon; must NOT 5xx) ──
  { path: "/coordinator", kind: "coordinator (sign-in when anon)" },
  { path: "/coordinator/events", kind: "coordinator (gated)" },
  { path: "/coordinator/members", kind: "coordinator (gated)" },
  { path: "/coordinator/contribution", kind: "coordinator (gated)" },
  // ── admin surfaces (sign-in / denied when anon — must NOT 5xx) ──
  { path: "/admin", kind: "admin (gated)" },
  { path: "/admin/content", kind: "admin (gated)" },
  { path: "/admin/organization", kind: "admin (gated)" },
  { path: "/admin/years", kind: "admin (gated)" },
  { path: "/admin/events", kind: "admin (gated)" },
  { path: "/admin/media", kind: "admin (gated)" },
  { path: "/admin/users", kind: "admin (gated)" },
  { path: "/admin/contribution", kind: "admin (gated)" },
  { path: "/admin/requests", kind: "admin (gated)" },
  { path: "/admin/feedback", kind: "admin (gated)" },
  { path: "/admin/mail", kind: "admin (gated)" },
  { path: "/admin/plugins", kind: "developer (gated)" },
  { path: "/admin/console", kind: "developer (gated)" },
  { path: "/admin/devdash", kind: "developer (gated)" },
  // ── API GET endpoints (dev status/audit are gated; expect 401/403/405, never 5xx) ──
  { path: "/api/dev/status", kind: "api (gated)" },
  { path: "/api/dev/audit", kind: "api (gated)" },
  { path: "/api/events/export", kind: "api (gated)" },
];

async function resolveDynamicRoutes() {
  const rows = [];
  let prisma;
  try {
    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
  } catch (e) {
    console.warn(`⚠ Could not load Prisma to resolve dynamic routes (${e.message}); skipping them.`);
    return rows;
  }
  // Resolve each dynamic route independently, so one query failing (e.g. the data not yet
  // imported — KNOWN_ISSUES #27) doesn't skip the others.
  const probe = async (label, fn) => {
    try { await fn(); } catch (e) { console.warn(`⚠ dynamic route "${label}" skipped: ${e.message}`); }
  };
  // One org unit (club/council). `slug` is a required column, so no null filter is needed.
  await probe("/org/[type]/[slug]", async () => {
    const unit = await prisma.orgUnit.findFirst({ select: { slug: true, orgUnitType: { select: { key: true } } } });
    if (unit?.slug) rows.push({ path: `/org/${unit.orgUnitType?.key ?? "clubs"}/${unit.slug}`, kind: "public (org unit page)" });
  });
  // One event content item (any status) — `contentType` is a scalar key column.
  await probe("/events/[slug]", async () => {
    const ev = await prisma.contentItem.findFirst({ where: { contentType: "event" }, select: { slug: true } });
    if (ev?.slug) rows.push({ path: `/events/${ev.slug}`, kind: "events (detail)" });
  });
  // One user id — the admin profile page (gated; must render sign-in/denied, not 500).
  await probe("/admin/users/[id]", async () => {
    const u = await prisma.user.findFirst({ select: { id: true } });
    if (u?.id) rows.push({ path: `/admin/users/${u.id}`, kind: "admin (gated, user profile)" });
  });
  // One event item id — the scoped-coordinator manage page (gated; anon renders sign-in).
  await probe("/coordinator/events/[eventId]", async () => {
    const ev = await prisma.contentItem.findFirst({ where: { contentType: "event" }, select: { id: true } });
    if (ev?.id) rows.push({ path: `/coordinator/events/${ev.id}`, kind: "coordinator (gated, event manage)" });
  });
  await prisma.$disconnect().catch(() => {});
  return rows;
}

function looksLikeCrash(status, body) {
  if (status >= 500) return true;
  // Next.js server-error boundary markers (defensive — a 200 that is actually an error page).
  return /Application error: a server-side exception|Internal Server Error|__NEXT_ERROR__/i.test(body || "");
}

async function hit(route) {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}${route.path}`, {
      redirect: "manual",
      headers: { "user-agent": "route-smoke/1.0" },
    });
    let body = "";
    // Only read the body for 2xx/5xx to sniff for hidden error pages (cheap).
    if (res.status < 400 || res.status >= 500) {
      body = await res.text().catch(() => "");
    }
    const ms = Date.now() - started;
    const fail = looksLikeCrash(res.status, body);
    return { ...route, status: res.status, ms, fail };
  } catch (e) {
    return { ...route, status: 0, ms: Date.now() - started, fail: true, err: e.message };
  }
}

async function main() {
  console.log(`\nRoute-render smoke against ${BASE}\n${"=".repeat(64)}`);
  const dynamic = await resolveDynamicRoutes();
  const routes = [...STATIC_ROUTES, ...dynamic];
  const results = [];
  // Sequential — one dev server, keep it gentle (and Neon per-render latency is high).
  for (const r of routes) results.push(await hit(r));

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad("STATUS", 7)} ${pad("ms", 6)} ${pad("PATH", 34)} kind`);
  console.log("-".repeat(80));
  for (const r of results) {
    const mark = r.fail ? "✗" : "✓";
    const status = r.status === 0 ? "ERR" : r.status;
    console.log(`${mark} ${pad(status, 5)} ${pad(r.ms, 6)} ${pad(r.path, 34)} ${r.kind}${r.err ? " — " + r.err : ""}`);
  }
  const failures = results.filter((r) => r.fail);
  console.log("=".repeat(80));
  console.log(`${results.length} routes · ${results.length - failures.length} ok · ${failures.length} FAIL (5xx / crash)`);
  if (failures.length) {
    console.log("\nFAILURES (investigate — a hosted page is crashing):");
    for (const f of failures) console.log(`  ✗ ${f.status} ${f.path}  (${f.kind})${f.err ? " — " + f.err : ""}`);
    process.exit(1);
  }
  console.log("All routes render without a server crash. ✓");
}

main();
