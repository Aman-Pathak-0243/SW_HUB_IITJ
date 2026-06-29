# Deployment

> **For the full operator procedure (env checklist, setup, imports, deploy,
> admins, recovery, troubleshooting) use [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md).**
> This file is the lighter background note on build/run + the V1→V2 deployment
> evolution. Session 10 added the production hardening summarized at the bottom.

This documents how the project is built and run, based on `package.json`,
`README.md`, and config files.

## Build & run scripts (`package.json`)

```json
"scripts": {
  "dev":   "next dev",
  "build": "next build",
  "start": "next start"
}
```

- **Dev:** `npm run dev` (Next.js dev server, Turbopack — see `next.config.mjs`).
- **Prod build:** `npm run build` then `npm start` (Next.js production server).

## Deployment method (from `README.md`)

The committed `README.md` describes a **self-hosted, PM2-managed** deployment
(not Vercel), paraphrased:

1. `cd ~/IIT-JAMMU-STUDENT-WELFARE`
2. `git pull origin main`
3. `npm install` (if deps changed)
4. `npm run build` (mandatory for production)
5. `pm2 restart student-welfare`
6. `pm2 save`

So the production app is run under **PM2** as a process named `student-welfare`,
on a server where the repo is cloned to `~/IIT-JAMMU-STUDENT-WELFARE`.

> ⚠️ `README.md` also contains leaked secrets — see [SECURITY.md](SECURITY.md).
> Those must be removed/rotated; the deploy steps themselves can stay (cleaned up).

## Configuration

### `next.config.mjs`
- `images.remotePatterns`: `res.cloudinary.com` only (the unused unsplash hosts
  were removed — KNOWN_ISSUES #17); `images.formats`: AVIF/WebP.
- `headers()`: the security headers (see the hardening section below).
- `outputFileTracingIncludes`: bundles the dev-console fs reads (#32).
- `turbopack.resolveAlias`: aliases `canvas` → `./empty-module.js` (a stub) so
  pdf.js (which optionally pulls in the Node `canvas` package) bundles cleanly in
  the browser build.

### Environment variables (required at runtime)
The full V2 list (DB, auth, Cloudinary, bootstrap) with notes is in
[OPERATIONS_RUNBOOK.md §1](OPERATIONS_RUNBOOK.md) and `env.example`. In brief:
`DATABASE_URL` + `DIRECT_URL` (Neon), `NEXTAUTH_SECRET` + `NEXTAUTH_URL`,
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `CLOUDINARY_*`, and the
`BOOTSTRAP_*` seed vars. MongoDB is retired from the request path (Mongoose remains
only for the read-only backup script). No `.env` is committed; the host provides these.

## External dependencies (must be reachable in prod)

- **PostgreSQL on Neon** (via `DATABASE_URL` pooled + `DIRECT_URL` direct).
- **Google OAuth** consent screen / credentials (for `/admin` login).
- **Cloudinary** (image + PDF delivery for media).
- ~~MongoDB~~ — retired from the request path (V2 is fully on Postgres); Mongoose
  remains only for the read-only `scripts/export-events.mjs` backup tool.

## What is NOT present

- **No Dockerfile / container** config.
- **No reverse-proxy / Nginx** config in the repo (likely lives on the server,
  outside version control).
- **No health-check endpoint** (V2 adds one for the Developer Console).
- **No staging environment** documented.

## Risks / notes for V2

- Manual `git pull` + `pm2 restart` is error-prone and has no rollback. V2's
  Developer Console proposes deployment status + rollback tooling (see
  [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md)).
- `public/` is ~74 MB of images shipped with the app; moving media to Cloudinary
  (V2 media tool) reduces build/deploy size.
- The PM2 process name and server path are the only evidence of the runtime
  topology; confirm with the operator (Aman Pathak, per the footer credits) and
  expand this doc once verified.

## V2 deployment hardening (Session 10 — implemented)

- **CI pipeline** — `.github/workflows/ci.yml`: static test suite + `npm run lint`
  (eslint) + `next build` on every push/PR; the live-DB suite runs nightly / on
  manual dispatch only when a `DATABASE_URL` secret exists. (`next lint` was
  removed in Next 16, so lint is the ESLint CLI via `npm run lint`.)
- **Security headers** — `next.config.mjs#headers()` sets `X-Content-Type-Options`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, and HSTS
  on all routes. A strict Content-Security-Policy is deferred (the public
  components inject inline `<style>`; a CSP needs a nonce pipeline) — the one
  remaining hardening item.
- **CSRF + rate limiting** — `lib/http/guard.mjs`: a same-origin check and a
  best-effort in-memory rate limiter on `POST /api/admin/action` (60/min/account)
  and `POST /api/events` (20/min). The limiter is **per-process** — front it with a
  shared store (Upstash/Redis) for a hard global limit in a multi-instance deploy.
- **Serverless tracing** — `outputFileTracingIncludes` bundles the dev-console fs
  reads (`prisma/migrations/**`, `docs/Token_Usage.md`); those readers also degrade
  to `{ error }` if a file is missing (DL-048). The benign Turbopack NFT over-trace
  note is accepted (KNOWN_ISSUES #32).
- **Status/observability** — the Developer Console (`/admin/console`) provides DB
  health, migration diff, transition history, media-plan, audit viewer, backup
  ledger, and cost/infra estimates (Sessions 8–9).
- **Image/CWV** — Cloudinary `f_auto,q_auto` on public-page images +
  `next/image` `sizes` + AVIF/WebP negotiation.

### Still open (owner / future)

- Rotate + purge the V1 leaked `README.md` secrets; then drop the `.gitleaks.toml`
  by-SHA allowlist (KNOWN_ISSUES #1/#19).
- Prune `/public` after a verified media migration + repointing the hardcoded V1
  hero paths (KNOWN_ISSUES #18 — see the runbook §3.1).
- A reverse-proxy / container / PM2 ecosystem file and a CSP nonce pipeline.
