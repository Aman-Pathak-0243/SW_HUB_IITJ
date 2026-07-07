# Client Instructions — Hand-Over & Go-Live Runbook

**IIT Jammu Student Affairs — Member Platform (branch `portal-v2`)**

This is the document that "seals the deal." It gives you — the client taking delivery — a
clear, ordered path from receiving the codebase to running the platform in production, plus
the day-2 operations and the security tasks that are yours to own. Every command below is
copied from the project's real `package.json` scripts; every procedure references a real
document shipped in this repository.

> **How to read this file.** Do the sections **in order**. Sections 1–4 are the delivery +
> first go-live. Sections 5–6 are the operator and owner tasks you complete once. Sections
> 7–9 are ongoing operations, support, and the acceptance sign-off.

---

## Table of contents

1. [What is delivered](#1-what-is-delivered)
2. [Prerequisites](#2-prerequisites)
3. [First-time setup (exact commands)](#3-first-time-setup-exact-commands)
4. [Go-live checklist](#4-go-live-checklist)
5. [Operator tasks — populate the live year & media](#5-operator-tasks--populate-the-live-year--media)
6. [Owner security tasks (do these once)](#6-owner-security-tasks-do-these-once)
7. [Day-2 operations](#7-day-2-operations)
8. [Support & maintenance — where each answer lives](#8-support--maintenance--where-each-answer-lives)
9. [Final acceptance checklist](#9-final-acceptance-checklist)

---

## 1. What is delivered

You receive **one Git repository** (branch `portal-v2`) containing the complete, working
platform and its full documentation set.

**The product.** A rebuild of the V1 marketing website into a full member/club/event
platform for IIT Jammu Student Affairs. The entire member platform is a
**developer-controlled plugin** (the `member_platform` feature flag, **off by default,
fail-closed**):

- **OFF** = the classic public portal (Sessions 1–10) with the original Google sign-in intact.
- **ON** = member accounts, club/council pages, the login-only Event Playground, the Wall of
  Fame, member profiles & contribution, notifications/feedback, and the standalone
  `/coordinator` back office.

**The engineering.** 51 Prisma models/tables, 52 permissions, 11 seeded roles, 13 content
types, 11 forward migrations, live per-request RBAC, and one audited mutation registry. The
codebase ships with **530 static tests + per-file live suites on Neon + a route-render smoke +
CI**.

**The documentation.** A complete client-facing and engineering doc set. The master map of
every Markdown document is **[DELIVERABLES_INDEX.md](DELIVERABLES_INDEX.md)** — **start there**.
The documents you will use most for delivery and operation are:

| Document | Use it for |
|---|---|
| [DELIVERABLES_INDEX.md](DELIVERABLES_INDEX.md) | The index of **every** shipped document, grouped by audience. |
| [Notebook.md](Notebook.md) | Everything about the platform — architecture, data model, RBAC, every module. |
| [USER_MANUAL.md](USER_MANUAL.md) | Features + the 11-role × 3-status access matrix + step-by-step how-to guides. |
| **This file** | Taking delivery + going live. |
| [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md) | The single operator entry point (deploy/setup/imports/recover). |
| [docs/WEBSITE_TESTING_SOP.md](docs/WEBSITE_TESTING_SOP.md) | The repeatable full-site test procedure (the go-live gate). |
| [docs/ADMIN_PANEL_GUIDE.md](docs/ADMIN_PANEL_GUIDE.md) | Sign-in, URLs, roles, bootstrap. |
| [RESOURCES.md](RESOURCES.md) | Infrastructure sizing + where to check live prices. |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Every accepted limitation and open owner/operator item. |

---

## 2. Prerequisites

### 2.1 Runtime & accounts

| Requirement | Detail |
|---|---|
| **Node.js** | **≥ 20.9.0** — the version required by Next.js 16.2.9 (`next` package `engines.node`). The build was validated on Node 22.x. `package.json` does not pin an `engines` field, so use a current 20.9+ / 22 LTS. |
| **PostgreSQL (Neon)** | A Neon serverless Postgres database (free tier is sufficient at student scale). You need **two** connection strings — the pooled host for the app and the non-pooler host for migrations (see below). |
| **Cloudinary account** *(optional)* | Only needed to migrate `/public` images to Cloudinary and to serve media through it. The cloud name alone builds delivery URLs; the API key/secret are needed only for the `--apply` upload. |
| **SMTP for bulk mail** *(optional)* | Only needed for the M8 bulk-mail feature. Uses the institute's own SMTP/VM via `nodemailer` — not a paid service. Everything else works without it. |

### 2.2 Environment variables

Copy [`env.example`](env.example) to `.env.local` and fill in real values. **Never commit
secrets** — `.gitignore` excludes `.env*`. Full reference with notes is in
[docs/OPERATIONS_RUNBOOK.md §1](docs/OPERATIONS_RUNBOOK.md).

| Variable | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | **Yes** | App runtime DB. Neon **-pooler** host; append `?sslmode=require&channel_binding=require&pgbouncer=true`. |
| `DIRECT_URL` | **Yes** | `prisma migrate` connection. Neon **non**-pooler host; `?sslmode=require`. Migrations do **not** work through the pooler. |
| `NEXTAUTH_SECRET` | **Yes** | Signs the JWT session. **Generate fresh per environment:** `openssl rand -base64 32`. |
| `NEXTAUTH_URL` | **Yes** | Canonical app origin (e.g. `https://portal.iitjammu.ac.in`). Used by NextAuth **and** the CSRF same-origin check — must be the real public origin. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth login. Only used when the plugin is **OFF** (see §1.1 of the runbook for redirect URIs). |
| `CLOUDINARY_CLOUD_NAME` | Optional | Build/serve media URLs. |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Optional | Required **only** for `db:migrate:media -- --apply` (signed uploads). |
| `CLOUDINARY_UPLOAD_FOLDER` | Optional | Migrated public-id prefix (default `iitj-portal`). |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` | Optional | SMTP for bulk mail (with `npm install nodemailer`). Until set, `sendBulk` fails closed — see KNOWN_ISSUES [#40](KNOWN_ISSUES.md)/[#45](KNOWN_ISSUES.md). |
| `BOOTSTRAP_DEVELOPER_EMAIL` | Recommended | First developer account (default `developer@iitjammu.ac.in`). Used by `db:seed`. |
| `BOOTSTRAP_DEVELOPER_PASSWORD` | Recommended | Developer password. If unset, the developer is OAuth-only (Google sign-in). Set this so you can log in immediately. |
| `BOOTSTRAP_ADMIN_EMAILS` | Optional | Comma-separated list; each is created `active` and granted `super_admin`. |

> **Golden rule (from the runbook §0):** the Prisma CLI reads `.env`, not `.env.local`. Always
> use the **`db:*` npm scripts** — they wrap the command in `dotenv -e .env.local` so the right
> credentials are used. **Never** run `prisma db pull`, `prisma migrate reset`, or `npm run
> db:reset` against the real database (raw-SQL guards live in migrations and are invisible to
> Prisma drift detection; a reset destroys data and/or those guards).

---

## 3. First-time setup (exact commands)

Run from the project root with `.env.local` populated (§2.2). All `db:*` scripts load
`.env.local` automatically.

```bash
# 0) Install dependencies (clean, lockfile-exact)
npm ci

# 1) Generate the Prisma client
npm run db:generate

# 2) Apply the schema + all 11 forward migrations (uses DIRECT_URL)
npm run db:migrate

# 3) Seed — idempotent: 52 permissions, 11 roles, 13 content types, org
#    types/positions, the current academic year, and the bootstrap accounts.
#    Re-running never resets the operator's plugin state or created data.
BOOTSTRAP_DEVELOPER_EMAIL=you@iitjammu.ac.in \
BOOTSTRAP_DEVELOPER_PASSWORD='a-strong-password' \
BOOTSTRAP_ADMIN_EMAILS='colleague@iitjammu.ac.in' \
npm run db:seed

# 4) Build the production app
npm run build

# 5) Start it (production server on PORT, default 3000)
npm start
```

- To **confirm** the schema is applied, run the read-only `npx prisma migrate status` — it
  should report *"Database schema is up to date!"*.
- `npm run build` instantiates Prisma at import time but does **not** connect, so a build runs
  with any well-formed `DATABASE_URL`; the live DB is only touched at request time.
- `npm run build` emits one benign Turbopack NFT tracing note (KNOWN_ISSUES [#32](KNOWN_ISSUES.md)) — the build succeeds.
- **Deploying to Vercel instead of a VM?** Set all §2.2 env vars in the project settings and
  deploy; the framework runs `next build`. Self-hosted VM (PM2) topology is documented in
  [docs/OPERATIONS_RUNBOOK.md §4](docs/OPERATIONS_RUNBOOK.md).

**Neon note:** Neon has high per-query latency and auto-suspends. The first request after idle
is slow and can transiently fail with "Can't reach database server" — **retry once**. The app
and the tests are built to tolerate this.

---

## 4. Go-live checklist

Do these in order after §3 completes.

1. **Sign in as the bootstrap developer.** Open **`/login`** and sign in with
   `BOOTSTRAP_DEVELOPER_EMAIL` + `BOOTSTRAP_DEVELOPER_PASSWORD`. You land on the panel with
   full access. (Details: [docs/ADMIN_PANEL_GUIDE.md](docs/ADMIN_PANEL_GUIDE.md).)

2. **Turn the platform ON.** Go to **`/admin/plugins`** and toggle **Member Platform** ON.
   Only a **developer** can flip it. ON activates email+password member sign-in and all member
   surfaces; OFF keeps the classic public portal with Google sign-in. Propagation is ≤10 s per
   process (KNOWN_ISSUES [#35](KNOWN_ISSUES.md)).

3. **Create the people who run the site.** In **`/admin/users`** (Users & Roles):
   - **Single** create, or **Bulk import (CSV)** of `email,password[,name]` (existing emails
     are skipped). New users are forced to change their password on first login; deliver
     initial passwords via the institute's external email — never by the app.
   - **Grant roles.** Admins/staff get **global** grants. **Club coordinators / secretaries /
     co-coordinators** get **SCOPED** grants — scope the grant to the unit's
     `orgUnitLineageKey` (and optionally an academic year) so a coordinator manages only their
     own club. Only a **developer** can mint another developer or grant a `grants_all`/system
     role.
   - See the 11-role × 3-status matrix in [USER_MANUAL.md](USER_MANUAL.md) and
     [docs/WEBSITE_TESTING_SOP.md §2](docs/WEBSITE_TESTING_SOP.md).

4. **Run the full go-live gate.** Follow [docs/WEBSITE_TESTING_SOP.md](docs/WEBSITE_TESTING_SOP.md)
   (four layers, cheap → expensive):

   ```bash
   # Layer 1 — static gate (logic, lint, build)
   npm test && npm run lint && npm run build

   # Layer 2 — live-DB gate: warm Neon first, then run each suite PER-FILE, single-fork
   #           (never all live suites in one parallel process — KNOWN_ISSUES #39)
   npm run db:migrate
   for s in cms year org events resources media devconsole users \
            m0 m1 m2 m3 m4 m5 m6 m7 m8 coordinator; do
     RUN_DB_TESTS=1 ./node_modules/.bin/dotenv -e .env.local -- \
       npx vitest run "tests/$s.db.test.mjs" --pool=forks --poolOptions.forks.singleFork \
       || echo "FAIL: $s"
   done

   # Layer 3 — route-render smoke (every page loads; fails on any 5xx)
   npm run dev            # in one terminal (or: npm run build && npm start)
   npm run test:routes    # in another  → against a deployed host: BASE_URL=https://your-host npm run test:routes

   # Layer 4 — the per-feature × per-mode manual matrix in the SOP §5
   ```

   A feature is "tested" only when you have confirmed the **allow path** in its intended mode
   **and** the **deny path** in a mode it is not meant for. Test **both plugin ON and OFF**
   (SOP §6).

---

## 5. Operator tasks — populate the live year & media

These migrate the V1 dataset into the current academic year. They are **idempotent** (re-runs
create 0) and **resumable**. Full detail: [docs/OPERATIONS_RUNBOOK.md §3](docs/OPERATIONS_RUNBOOK.md).

### 5.1 Populate the live current year (order matters)

```bash
# 5a) org structure: 4 councils, 30 clubs, 6 hostels, 5 messes, mess committee
#     + profile content + people + appointments. ~15 min on Neon.
npm run db:import:org

# 5b) the backed-up events
npm run db:import:events

# 5c) per-unit resources (PDFs / Drive links) — run AFTER db:import:org
npm run db:import:resources
```

> Until `db:import:org` has run, the public `/org/*` pages (and the Header's council links)
> render an empty "not available for the current year" state — that is correct data-driven
> behavior, not a bug. The pages light up the moment the import completes.

### 5.2 Media migration (`/public` → Cloudinary) — optional but recommended

Shrinks the deployed bundle (KNOWN_ISSUES [#18](KNOWN_ISSUES.md)). Needs `CLOUDINARY_*` set.
It is **dry-run-first, idempotent, and reversible.**

```bash
npm run db:migrate:media                 # preview the plan (no writes) — the default
npm run db:migrate:media -- --apply      # upload + repoint the media_asset rows
npm run db:migrate:media -- --rollback   # reverse it (restores local URLs; does not delete remote assets)
```

**Safe `/public` prune (do NOT do blindly).** After a verified `--apply`, some V1 pages still
**hardcode** `/public` paths (e.g. the homepage hero `/hero*.jpg`, which are not `media_asset`
rows). Before deleting anything under `public/`: (1) confirm `--apply` succeeded and the pages
render, (2) repoint the remaining hardcoded refs, (3) then delete only the migrated,
now-unreferenced files — keep the originals while rollback is still possible. Full procedure in
[docs/OPERATIONS_RUNBOOK.md §3.1](docs/OPERATIONS_RUNBOOK.md).

### 5.3 Bulk mail (optional)

Bulk mail is off until you enable it. To turn it on:

```bash
npm install nodemailer
# then set MAIL_HOST / MAIL_PORT / MAIL_USER / MAIL_PASS on the host
```

Until then `sendBulk` returns a friendly `MAIL_NOT_CONFIGURED` / `MAIL_NOT_INSTALLED` and the
allowlist + composer UI work but sends fail closed (KNOWN_ISSUES [#40](KNOWN_ISSUES.md)). Note
that a large multi-batch send runs synchronously in the request (KNOWN_ISSUES
[#45](KNOWN_ISSUES.md)) — a background queue is future work. Initial account passwords always
go via the institute's external mail, never through this feature.

---

## 6. Owner security tasks (do these once)

The V1 repository history contains leaked credentials. These are **owner-owned** and should be
completed before or right after go-live. Full procedure:
[docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md); tracked as
KNOWN_ISSUES [#1](KNOWN_ISSUES.md) and [#19](KNOWN_ISSUES.md).

1. **Rotate/revoke the leaked V1 secrets first.** The root [`README.md`](README.md) still
   contains a 35-character token and a GitHub PAT (`ghp_…`). Revoke the PAT in GitHub, rotate
   the other token at its service, and confirm the old values fail to authenticate.
2. **Remove the secrets from the working tree.** Delete the secret lines from `README.md` and
   anywhere else they appear; commit the cleanup.
3. **Purge them from Git history.** Use `git filter-repo` (recommended) or BFG per the runbook,
   then force-push and have all collaborators re-clone. Deletion from the latest commit does
   **not** remove a secret from history.
4. **Drop the temporary allowlist.** After rotation + purge, remove the two by-SHA entries in
   [`.gitleaks.toml`](.gitleaks.toml) (they currently keep CI green for new work) so the
   scanner protects the full history again.
5. **Consider rotating the Neon password** (KNOWN_ISSUES [#19](KNOWN_ISSUES.md)) if the DB
   credential was ever shared over a non-private channel. It lives correctly in git-ignored
   `.env.local`; never commit it.

**Done when:** old credentials are revoked and confirmed dead, secrets are gone from the tree
**and** history, the secret scan passes on the default branch, and collaborators have re-cloned.

---

## 7. Day-2 operations

Ongoing operation is almost entirely through the admin panel — everything writes exactly one
attributed audit row. Full guides in [docs/ADMIN_PANEL_GUIDE.md](docs/ADMIN_PANEL_GUIDE.md) and
[docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md).

- **Adding admins / staff / coordinators.** `/admin/users` → create user → grant a role. Use a
  **scoped** grant (unit lineage + optional year) for club coordinators/secretaries — a scoped
  coordinator drives their own unit from the standalone **`/coordinator`** back office (events,
  members, contribution). Only a developer can mint a developer or grant a `grants_all`/system
  role; you cannot lock yourself out.
- **Backups & exports.** The Developer Dashboard / Developer Console (`/admin/devdash`,
  `/admin/console`) exposes per-table storage sizes, a `truncateTable` (allowlisted +
  confirm-gated), and `exportTable` (writes a guaranteed audit row + a best-effort
  `backup_record`). See [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md).
- **Storage thresholds.** Set a per-table threshold in the dashboard; over-threshold tables are
  flagged **non-blocking** (the site keeps working) and raise a deduped alert. Only a
  **developer** holds `storage.manage`.
- **Audit / change-history export.** The audit-log viewer (filter / paginate / drill-down) and
  the `exportAuditLog` (JSON/CSV, PII-minimized, gated `audit.read`) live in the Developer
  Console. The "Events Organized" curated doc has its own change-history tab in the Developer
  Dashboard.
- **Monitoring infra usage.** The Developer Console system status reports DB health, migration
  diff, transition history, and media-migration state; usage analytics (`page_visit`, filled by
  the client beacon) show top sections/paths. For sizing/headroom and where to check live
  prices, see [RESOURCES.md](RESOURCES.md). *Prices change — always verify at the official
  pricing pages linked there.*
- **Routine redeploy (VM/PM2):** `git pull` → `npm ci` → `npm run db:migrate` (applies any new,
  additive forward migrations) → `npm run build` → `pm2 restart … && pm2 save`.

---

## 8. Support & maintenance — where each answer lives

| Question / need | Document |
|---|---|
| "What is everything, technically?" | [Notebook.md](Notebook.md) |
| "How do I use feature X / what can role Y do?" | [USER_MANUAL.md](USER_MANUAL.md) |
| "How do I deploy / import data / recover?" | [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md) |
| "How do I sign in / manage roles / bootstrap?" | [docs/ADMIN_PANEL_GUIDE.md](docs/ADMIN_PANEL_GUIDE.md) |
| "How do I test the whole site before a release?" | [docs/WEBSITE_TESTING_SOP.md](docs/WEBSITE_TESTING_SOP.md) |
| "How is auth / RBAC actually enforced?" | [docs/AUTHENTICATION_AND_RBAC.md](docs/AUTHENTICATION_AND_RBAC.md) |
| "What's the database schema and why?" | [docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md) |
| "What's the architecture?" | [docs/TARGET_ARCHITECTURE.md](docs/TARGET_ARCHITECTURE.md) |
| "Why was X decided this way?" | [docs/DECISION_LOG.md](docs/DECISION_LOG.md) |
| "What is the security posture?" | [docs/SECURITY.md](docs/SECURITY.md) |
| "What's the performance strategy?" | [docs/PERFORMANCE.md](docs/PERFORMANCE.md) |
| "What are the known limits / accepted risks?" | [KNOWN_ISSUES.md](KNOWN_ISSUES.md) |
| "What infra / capacity / cost?" | [RESOURCES.md](RESOURCES.md) |
| "How do I extend it as a developer?" | [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md), [docs/DEV_CLI.md](docs/DEV_CLI.md) |
| "Where is every document?" | [DELIVERABLES_INDEX.md](DELIVERABLES_INDEX.md) |

**Maintenance principles baked into the code (keep them):** authorize first, one audit row per
mutation, PII-minimized data shapes, pure helpers mirror server logic, and schema changes are
**new forward migrations** — never a reset/pull. New forward migrations apply cleanly with
`npm run db:migrate`; re-running `npm run db:seed` is always safe (idempotent).

---

## 9. Final acceptance checklist

Sign off when every box is checked.

**Delivery received**
- [ ] Repository cloned on branch `portal-v2`; [DELIVERABLES_INDEX.md](DELIVERABLES_INDEX.md) reviewed.
- [ ] Node ≥ 20.9 available; Neon DB provisioned; optional Cloudinary/SMTP decided.

**Setup completed**
- [ ] `.env.local` filled from [`env.example`](env.example) (`DATABASE_URL`, `DIRECT_URL`, a fresh `NEXTAUTH_SECRET`, real `NEXTAUTH_URL`).
- [ ] `npm ci` → `npm run db:generate` → `npm run db:migrate` → `npm run db:seed` all succeeded.
- [ ] `npx prisma migrate status` reports "up to date" (52 permissions / 11 roles / 13 content types seeded).
- [ ] `npm run build` succeeds; `npm start` (or Vercel deploy) serves the site.

**Go-live**
- [ ] Signed in as the bootstrap developer at `/login`.
- [ ] `member_platform` toggled ON at `/admin/plugins`.
- [ ] Admins/staff created; club coordinators granted **scoped** roles and verified in `/coordinator`.
- [ ] Full gate green: `npm test && npm run lint && npm run build`; per-file live suites; `npm run test:routes`; the manual matrix (both plugin ON and OFF) per the Testing SOP.

**Operator**
- [ ] Live year populated: `db:import:org` → `db:import:events` → `db:import:resources`; `/org/*` pages render.
- [ ] (Optional) `db:migrate:media -- --apply` done and verified; `/public` prune only after repointing hardcoded refs.
- [ ] (Optional) bulk mail enabled (`npm install nodemailer` + `MAIL_*`) or intentionally left off.

**Owner security**
- [ ] V1 leaked secrets rotated/revoked; removed from `README.md`; Git history purged; collaborators re-cloned.
- [ ] `.gitleaks.toml` by-SHA allowlist removed; secret scan green on the default branch.
- [ ] Neon password rotation assessed (KNOWN_ISSUES #19).

**Hand-over complete** — the platform is live, tested, documented, and the security debt is
closed. Ongoing operation follows §7; every answer has a home in §8.

---

*Delivered on branch `portal-v2`. If you add or rename a document, update
[DELIVERABLES_INDEX.md](DELIVERABLES_INDEX.md).*
