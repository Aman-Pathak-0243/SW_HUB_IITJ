# IIT Jammu — Student Affairs Portal

The official portal of the Office of Student Affairs (Student Affairs Council) at
IIT Jammu. It is both a **public institutional website** — councils, clubs, hostels,
messes, the team, flagship events, and announcements — and a **member platform**:
authenticated accounts, role-based access control, a content-management system, an
events playground, live quizzes/leaderboards, and coordinator / admin / developer
back-offices.

- **Stack:** Next.js 16 (App Router) · React 19 · PostgreSQL + Prisma · NextAuth v4 · Tailwind CSS v4 · Cloudinary · optional Redis
- **Status:** Feature-complete. See [`CURRENT_STATUS.md`](CURRENT_STATUS.md) for the live snapshot and [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) for open items.
- **Academic year of the current data set:** 2025–26.

> **Full documentation lives in [`docs/`](docs/README.md)** — this README is the
> entry point and the deploy guide. For anything deeper, follow the links in
> [Documentation](#documentation).

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Documentation](#documentation)
- [Prerequisites](#prerequisites)
- [Quick start (local development)](#quick-start-local-development)
- [Environment variables](#environment-variables)
- [Database: migrate, seed, import](#database-migrate-seed-import)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [npm scripts reference](#npm-scripts-reference)
- [Security](#security)
- [Credits & license](#credits--license)

---

## Features

Everything under the member platform is gated behind a single `member_platform`
feature flag (toggle with `npm run plugin:on` / `plugin:off`).

- **Public website** — home, team directory, hostels, messes, contact; data-driven
  announcements, past/upcoming events, flagship events, and the organization
  structure (`/org/councils`, `/clubs`, `/hostels`, `/messes`) with tabbed unit
  pages. Markdown content is rendered through an escape-first, XSS-safe renderer.
- **Authentication & accounts** — email/password sign-in (Argon2id hashing) with
  optional Google OAuth, password policy, forced first-login password change,
  account lifecycle (active / inactive / revoked), admin-mediated resets, and an
  account-request queue.
- **RBAC** — a ~50-permission catalog, seeded roles, per-email permission
  overrides, and scoped (jurisdiction-aware) grants for coordinators.
- **CMS** — schema-driven content types with draft/publish, version history +
  restore, revision diff, visibility rules, a central audit trail, and inline
  edit-on-page for authorized editors.
- **Events playground** — event listings/detail, self-service registration with
  capacity → waitlist → auto-promote, rounds, scoring, ranking, attendance,
  closure reports, and CSV exports.
- **Live / real-time** — live quizzes with a server-authoritative timer and
  scoring, and live leaderboards, delivered over self-hosted SSE (optional Redis
  fan-out for large audiences; Postgres is the source of truth).
- **Coordinator surface** — a scoped `/coordinator` back-office for managing the
  units, events, and members within a coordinator's jurisdiction.
- **Admin panel** — RBAC-gated UI over all services; user & role administration,
  CSV import, content management. See [`docs/ADMIN_PANEL_GUIDE.md`](docs/ADMIN_PANEL_GUIDE.md).
- **Developer console** — system status, audit-log viewer, monitoring, cost/test
  reports, per-table storage thresholds, and a backup ledger with recovery delegates.
- **Members, Wall of Fame & resources** — member profiles and contribution
  aggregation, an achievements/Wall-of-Fame surface, and a resource library.
- **Academic-year rollover** — a transition wizard to roll the portal from one
  academic year to the next. See [`ACADEMIC_YEAR_ROLLOVER.md`](ACADEMIC_YEAR_ROLLOVER.md).

For the end-user walkthrough see [`USER_MANUAL.md`](USER_MANUAL.md); for the client
handover notes see [`CLIENT_INSTRUCTIONS.md`](CLIENT_INSTRUCTIONS.md).

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19 |
| Database | PostgreSQL 16 — Neon (serverless) or self-hosted — via Prisma 6 |
| Auth | NextAuth v4 (Credentials + optional Google OAuth), Argon2id password hashing |
| Styling | Tailwind CSS v4 |
| Media | Cloudinary (delivery + signed uploads) |
| Real-time | Self-hosted SSE; optional Redis 7 (`ioredis`) for cross-instance fan-out |
| Testing | Vitest (unit + live-DB suites) |
| Runtime / ops | Node.js 20+; PM2 process manager; Docker Compose for infra |

---

## Documentation

The `docs/` directory is the single source of truth. Start at
[`docs/README.md`](docs/README.md) for the full index. The most useful entries:

| To… | Read |
|---|---|
| Understand what the portal is and who it serves | [`docs/PROJECT_OVERVIEW.md`](docs/PROJECT_OVERVIEW.md) |
| **Deploy & operate it** (env, setup, imports, admins, recovery) | [`docs/OPERATIONS_RUNBOOK.md`](docs/OPERATIONS_RUNBOOK.md) |
| See the build/run background & config notes | [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) |
| Set up locally and extend the code | [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) |
| Learn the data model | [`docs/SCHEMA_DESIGN.md`](docs/SCHEMA_DESIGN.md) · [`docs/DATABASE_DESIGN.md`](docs/DATABASE_DESIGN.md) |
| Understand auth & permissions | [`docs/AUTHENTICATION_AND_RBAC.md`](docs/AUTHENTICATION_AND_RBAC.md) |
| Review the API surface | [`docs/API_SPECIFICATION.md`](docs/API_SPECIFICATION.md) |
| Use the admin panel | [`docs/ADMIN_PANEL_GUIDE.md`](docs/ADMIN_PANEL_GUIDE.md) |
| Use the developer CLI | [`docs/DEV_CLI.md`](docs/DEV_CLI.md) |
| Understand the testing gate | [`docs/TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md) · [`docs/WEBSITE_TESTING_SOP.md`](docs/WEBSITE_TESTING_SOP.md) |
| Back up / restore / roll back | [`docs/BACKUP_AND_RECOVERY.md`](docs/BACKUP_AND_RECOVERY.md) |
| Review the security posture | [`docs/SECURITY.md`](docs/SECURITY.md) |
| See the architecture & decisions | [`docs/CURRENT_ARCHITECTURE.md`](docs/CURRENT_ARCHITECTURE.md) · [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md) |
| See production sizing / server requirements | [`systemRequirements.md`](systemRequirements.md) |
| **Run event simulations / hand a self-service kit to the client** | [`simulations/README.md`](simulations/README.md) |

**Live tracking files** (repository root, updated every milestone):
[`CURRENT_STATUS.md`](CURRENT_STATUS.md) · [`TODO.md`](TODO.md) ·
[`KNOWN_ISSUES.md`](KNOWN_ISSUES.md) · [`PROGRESS.md`](PROGRESS.md) ·
[`docs/CHANGELOG.md`](docs/CHANGELOG.md).

---

## Prerequisites

- **Node.js 20 LTS or newer** (developed and tested on 22.x) and **npm**.
- **PostgreSQL 16** — either a Neon project or a local/self-hosted instance
  (Docker Compose files are provided).
- **Docker + Docker Compose** — for the provided Postgres (and optional Redis).
- A **Cloudinary** account for media (a cloud name is enough to serve existing
  assets; API key/secret are needed only to upload).

---

## Quick start (local development)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp env.example .env.local        # then fill in real values (see below)

# 3. Start a local Postgres (Docker) — database `iitj`
npm run db:local:up

# 4. Apply migrations and seed the bootstrap developer/admin accounts
npm run db:migrate
npm run db:seed

# 5. Run the dev server
npm run dev                      # http://localhost:3000
```

Generate a signing secret for `NEXTAUTH_SECRET` with `openssl rand -base64 32`.
The developer/super-admin accounts created by the seed come from the `BOOTSTRAP_*`
variables — see [`docs/OPERATIONS_RUNBOOK.md`](docs/OPERATIONS_RUNBOOK.md).

---

## Environment variables

All configuration is via environment variables. Copy [`env.example`](env.example)
to `.env.local` and fill in real values — **never commit real secrets**
(`.gitignore` excludes `.env*`).

| Variable | Required | Purpose |
|---|:---:|---|
| `DATABASE_URL` | ✅ | Pooled Postgres connection used by the app at runtime |
| `DIRECT_URL` | ✅ | Direct (unpooled) connection used by `prisma migrate` |
| `NEXTAUTH_SECRET` | ✅ | NextAuth signing/encryption key — **set this; if unset, auth is insecure** |
| `NEXTAUTH_URL` | ✅ | Canonical app URL (e.g. `https://portal.example.edu`) |
| `CLOUDINARY_CLOUD_NAME` | ✅ | Cloudinary account for media delivery |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | ⛅ | Needed only for signed uploads / media migration |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | ⛅ | Optional Google OAuth sign-in |
| `REDIS_URL` | ⛅ | Optional — cross-instance live-quiz fan-out (also `npm install ioredis`) |
| `BOOTSTRAP_DEVELOPER_EMAIL` | ✅ | Seed: the developer super-user account |
| `BOOTSTRAP_DEVELOPER_PASSWORD` | ⛅ | Optional — if unset, the developer signs in via Google OAuth |
| `BOOTSTRAP_ADMIN_EMAILS` | ⛅ | Seed: comma-separated super-admin emails |

> **Neon note:** for Prisma + Neon's PgBouncer pooler, append `pgbouncer=true` to
> `DATABASE_URL` and use the non-pooler host for `DIRECT_URL`. See the annotated
> [`env.example`](env.example) for exact connection-string shapes.

---

## Database: migrate, seed, import

```bash
npm run db:generate        # regenerate the Prisma client after schema changes
npm run db:migrate         # apply migrations (prisma migrate deploy — the prod path)
npm run db:seed            # seed roles, permissions, and bootstrap accounts
npm run db:studio          # open Prisma Studio to inspect data
```

Optional data importers (V1 → V2):

```bash
npm run db:import:org        # organization structure (councils/clubs/hostels/messes)
npm run db:import:events     # events + announcements
npm run db:import:resources  # resource library
npm run db:seed:flagship     # flagship-event content
npm run db:migrate:media     # migrate /public assets → Cloudinary (add -- --apply to upload)
```

> ⚠️ Use `db:migrate` (`prisma migrate deploy`) in production — **never**
> `db:migrate:dev` or `db:reset` against a live database; they can generate
> destructive migrations or wipe data.

---

## Testing

```bash
npm test            # unit suites (DB-backed suites self-skip) — the default gate
npm run test:db     # live-DB suites against a local Postgres (per-file, single-fork)
npm run test:routes # route-render smoke test
npm run lint        # ESLint
```

The live-DB suites run against the Docker Postgres defined in
[`docker-compose.yml`](docker-compose.yml) (database `iitj_test`, driven by
`.env.test`):

```bash
npm run db:local:up        # start the test Postgres
npm run db:local:setup     # migrate + seed the test DB
npm run test:db            # run every live-DB suite against it
```

See [`docs/TESTING_STRATEGY.md`](docs/TESTING_STRATEGY.md) for the full gate and
why the live suites run per-file.

---

## Deployment

The portal is a standard Next.js production server (`next build` → `next start`)
run under **PM2**, with PostgreSQL (and optional Redis) provided by Docker.
For the complete operator procedure — env checklist, first-boot, imports, admin
setup, backups, and recovery — follow
[`docs/OPERATIONS_RUNBOOK.md`](docs/OPERATIONS_RUNBOOK.md).

### Recommended: self-hosted single VM

Production infrastructure is defined in
[`docker-compose.prod.yml`](docker-compose.prod.yml): a hardened Postgres 16 and an
optional Redis 7, both bound to `127.0.0.1` only. See [`systemRequirements.md`](systemRequirements.md)
for sizing and firewall rules.

```bash
# 1. Provide the Postgres password as a Docker secret (git-ignored)
mkdir -p secrets && printf '%s' 'STRONG_DB_PASSWORD' > secrets/pg_password.txt

# 2. Start the production Postgres (+ Redis, if you run live quizzes at scale)
docker compose -f docker-compose.prod.yml up -d

# 3. On the app host, create .env.local with production values
#    (DATABASE_URL/DIRECT_URL pointing at the loopback Postgres, a real
#     NEXTAUTH_SECRET, NEXTAUTH_URL, CLOUDINARY_*, BOOTSTRAP_*)

# 4. Install, migrate, seed, build, and start under PM2
npm ci
npm run db:migrate
npm run db:seed
npm run build
pm2 start "npm run start" --name student-welfare
pm2 save
```

**Redis is optional.** Without `REDIS_URL` (and `ioredis` installed) the live
features run single-instance with an in-process SSE broadcaster and a Postgres
leaderboard fallback. Enable Redis only for large concurrent live-quiz audiences.

### Alternative: managed Postgres (Neon)

Point `DATABASE_URL`/`DIRECT_URL` at your Neon project (see the Neon note above),
skip the Postgres container, and run steps 3–4. Everything else is identical.

### Reverse proxy / SSE

Terminate TLS at a reverse proxy (nginx) forwarding to the Next.js server on
port 3000, and expose only 80/443 publicly. For the live SSE endpoints under
`/api/live/*`, disable proxy buffering (nginx: `proxy_buffering off;` and pass
`X-Accel-Buffering: no`) so events stream without delay.

### Updating a running deployment

```bash
git pull origin main
npm ci                 # only if dependencies changed
npm run db:migrate     # only if there are new migrations
npm run build          # required — Next.js serves the built output
pm2 restart student-welfare
pm2 save
```

### Backups & recovery

`pg_dump` targets the `./backups` volume mounted into the Postgres container.
See [`docs/BACKUP_AND_RECOVERY.md`](docs/BACKUP_AND_RECOVERY.md) for the schedule,
restore procedure, and the developer-console backup ledger.

---

## Project structure

```
app/            Next.js App Router — public pages, member/admin/coordinator surfaces, API routes
  api/          Route handlers (auth, admin, account, events, live, dev, feedback, usage)
  components/   Shared React components
lib/            Domain logic — rbac, cms, org, events, auth, realtime, markdown, prisma client
prisma/         Prisma schema, migrations, and seed
scripts/        Importers, dev CLI, dev console, test runners, media migration
tests/          Vitest unit suites + live-DB suites (*.db.test.mjs)
docs/           Full project documentation (see docs/README.md)
public/         Static assets
middleware.js   Edge auth / forced-password-change gate
docker-compose.yml        Local Postgres for testing
docker-compose.prod.yml   Production Postgres + optional Redis
```

---

## npm scripts reference

| Script | Does |
|---|---|
| `dev` | Start the Next.js dev server |
| `build` / `start` | Production build / serve |
| `lint` | Run ESLint |
| `test` / `test:watch` | Unit test suites |
| `test:db` | Live-DB suites against local Postgres |
| `test:routes` | Route-render smoke test |
| `db:generate` | Regenerate the Prisma client |
| `db:migrate` / `db:migrate:dev` | Apply migrations (deploy / dev) |
| `db:seed` | Seed roles, permissions, bootstrap accounts |
| `db:studio` | Open Prisma Studio |
| `db:local:up` / `:down` / `:reset` | Manage the local Docker Postgres |
| `db:import:*` / `db:seed:flagship` / `db:migrate:media` | Data importers / media migration |
| `cli` / `plugin:status` / `plugin:on` / `plugin:off` | Developer CLI + member-platform flag |
| `db:console` | Interactive developer console |

Every `db:*` script loads `.env.local` via `dotenv`. See [`package.json`](package.json)
for the exact commands.

---

## Security

- **Never commit secrets.** `.gitignore` excludes `.env*`; keep the Docker
  `secrets/` directory (e.g. `secrets/pg_password.txt`) out of version control too.
- Passwords are hashed with **Argon2id**; sessions use NextAuth JWTs signed with
  `NEXTAUTH_SECRET`. Mutating API routes are authenticated and permission-gated,
  with CSRF (same-origin) and rate-limiting on account endpoints.
- Security headers (nosniff, frame options, HSTS, referrer/permissions policy) are
  applied in [`next.config.mjs`](next.config.mjs); image loading is locked to
  Cloudinary.
- Secret scanning runs in CI (gitleaks). If a secret is ever committed, **rotate it
  at the source first**, then remove it and purge history following
  [`docs/runbooks/git-history-purge.md`](docs/runbooks/git-history-purge.md).
- Full posture, findings, and remediation status: [`docs/SECURITY.md`](docs/SECURITY.md)
  and [`KNOWN_ISSUES.md`](KNOWN_ISSUES.md).

---

## Credits & license

Built for the **Office of Student Affairs, IIT Jammu**, and maintained by the
Student Affairs Council's technical team. It is intended to be handed over to
future IIT Jammu student maintainers — see [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md)
and [`docs/SESSION_PROTOCOL.md`](docs/SESSION_PROTOCOL.md) to get oriented.

This repository is private and unlicensed for external use; all rights reserved by
IIT Jammu unless stated otherwise.
