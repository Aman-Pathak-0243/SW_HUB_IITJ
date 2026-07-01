# Infrastructure Resources, Capacity & Cost-Visibility Plan

The IIT Jammu Student Affairs **Member Platform** (branch `portal-v2`) is
deliberately engineered to run on **free tiers** for a student-scale institute
and to grow one small step at a time. This document is the single reference for
**what each resource is, how big it needs to be, WHY that size, what the free
tier gives us, and where to check live prices** — plus how to **monitor** usage
from the built-in Developer Console.

> **Pricing caveat (read once).** Every dollar figure below is **indicative
> only**, reflecting **January 2026** knowledge. Provider tiers and prices
> change frequently. **Always verify at the official pricing URL** cited in each
> section before you rely on a number or commit spend. This document does not
> quote a binding bill.

---

## Table of contents

1. [Platform usage profile (what drives the sizing)](#1-platform-usage-profile-what-drives-the-sizing)
2. [Summary table](#2-summary-table)
3. [Resource 1 — Neon PostgreSQL (compute + storage)](#3-resource-1--neon-postgresql-compute--storage)
4. [Resource 2 — Cloudinary (media storage, transformations, bandwidth)](#4-resource-2--cloudinary-media-storage-transformations-bandwidth)
5. [Resource 3 — Hosting (Vercel vs the institute VM)](#5-resource-3--hosting-vercel-vs-the-institute-vm)
6. [Resource 4 — Email / SMTP for bulk mail](#6-resource-4--email--smtp-for-bulk-mail)
7. [Resource 5 — Domain + TLS](#7-resource-5--domain--tls)
8. [Resource 6 — Secrets management](#8-resource-6--secrets-management)
9. [How to MONITOR usage](#9-how-to-monitor-usage)
10. [Indicative monthly cost ranges](#10-indicative-monthly-cost-ranges)

---

## 1. Platform usage profile (what drives the sizing)

Sizing is tied to the platform's **real** shape, not guesses:

- **Scale of the schema:** 51 Prisma models/tables, 52 permissions, 11 seeded
  roles, 13 content types, 11 forward migrations. This is a normalized
  relational app, not a blob store — rows are small.
- **Organizational footprint:** the org importer seeds **4 councils, 30 clubs,
  6 hostels, 5 messes** plus their profile content, people, and appointments
  (`docs/OPERATIONS_RUNBOOK.md §3`). "Dozens of clubs" is the working number.
- **Bursty, seasonal traffic:** activity spikes around **event registration
  windows** and results, then goes quiet. The Event Playground stores
  registrations (dedup + capacity → `WAITLIST` + auto-promote), rounds, scores,
  attendance replace-sheets, and closure reports. Traffic is **not** a steady
  24/7 load — it is spiky, which is exactly what serverless autosuspend is for.
- **Growing append-only logs:** every mutation writes **one attributed
  `audit_log` row** (`POST /api/admin/action` + gated public routes), and the
  hidden `page_visit` analytics table grows with traffic. These are the two
  tables that grow monotonically and need a **threshold + export/truncate**
  discipline (see [§9](#9-how-to-monitor-usage)).
- **Media library, kept small on purpose:** event banners, club media, and PDFs
  are served from Cloudinary with `f_auto,q_auto` + AVIF/WebP negotiation and
  `next/image` sizing (`docs/PERFORMANCE.md`, `docs/DEPLOYMENT.md`), so each
  asset is delivered at the smallest correct size rather than as a base64 blob
  in the DB.
- **Login-only, active-account participation:** the member surfaces gate on live
  RBAC, so anonymous crawl traffic never touches the write path. This keeps
  compute predictable.

---

## 2. Summary table

| Resource | Recommended tier (start) | Why this size | Free-tier headroom | Live pricing |
|---|---|---|---|---|
| **Neon PostgreSQL** | Free → Launch when you outgrow it | 51 small relational tables; bursty traffic suits **autosuspend**; storage grows slowly, dominated by `audit_log`/`page_visit` | Free ≈ **0.5 GB** storage + a monthly **compute-hour** allowance; the app tolerates cold-start/auto-suspend | https://neon.tech/pricing |
| **Cloudinary** | Free (Programmable Media) | Banners/club media/PDFs only; `f_auto,q_auto` keeps bytes + transforms low | Free ≈ **25 monthly credits** (storage + bandwidth + transforms pooled) | https://cloudinary.com/pricing |
| **Hosting — Vercel** | Hobby (eval) → Pro (production) | Next.js 16 Server Components + edge middleware are first-class on Vercel; Hobby is non-commercial | Hobby free (personal/non-commercial); Pro is per-seat | https://vercel.com/pricing |
| **Hosting — Institute VM** | 1 small VM + PM2 | The committed V1 topology (`pm2 restart student-welfare`); **near-zero marginal cost** on institute hardware | N/A (owned/allocated hardware) | (institute IT — no external bill) |
| **Email / SMTP (bulk mail)** | Institute SMTP via nodemailer | Institute's own mail relay = **no per-email cost**; default **60 mail/min** rate | Free on institute relay; external SMTP providers meter per-email | provider-specific (verify with institute IT / chosen SMTP vendor) |
| **Domain + TLS** | 1 domain (often institute `.ac.in`) + auto TLS | One canonical origin drives `NEXTAUTH_URL` + the CSRF same-origin check | TLS free via host/Let's Encrypt; domain is an annual registrar fee | registrar-specific + https://letsencrypt.org (free TLS) |
| **Secrets management** | Env vars in the host secret store | 8+ runtime secrets; never committed (`.env.local` is git-ignored) | Free (built into Vercel/host env or VM env) | (bundled with host) |

---

## 3. Resource 1 — Neon PostgreSQL (compute + storage)

### What it is
The **primary datastore** — serverless PostgreSQL on Neon, accessed through
Prisma 6. Two connection strings are used (`env.example`, `docs/OPERATIONS_RUNBOOK.md §1`):

- **`DATABASE_URL`** — the **pooled** (`-pooler`, PgBouncer) host the app uses at
  runtime, with `?sslmode=require&channel_binding=require&pgbouncer=true`.
- **`DIRECT_URL`** — the **non-pooler** host `prisma migrate` needs (migrations do
  not work through the pooler).

MongoDB is retired from the request path; the whole V2 app is on Postgres.

### Capacity / tier needed
Start on the **Free** tier. It comfortably holds a student-scale institute: 51
mostly-small relational tables, dozens of clubs, and a season's worth of event
registrations/scores/attendance are **kilobytes-to-megabytes**, not gigabytes.

### Why that size
- **Serverless + autosuspend fits bursty student traffic.** Traffic clusters
  around registration windows and results, then idles. Neon **auto-suspends**
  the compute when idle and resumes on the next request, so you pay for compute
  roughly in proportion to real activity — ideal for a spiky, seasonal
  workload. The trade-off is a **cold-start**: the first request after idle is
  slow and can transiently return "Can't reach database server" — **retry
  once**. The app and the live test suites are built to tolerate this
  (`docs/OPERATIONS_RUNBOOK.md §0`; the "Neon latency" memory note).
- **Storage grows slowly and predictably.** The two monotonic growers are
  `audit_log` (one row per mutation) and `page_visit` (hidden analytics). Both
  are covered by the per-table **threshold + export → truncate** tooling
  (`lib/devconsole/storage.mjs`); `page_visit` is the one **allowlisted**
  truncatable table (`TRUNCATABLE_TABLES`). So DB growth is manageable rather
  than runaway.

### Free-tier limits (indicative, verify)
- **Storage ≈ 0.5 GB (512 MB)** on the free tier — the exact value baked into the
  cost model as `NEON_FREE_STORAGE_BYTES = 512 * 1024 * 1024`
  (`lib/devconsole/reports.mjs`).
- A **limited monthly compute-hour** allowance (autosuspend keeps you inside it
  for a bursty workload).
- Neon periodically revises tier names and quotas (Free / Launch / Scale, etc.).
  **Verify at https://neon.tech/pricing, prices change.**

### When to move up
Move off Free when the live DB size approaches ~0.5 GB (the console's
`infraCost.neon.withinFreeTier` flips to `false`) **or** when sustained compute
exceeds the free allowance. The next paid tier adds storage + compute headroom;
confirm current tier structure at the pricing URL.

---

## 4. Resource 2 — Cloudinary (media storage, transformations, bandwidth)

### What it is
The **media delivery layer**: image + PDF hosting and on-the-fly transformation.
`next.config.mjs` restricts `images.remotePatterns` to `res.cloudinary.com`. The
Session-7 Media Migration Tool moves `/public` and base64 event images into
Cloudinary (`db:migrate:media`, dry-run by default, `--apply` / `--rollback`).

### Capacity / tier needed
Start on the **Free** (Programmable Media) tier. The library is small: event
banners, club media, and a modest set of PDFs — not a photo-sharing product.

### Why that size
- **The content is inherently small.** Media is banners/club imagery/PDFs, and
  everything public is delivered with **`f_auto,q_auto`** plus AVIF/WebP
  negotiation and `next/image` `sizes` (`docs/DEPLOYMENT.md`,
  `docs/PERFORMANCE.md`). Format + quality auto-selection means each view ships
  the smallest correct bytes, which keeps **bandwidth and transformation**
  consumption (the usual Cloudinary cost drivers) low.
- **Migrating media OUT of the DB** shrinks the Postgres footprint (base64 blobs
  were a V1 problem) and shrinks the deploy bundle (`/public` was ~74 MB) —
  moving those bytes to Cloudinary's free tier is a net win on **two** budgets.

### Free-tier limits (indicative, verify)
- Cloudinary's free plan is metered in **credits** — indicatively **~25 monthly
  credits**, where **1 credit ≈ 1 GB stored**, and credits also cover bandwidth
  and transformations from the same pool. This is the exact model in the cost
  code: `CLOUDINARY_FREE_CREDITS = 25` and `estimatedCredits = mediaBytes / GB`
  (`lib/devconsole/reports.mjs`).
- The credit-to-resource mapping is **indicative**; the code itself flags it as a
  parameter to verify. **Verify at https://cloudinary.com/pricing, prices change.**

### When to move up
Move up when `infraCost.cloudinary.withinFreeTier` flips to `false` (estimated
credits approach 25). Before paying, prune unused/duplicate assets and confirm
`f_auto,q_auto` is applied everywhere.

---

## 5. Resource 3 — Hosting (Vercel vs the institute VM)

Two supported topologies; pick one.

### Option A — Vercel (serverless)
**What it is:** managed hosting for the Next.js 16 app (`docs/OPERATIONS_RUNBOOK.md §4`).

**Why it fits:** Next.js 16 **Server Components + edge middleware** (`middleware.js`)
are first-class on Vercel — SSR/streaming, image optimization, and edge routing
work with no extra ops. The dev-console filesystem reads (migrations dir +
`docs/Token_Usage.md`) are bundled via `outputFileTracingIncludes` and degrade to
`{ error }` if missing (DL-048), so serverless bundling is already handled.

**Capacity / tier:**
- **Hobby (free):** fine to **evaluate/preview**, but Vercel's terms are
  **non-commercial** — not appropriate for an official institute production site.
- **Pro (paid, per-seat):** the correct tier for production; adds commercial use,
  higher limits, and team features.

**Caveat for serverless:** the rate limiter in `lib/http/guard.mjs` is
**per-process/per-instance** (admin 60/min, events 20/min). For a **hard global**
limit across serverless instances, front it with a shared store (Upstash/Redis).

**Verify at https://vercel.com/pricing, prices change.**

### Option B — Institute VM (self-hosted, the V1 topology)
**What it is:** the committed deployment — repo cloned to
`~/IIT-JAMMU-STUDENT-WELFARE`, run under **PM2** as `student-welfare`
(`docs/DEPLOYMENT.md`, `docs/OPERATIONS_RUNBOOK.md §4`):

```bash
git pull origin main
npm ci
npm run db:migrate     # apply NEW forward migrations (safe, additive)
npm run build
pm2 restart student-welfare && pm2 save
```

**Why it fits:** on institute-owned hardware the marginal cost is **near zero** —
you pay nothing per request. A single small VM (Node LTS + PM2, fronted by the
institute's own reverse proxy) is plenty for student-scale traffic, and it keeps
the SMTP relay, media, and DB all inside institute infrastructure.

**Trade-offs (documented):** manual `git pull` + `pm2 restart` has **no
rollback**; there is **no Dockerfile/reverse-proxy/CSP-nonce pipeline** in the
repo yet (`docs/DEPLOYMENT.md` "What is NOT present" / "Still open"). Recovery
delegates route through existing services (DL-046), not a separate pipeline.

**Cost:** no external bill; the cost is the institute's existing VM/ops time.

---

## 6. Resource 4 — Email / SMTP for bulk mail

### What it is
The **bulk-mail** subsystem (M8, DL-073) — `lib/mail/service.mjs` sends
rate-limited stakeholder mail through **nodemailer**, restricted to an
admin/dev-maintained **authorized-sender allowlist** (`mail.manage` maintains it;
`mail.send` sends). Each bulk run writes **one** semantic `audit_log` row.

### Capacity / tier needed
The institute's **own SMTP relay**, configured via env
(`MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS`, optional `MAIL_SECURE`).
The transport is **lazy + injectable**: the module imports fine without
nodemailer installed and only builds a real SMTP transport when a send actually
runs — so a plugin-off deploy and the static test suite never need it.

### Why the institute's own mail
- **No per-email cost.** Routing through the institute relay avoids the metered
  per-email pricing of external transactional-mail vendors. For dozens of clubs
  emailing their members, that difference compounds.
- **Rate posture is VM-friendly.** The default send rate is **60 mail/min**
  (`DEFAULT_RATE_PER_MINUTE = 60` in `lib/mail/progress.mjs`), batched one batch
  per rolling minute with a live "X of Y sent" progress accounting — sized for a
  single institute relay, not a blast service. `MAX_RECIPIENTS = 5000` caps a run.

### Important: initial passwords do NOT go through this
New-account **initial passwords are a temporary credential delivered
out-of-band** via the institute's **external** mail, **not** the app's bulk
mailer (`lib/mail/service.mjs` header; `lib/users/admin.mjs`
`setUserPassword` — "an admin-set password is a temporary credential delivered
out-of-band", `mustChangePassword` forces a first-login change). The bulk mailer
is for stakeholder communications only.

### Free-tier / cost
- **Institute relay:** effectively free (institute IT resource); confirm the
  relay's own per-hour/per-day send limits with institute IT and keep the 60/min
  default under them.
- **If you must use an external SMTP provider:** it will meter per-email or
  per-month. **Verify pricing with the chosen vendor / institute IT** — prices
  change and vendor free tiers are small.

---

## 7. Resource 5 — Domain + TLS

### What it is
The public origin the platform is served on (commonly an institute
`*.iitjammu.ac.in` / `.ac.in` hostname) plus its **TLS certificate**.

### Why it matters beyond branding
`NEXTAUTH_URL` **must** be the real public origin: it is used by NextAuth **and**
by the CSRF same-origin check in `lib/http/guard.mjs` (`docs/OPERATIONS_RUNBOOK.md §1`).
A mismatch causes `403 "Cross-origin request blocked"` on writes and
`redirect_uri_mismatch` on Google login (the OAuth redirect URI must be
`<origin>/api/auth/callback/google`). So **one canonical domain** is a functional
requirement, not just cosmetics.

### Capacity / tier
One domain (or subdomain) is enough. If the institute already owns
`iitjammu.ac.in`, a subdomain (e.g. `portal.iitjammu.ac.in`) costs nothing extra.

### Free-tier / cost
- **TLS is free:** Vercel provisions/renews certificates automatically; a VM can
  use **Let's Encrypt** (https://letsencrypt.org) via the reverse proxy.
- **Domain:** a small **annual** registrar fee for a new external domain; **zero**
  if you use an existing institute subdomain. **Verify at your registrar** —
  prices change.

---

## 8. Resource 6 — Secrets management

### What it is
The runtime secrets/config the app needs. They live **only** in the git-ignored
`.env.local` (self-hosted) or the **host's secret store** (Vercel project env).
`env.example` holds placeholders; **nothing real is committed**
(`docs/OPERATIONS_RUNBOOK.md §0/§1`, `docs/SECURITY.md`). The Prisma CLI reads
`.env` (the `db:*` npm scripts wrap commands in `dotenv -e .env.local`).

### The secret inventory (from `env.example` + code)

| Secret | What it protects / enables |
|---|---|
| `NEXTAUTH_SECRET` | Signs the JWT session. **Generate fresh per environment** (`openssl rand -base64 32`) — a weak/shared secret forges sessions. |
| `DATABASE_URL` | Pooled Neon runtime connection (contains DB password). |
| `DIRECT_URL` | Non-pooler Neon connection for `prisma migrate`. |
| `NEXTAUTH_URL` | Canonical origin (drives NextAuth + CSRF same-origin). Not secret, but must be exact. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth login (kept for the plugin-off classic portal). |
| `CLOUDINARY_CLOUD_NAME` | Builds delivery URLs (enough on its own to serve images). |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Signed uploads — required **only** for `db:migrate:media -- --apply`. |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` (`MAIL_SECURE`) | Institute SMTP for bulk mail (`lib/mail/service.mjs`). |
| `BOOTSTRAP_DEVELOPER_EMAIL` / `BOOTSTRAP_DEVELOPER_PASSWORD` / `BOOTSTRAP_ADMIN_EMAILS` | Seed-time bootstrap accounts (`db:seed`). |

### Cost / posture
No external cost — secret storage is bundled with Vercel env or the VM
environment. The discipline: **never commit secrets**, generate
`NEXTAUTH_SECRET` per environment, and rotate/purge any leaked V1 credentials
still in the root `README.md` (KNOWN_ISSUES #1/#19; runbook §8) before dropping
the `.gitleaks.toml` by-SHA allowlist.

---

## 9. How to MONITOR usage

The platform ships its own **cost-visibility tooling** — you do not have to log
into each provider dashboard to know whether you are still inside the free tier.

### Developer Console — infra usage & free-tier estimates
- **`getInfraUsage()`** (`lib/devconsole/reports.mjs`) reads the two raw numbers
  the cost view consumes: total DB size via `pg_database_size(current_database())`
  and the tracked media inventory's **count + summed bytes** (non-archived
  `media_asset`). It **degrades to nulls** on a cold/unreachable Neon so it never
  sinks the status route.
- **`estimateInfraCost()`** turns those into free-tier **headroom**: for Neon,
  `usedFraction` against `NEON_FREE_STORAGE_BYTES` (0.5 GB) and a
  `withinFreeTier` boolean; for Cloudinary, `estimatedCredits` (`mediaBytes / GB`)
  against `CLOUDINARY_FREE_CREDITS` (25) and its own `withinFreeTier`. Surfaced
  through the gated aggregator **`getDevConsoleReports()`** (`dev.console`) at the
  Developer Console (`/admin/console`).
- Because these limits are **parameters** in code, update them if a provider
  changes its free tier — then the console's estimate stays honest.

### Per-table storage thresholds (catch the growers early)
- **`lib/devconsole/storage.mjs`** reads **live per-table sizes**
  (`pg_total_relation_size`) via `getTableSizes()`, and `buildStorageReport()`
  flags any table over its configured byte **threshold** (`getStorageReport`,
  `setTableThreshold`). It is **non-blocking** — the site keeps working past a
  warning — and can raise a **deduped `threshold_alert` notification**.
- When a log table (e.g. `page_visit`, the one **allowlisted** truncatable table)
  crosses its threshold: **`exportTable()`** dumps it (JSON/CSV, capped at 50k
  rows, writes a `backup_record` **and** a guaranteed `audit_log` row), then
  **`truncateTable()`** rolls it over (developer-only `storage.manage`, audited,
  confirm-gated). This is the intended way to keep Neon storage flat.

### Usage analytics (traffic shape)
- **`getUsageAnalytics()`** (`lib/devconsole/usage.mjs`, `dev.console`) aggregates
  the hidden `page_visit` table over a window into total visits + top sections +
  top paths — so you can see **where** the load is (e.g. spikes on `events`
  during registration) and correlate it with compute/bandwidth.

### The operator runbook
`docs/OPERATIONS_RUNBOOK.md §6` ("Observe & recover") is the human procedure:
the Developer Console for status/reports/audit/backup, or the CLI
(`npm run db:console`, `npm run db:console -- --audit`) when no UI is available.

**Routine:** check `getDevConsoleReports` → `infraCost` each month (or before/after
a big event) — if either `withinFreeTier` is trending toward `false`, act
(prune media, export+truncate `page_visit`) **before** you hit a hard limit.

---

## 10. Indicative monthly cost ranges

> **Reminder:** figures are **indicative, Jan-2026 knowledge, not a quote**.
> **Verify at each pricing URL — prices change.**

### Small institute (starting out — comfortably inside free tiers)

| Resource | Likely monthly cost |
|---|---|
| Neon (Free) | **$0** — under ~0.5 GB storage, bursty compute inside the free allowance |
| Cloudinary (Free) | **$0** — under ~25 credits with `f_auto,q_auto` |
| Hosting — institute VM + PM2 | **$0 marginal** (owned hardware) |
| Hosting — Vercel Hobby (eval only, non-commercial) | **$0** |
| Email — institute SMTP relay | **$0** |
| TLS (Let's Encrypt / host-managed) | **$0** |
| Domain (existing institute subdomain) | **$0** |
| **Total** | **~$0/month** (on institute VM + free managed tiers) |

### Growing institute (production-grade, more clubs/events/media)

| Resource | Likely monthly cost (indicative) |
|---|---|
| Neon (paid tier once >~0.5 GB / more compute) | low tens of USD — **verify at https://neon.tech/pricing** |
| Cloudinary (paid once >~25 credits) | low tens of USD — **verify at https://cloudinary.com/pricing** |
| Hosting — **Vercel Pro** (commercial production) | per-seat monthly fee — **verify at https://vercel.com/pricing** |
| Hosting — institute VM (alternative) | still **~$0 marginal** on owned hardware |
| Email — institute SMTP | **$0**; external SMTP provider would meter per-email — verify with vendor |
| Domain | small **annual** registrar fee (amortized ≈ a few USD/month) — verify at registrar |
| **Total (Vercel path)** | roughly **low-tens to ~$100/month**, dominated by whichever managed tier you outgrow first |
| **Total (institute-VM path)** | near **$0 external**, plus the domain fee and institute ops time |

**Bottom line:** a student-scale institute should run at **~$0/month** on the
institute VM + Neon/Cloudinary free tiers, and only creep into low-tens-of-USD
territory as media, audit/analytics logs, and event volume grow — a transition
the Developer Console's `infraCost` estimates will flag **before** it becomes a
surprise. Confirm all current numbers at the pricing URLs above.
