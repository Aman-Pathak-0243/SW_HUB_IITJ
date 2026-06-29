# Operations Runbook — IIT Jammu Student Affairs Portal V2

The single operator entry point: **deploy, configure, seed, import data, manage
admins, observe, recover.** It assumes zero prior context — a future student should
be able to run the whole project from this file plus the docs it links.

> Build stack: **Next.js 16 (App Router) · React 19 · Prisma 6 · PostgreSQL (Neon)
> · NextAuth v4 · Cloudinary**. Built across 10 sessions (see
> [SESSION_PROTOCOL.md](SESSION_PROTOCOL.md)); architecture in
> [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md), schema in
> [SCHEMA_DESIGN.md](SCHEMA_DESIGN.md), every major decision in
> [DECISION_LOG.md](DECISION_LOG.md).

---

## 0. Golden rules (read once)

- **Never** run `prisma db pull`, `prisma migrate reset`, or `npm run db:reset`
  against the real database. Raw-SQL objects (partial uniques, triggers, CHECKs)
  live in migrations and are invisible to Prisma drift detection — a reset/pull
  destroys data and/or the guards. Schema changes are **new forward migrations**
  (`CREATE OR REPLACE`), applied with `npm run db:migrate` (DL-027/036).
- The Prisma CLI reads **`.env`**, not `.env.local`. Always use the **`db:*` npm
  scripts** (they wrap commands in `dotenv -e .env.local`) so the right
  credentials are used.
- **Secrets only in git-ignored `.env.local`** (never commit). `env.example` holds
  placeholders. See [SECURITY.md](SECURITY.md).
- Neon has **high per-query latency and auto-suspends**. First request after idle
  is slow / can transiently fail with "Can't reach database server" — retry once.
  The app and live tests are built to tolerate this.

---

## 1. Production environment checklist

Set these in the deploy environment (or `.env.local` for a self-hosted box). All
are required unless marked optional.

| Variable | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | App runtime DB (pooled) | Neon **-pooler** host; append `?sslmode=require&channel_binding=require&pgbouncer=true` |
| `DIRECT_URL` | `prisma migrate` (unpooled) | Neon **non**-pooler host; `?sslmode=require` (migrations don't work through the pooler) |
| `NEXTAUTH_SECRET` | Signs the JWT session | **Generate fresh per environment:** `openssl rand -base64 32`. A weak/shared secret forges sessions. |
| `NEXTAUTH_URL` | Canonical app origin | e.g. `https://portal.iitjammu.ac.in`. Used by NextAuth **and** the CSRF same-origin check (`lib/http/guard.mjs`) — must be the real public origin. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth login | See §1.1 for the redirect URI. |
| `CLOUDINARY_CLOUD_NAME` | Build/deliver media URLs | Cloud name **alone** is enough to serve images; a dry-run media migration needs nothing more. |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Signed uploads | Required **only** for `db:migrate:media -- --apply`. |
| `CLOUDINARY_UPLOAD_FOLDER` | Migrated public_id prefix | Optional (default `iitj-portal`). |
| `BOOTSTRAP_DEVELOPER_EMAIL` | First developer account | Used by `db:seed`. Default `developer@iitjammu.ac.in`. |
| `BOOTSTRAP_DEVELOPER_PASSWORD` | Optional dev password | If unset, the developer is OAuth-only (sign in with Google). |
| `BOOTSTRAP_ADMIN_EMAILS` | Comma-list of super-admins | Each is created `active` + granted `super_admin`. |

### 1.1 Google OAuth redirect URIs

In the Google Cloud console (OAuth 2.0 client), set **Authorized redirect URIs**:

- Local: `http://localhost:3000/api/auth/callback/google`
- Production: `https://<your-domain>/api/auth/callback/google`

and **Authorized JavaScript origins** to the bare origins (`http://localhost:3000`,
`https://<your-domain>`). A mismatch is the usual "redirect_uri_mismatch" login
failure.

### 1.2 Security posture (already in code)

- **Response headers** (`next.config.mjs#headers`): `X-Content-Type-Options`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, HSTS.
  A full Content-Security-Policy is **not** set (the public components use inline
  `<style>`; a strict CSP needs a nonce pipeline) — tracked as future hardening.
- **CSRF**: the cookie is `SameSite=Lax` (NextAuth) **and** the two write routes
  (`POST /api/admin/action`, `POST /api/events`) reject cross-origin browser POSTs
  (`lib/http/guard.mjs#assertSameOrigin`). This is why `NEXTAUTH_URL` must be the
  real origin.
- **Rate limiting**: both write routes have a best-effort in-memory limiter
  (admin 60/min per account, events 20/min). **It is per-process** — in a
  multi-instance/serverless deploy each instance has its own window, so it is a
  coarse abuse dampener, not a global quota. For a hard global limit put a shared
  store (Upstash/Redis) behind `makeRateLimiter`.

---

## 2. First-time setup (fresh database, one time)

```bash
# 0) install
npm ci

# 1) apply the schema + all forward migrations (uses DIRECT_URL)
npm run db:migrate

# 2) seed: academic year 2025-26, 40 permissions, 5 roles, org types/positions,
#    content types, and the bootstrap developer/admin accounts.
BOOTSTRAP_DEVELOPER_EMAIL=you@iitjammu.ac.in \
BOOTSTRAP_DEVELOPER_PASSWORD='a-strong-password' \
BOOTSTRAP_ADMIN_EMAILS='colleague@iitjammu.ac.in' \
npm run db:seed
```

You can now sign in at `/admin` with that email (password or Google). Full RBAC /
role details: [ADMIN_PANEL_GUIDE.md](ADMIN_PANEL_GUIDE.md).

---

## 3. Populate the live current year (idempotent operator steps)

These migrate the V1 dataset into the current academic year. **Order matters**
(events/resources bind to org units). All are idempotent (re-runs create 0) and
resumable. Run from the project root.

```bash
# 3a) org structure: 4 councils, 30 clubs, 6 hostels, 5 messes, mess committee
#     + their profile content + people + appointments. ~15 min on Neon.
npm run db:import:org

# 3b) the 3 backed-up events (run any time after the DB is seeded)
npm run db:import:events

# 3c) per-unit resources (PDFs / Drive links) — run AFTER db:import:org
npm run db:import:resources
```

> Until `db:import:org` has run, the public `/org/*` pages (and the Header's
> council links → `/org/councils/<slug>`) render an empty "not available for the
> current year" state. That is the correct data-driven behavior, **not** a bug —
> the pages light up the moment the import completes.

### 3.1 Media migration (`/public` → Cloudinary)

Optional but recommended (shrinks the deployed bundle, KNOWN_ISSUES #18). Needs
`CLOUDINARY_*` set. **Idempotent + reversible + dry-run-first.**

```bash
# preview the plan (no writes) — the default
npm run db:migrate:media
# actually upload + repoint the media_asset rows
npm run db:migrate:media -- --apply
# reverse it (restores local URLs; does not delete remote assets)
npm run db:migrate:media -- --rollback
```

**Pruning `/public` (KNOWN_ISSUES #18) — do NOT do blindly.** After a verified
`--apply`, the migrated `media_asset` rows resolve to Cloudinary, but some V1
pages still **hardcode** `/public` paths (e.g. the homepage hero images
`/hero*.jpg` in `app/page.js`, which are not `media_asset` rows). Before deleting
anything under `public/`:
1. Confirm `--apply` succeeded and the live pages render (Developer Console →
   Media shows the migration as complete).
2. Repoint the remaining hardcoded `/public` references (grep `app/` for `"/`
   image srcs) to Cloudinary, or keep just those files.
3. Then delete only the migrated, now-unreferenced files. Keep the originals until
   you are sure rollback is no longer needed (rollback relies on them).

---

## 4. Deploy

### Build

```bash
npm ci
npm run build      # next build (Turbopack). Emits a benign NFT tracing note for
                   # the dev-console fs reads — see KNOWN_ISSUES #32; build succeeds.
npm start          # production server on PORT (default 3000)
```

`next build` instantiates the Prisma client at import time but does **not**
connect, so a build can run with any well-formed `DATABASE_URL` string; the live
DB is only touched at request time.

### Self-hosted (PM2 — the V1 topology)

```bash
cd ~/IIT-JAMMU-STUDENT-WELFARE
git pull origin main
npm ci
npm run db:migrate     # apply any NEW forward migrations (safe, additive)
npm run build
pm2 restart student-welfare && pm2 save
```

### Vercel / serverless

Set all §1 env vars in the project settings. The dev-console fs reads
(migrations dir + `docs/Token_Usage.md`) are bundled via
`outputFileTracingIncludes` (`next.config.mjs`); if a file is ever missing the
readers degrade to a `{ error }` marker rather than crashing (DL-048). Put a
shared rate-limit store behind `lib/http/guard.mjs` if you need a global limit
(see §1.2).

### CI

`.github/workflows/ci.yml` runs the **static** suite + lint + build on every
push/PR (no DB needed). The **live-DB** suite runs nightly / on manual dispatch
and only when a `DATABASE_URL` repo secret is configured. `.github/workflows/
secret-scan.yml` runs gitleaks.

---

## 5. Manage admins & roles

Everything is in the panel — see [ADMIN_PANEL_GUIDE.md](ADMIN_PANEL_GUIDE.md).
In short: **Users & Roles** (`/admin/users`) → create users, grant/revoke roles,
edit role permissions. Only a **developer** can mint another developer or grant a
`grants_all`/system role (DL-049). You cannot suspend your own account.

---

## 6. Observe & recover

- **Developer Console** (`/admin/console`): system status (DB health, migration
  diff, transition history, media-migration plan), testing + cost reports, the
  audit-log viewer (filter/paginate/drill-down), the backup ledger, and recovery
  actions (media-migration rollback dry-run, transition force re-sync).
- **CLI** (no UI needed): `npm run db:console` and `npm run db:console -- --audit`.
- **Recovery delegates** route through the existing, tested services — there is no
  separate rollback pipeline (DL-046). Media rollback = §3.1 `--rollback`; a
  partial year-transition is re-run/force-resynced via the Academic Years module.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Login "redirect_uri_mismatch" | Google OAuth redirect URI ≠ `<origin>/api/auth/callback/google` (§1.1). |
| Login works but every action is denied | The account has no roles — grant one in Users & Roles. Authorization is live per request (DL-019), so it takes effect on the next request. |
| `/org/*` pages empty | `db:import:org` hasn't run for the current year (§3). |
| First request slow / "Can't reach database server" | Neon cold-start/auto-suspend — retry once. Not a logic error. |
| `prisma migrate` "can't reach database" | You're using the pooled host — migrations need `DIRECT_URL` (non-pooler). Use `npm run db:migrate`. |
| 429 on admin save | Rate limiter (§1.2). Wait the `Retry-After` seconds. |
| 403 "Cross-origin request blocked" on a POST | `NEXTAUTH_URL` doesn't match the real origin, or a proxy strips/rewrites Origin — set `NEXTAUTH_URL` correctly (§1). |

---

## 8. Owner-owned (out-of-band, not blocking)

- Rotate/remove the V1 leaked secrets still in the root `README.md` and purge
  history (KNOWN_ISSUES #1, [runbooks/git-history-purge.md](runbooks/git-history-purge.md));
  consider rotating the Neon password (#19). After rotation, remove the
  by-SHA allowlist in `.gitleaks.toml`.
