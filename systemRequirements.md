# System Requirements — Self-Hosting the IIT Jammu Student Affairs Portal V2 on a Single VM

> **Scope.** This document specifies the **hardware, OS, and infrastructure** to run the
> portal on **one institute VM**, with **PostgreSQL running in Docker on the same VM** (the
> topology you asked for). It originates the CPU/RAM/disk figures (no numeric sizing existed
> in the repo before this doc), states *why* each figure, and gives a **second sizing tier**
> for the live-quiz / real-time / high-concurrency workload.
>
> Companion docs (already in the repo): capacity & cost — [`RESOURCES.md`](RESOURCES.md);
> operator setup/deploy — [`docs/OPERATIONS_RUNBOOK.md`](docs/OPERATIONS_RUNBOOK.md);
> build background & "what is NOT present" — [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

---

## 1. Runtime stack (exact versions — from `package.json`)

| Component | Version / requirement | Notes |
|---|---|---|
| **Node.js** | **≥ 20.9.0**, validated on **22.x LTS** | Next 16.2.9 `engines.node`. `package.json` pins no `engines` field — use 20.9+ or 22 LTS. |
| **Next.js** | `^16.2.9` (App Router, Turbopack) | `next build` → `next start` on `PORT` (default 3000). |
| **React / react-dom** | `^19.2.7` | Server Components are the default; pages are `force-dynamic`. |
| **Prisma (client + CLI)** | `^6.19.3` | `provider = postgresql`; `DATABASE_URL` (pooled) + `DIRECT_URL` (unpooled, for migrate). |
| **PostgreSQL** | **16** (`postgres:16-alpine`) | Validated engine (see `docker-compose.yml`). **Required** — the schema uses raw-SQL triggers, `citext`, partial / `NULLS NOT DISTINCT` uniques, `FOR UPDATE SKIP LOCKED`. SQLite/MySQL cannot host these. |
| **NextAuth** | `^4.24.14` | Stateless **JWT** sessions (no session table). Credentials (argon2id) always; Google only when env set. |
| **@node-rs/argon2** | `^2.0.2` | **Native module** — needs a matching prebuilt binary or a C toolchain at `npm ci` time. |
| **pdfjs-dist** | `6.0.227` | Client-side PDF rendering (`canvas` aliased out in `next.config.mjs`). |
| **Tailwind CSS** | v4 (`@tailwindcss/postcss`) | No `tailwind.config.js`. |
| **nodemailer** (optional) | not installed by default | Only if bulk mail (M8) is enabled — `npm install nodemailer` + `MAIL_*` env. |
| **mongoose** | `^8` (legacy) | Retired from the request path; used only by a read-only backup script. Not needed at runtime. |

**Media is off-VM.** Every image/PDF is served from **Cloudinary** (`res.cloudinary.com` is the
only allow-listed `next/image` host in `next.config.mjs`). The VM stores **no media blobs**, so
VM disk sizing is driven by the OS, the app, and the Postgres data directory — not by media.

---

## 2. Target topology (single VM)

```
                          Internet (HTTPS 443)
                                  │
                     ┌────────────▼─────────────┐
                     │  nginx / Caddy (TLS)      │   ← Let's Encrypt; terminates TLS,
                     │  reverse proxy :443→:3000 │     forwards real Host/Origin,
                     └────────────┬─────────────┘     upgrades WS/SSE (see §8)
                                  │  127.0.0.1:3000
                     ┌────────────▼─────────────┐
                     │  Next.js (next start)     │   ← PM2 process "student-welfare"
                     │  Node 20.9+/22 LTS        │
                     └───────┬───────────┬───────┘
                127.0.0.1:5432│           │ HTTPS
                     ┌────────▼───────┐   │
                     │ Postgres 16    │   └────────────►  Cloudinary (media, off-VM)
                     │ (Docker, local │
                     │  volume + bkup)│   [+ Redis 7 (Docker) — only if live real-time, §12]
                     └────────────────┘
```

Everything except media runs on one VM. Postgres is **local** (Docker), bound to
`127.0.0.1` — **not** published to the internet.

> **Local Postgres vs Neon (important).** The repo's *production* DB has historically been
> **Neon** (serverless, ~1.5–2.5 s per-query latency, auto-suspend). Putting Postgres **on the
> VM** makes queries **sub-millisecond** and removes cold-starts. This is a real win for the
> live-leaderboard / quiz features — polling and per-write aggregates become cheap. The
> trade-off: you now own backups, upgrades, and uptime (see §6, §13).

---

## 3. VM sizing

Two tiers. Pick **Tier A** for the current product (public site + admin/coordinator/member
surfaces + event registration). Move to **Tier B** if/when you run **live quizzes with live
leaderboards for a large simultaneous audience** (the real-time feature — see §12).

### Tier A — Baseline (current feature set)

| Resource | Recommended | Minimum | Why |
|---|---|---|---|
| **vCPU** | **2 vCPU** | 1 vCPU | Next SSR + Node + a local Postgres share the box. 1 vCPU works for light traffic but leaves no headroom for a `next build` while serving. |
| **RAM** | **4 GB** | 2 GB | Node (~0.5–1 GB RSS) + Postgres 16 (`shared_buffers` ~256 MB + work mem + connections) + OS + build headroom. 2 GB is tight and needs swap during `next build`. |
| **Disk** | **40 GB SSD** | 20 GB | OS (~3–5 GB) + `node_modules`/`.next` (~1–2 GB) + Postgres data (KB→low-MB of rows today; `audit_log`/`page_visit` grow slowly) + room for `pg_dump` backups + logs. Media is on Cloudinary, so no media disk. |
| **Swap** | **2 GB** | 2 GB | Absorbs `next build` and Postgres autovacuum spikes on a small box. |
| **Bandwidth** | Modest | — | HTML/JSON only from the VM; images/PDFs come from Cloudinary's CDN, not the VM. |

*Why this is enough:* the data model is **51 small, normalized tables** (52 permissions, 11
roles, 13 content types), traffic is **bursty/seasonal** (spikes at registration windows, quiet
otherwise), and participation is **login-gated** so anonymous crawlers never hit the write path
(`RESOURCES.md §1`). A single small VM is the committed V1 topology (`pm2 restart
student-welfare`).

### Tier B — Live quizzes / live leaderboards / large concurrent audience

| Resource | Recommended | Why |
|---|---|---|
| **vCPU** | **4 vCPU** | Fan-out to many long-lived SSE/WebSocket connections + per-answer writes + running-score aggregation are CPU- and event-loop-bound. |
| **RAM** | **8 GB** | Node holding N open connections + Redis (pub/sub + a cached leaderboard) + Postgres under write load. |
| **Disk** | **60 GB SSD** | As Tier A + Redis persistence (optional) + higher `audit_log`/answer-table growth during large events. |
| **Extra services** | **Redis 7** (Docker) | Pub/sub fan-out + a cached leaderboard so you don't recompute rankings per viewer. |
| **PM2 mode** | **fork (single instance)** or cluster **with sticky sessions** | SSE/WebSocket connections and the in-memory rate limiter are per-process; multi-instance needs sticky routing + Redis-backed limits (see §11). |

> Even Tier B is a *single VM*. You only outgrow one VM when you need horizontal scale
> (multiple app instances behind a load balancer) — at which point the in-memory rate limiter
> and any in-process real-time state must move to Redis, and SSE/WS needs sticky sessions or a
> dedicated broker (Pusher/Ably). None of that is required for a single institute's scale.

---

## 4. Operating system & base packages

- **OS:** Ubuntu Server **22.04 or 24.04 LTS** (or any current LTS Linux). 64-bit.
- **Packages:** `docker` + `docker compose` v2, `git`, `curl`, `nginx` (or `caddy`), and
  Node 20.9+/22 (via `nvm`, `fnm`, or NodeSource). A C toolchain (`build-essential`) only if
  `@node-rs/argon2`'s prebuilt binary is unavailable for the platform.
- **Process manager:** **PM2** (global: `npm i -g pm2`), process name `student-welfare`.
- **Timezone:** set the OS + Postgres to a consistent zone (IST) so `registered_at` /
  countdown / event windows read correctly. All timestamps are `timestamptz` (UTC in the DB,
  formatted `en-IN` in the UI) — the DB is authoritative for ordering.

---

## 5. Environment variables (production checklist)

Secrets live only in a **git-ignored `.env.local`** (self-hosted) or the host secret store —
never committed. Canonical list in [`env.example`](env.example); mail vars in `RESOURCES.md §6`.

| Var | Required | Value for same-VM Postgres |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://iitj:<STRONG_PW>@127.0.0.1:5432/iitj?sslmode=disable` (local Postgres has **no** PgBouncer pooler, so this equals `DIRECT_URL`). |
| `DIRECT_URL` | ✅ | Same as `DATABASE_URL` for local Postgres (Prisma migrate uses this). |
| `NEXTAUTH_SECRET` | ✅ | `openssl rand -base64 32`, fresh per environment. |
| `NEXTAUTH_URL` | ✅ | The exact public origin, e.g. `https://portal.iitjammu.ac.in`. Drives NextAuth **and** the CSRF same-origin check. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Enables Google login. Redirect URI must be `<origin>/api/auth/callback/google`. |
| `CLOUDINARY_CLOUD_NAME` | ✅ (for media) | Cloud name alone serves images. |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | optional | Only for signed uploads during `db:migrate:media --apply`. |
| `BOOTSTRAP_*` | first run | Seeds the initial developer/admin account. |
| `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` / `MAIL_SECURE` | optional | Only if bulk mail is enabled (institute SMTP; 60 mail/min, 5000-recipient cap). **Not** in `env.example` — add if used. |
| `REDIS_URL` | Tier B only | `redis://127.0.0.1:6379` if live real-time is added (§12). |

> **Prisma CLI reads `.env`, not `.env.local`.** Always use the `db:*` npm scripts
> (dotenv-wrapped) for migrate/seed, per the repo protocol. **Never** `prisma db pull` /
> `migrate reset` / `db push` against a real DB — the schema's raw-SQL objects (triggers,
> partial uniques, citext) are invisible to introspection and would be lost.

---

## 6. PostgreSQL 16 in Docker on the same VM (production)

The committed [`docker-compose.yml`](docker-compose.yml) is scoped for **testing** (weak creds
`iitj/iitj`, port published to the host). For **production on the same VM**, harden it:

```yaml
# docker-compose.prod.yml  (production Postgres on the same VM)
services:
  postgres:
    image: postgres:16-alpine
    container_name: iitj-prod-pg
    restart: unless-stopped
    environment:
      POSTGRES_USER: iitj
      POSTGRES_PASSWORD_FILE: /run/secrets/pg_password   # or a strong env from the host store
      POSTGRES_DB: iitj
    ports:
      - "127.0.0.1:5432:5432"        # ← bind to loopback ONLY; never expose 5432 publicly
    volumes:
      - iitj-prod-pgdata:/var/lib/postgresql/data
      - ./backups:/backups           # pg_dump target (see §13)
    shm_size: "256mb"                 # room for sorts/hash joins
    command:
      - "postgres"
      - "-c"
      - "shared_buffers=256MB"
      - "-c"
      - "max_connections=100"
      - "-c"
      - "work_mem=16MB"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U iitj -d iitj"]
      interval: 10s
      timeout: 5s
      retries: 10
secrets:
  pg_password:
    file: ./secrets/pg_password.txt
volumes:
  iitj-prod-pgdata:
```

**Hardening checklist vs the test compose:**
- **Strong credentials** from a secret file / host store — not `iitj/iitj`.
- **Bind to `127.0.0.1:5432`** — the app connects over loopback; the DB is never reachable
  from the internet (defense-in-depth on top of the firewall in §14).
- **Its own named volume** (`iitj-prod-pgdata`), separate from the test volume.
- **`restart: unless-stopped`** so it survives reboots.
- **Connections:** Next server actions/routes open pooled Prisma connections. On one VM,
  `max_connections=100` is ample. If you later run PM2 **cluster** mode, either add PgBouncer
  or cap Prisma's pool (`?connection_limit=`) so instances × pool ≤ `max_connections`.

**DB sizing/tuning for this workload:** the dataset is tiny (KB→low-MB). `shared_buffers=256MB`
and `work_mem=16MB` are generous. The only monotonic growers are `audit_log` (one row per
mutation) and `page_visit` (analytics) — both covered by the built-in threshold + export/
truncate tooling (`lib/devconsole/storage.mjs`; `page_visit` is the one truncatable table).

---

## 7. Reverse proxy + TLS

No proxy config ships in the repo (`docs/DEPLOYMENT.md` "what is NOT present") — it's expected
on the VM. Example nginx front for `next start` on `:3000`, **with the SSE/WebSocket upgrade
headers the live features need**:

```nginx
server {
  listen 443 ssl http2;
  server_name portal.iitjammu.ac.in;

  ssl_certificate     /etc/letsencrypt/live/portal.iitjammu.ac.in/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/portal.iitjammu.ac.in/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;                    # real Host → NextAuth/CSRF work
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    # Required for live leaderboards / live quizzes (SSE or WebSocket, §12):
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;                            # stream SSE immediately
    proxy_read_timeout 3600s;                       # keep long-lived connections open
  }
}
# Redirect :80 → :443, obtain/renew certs with certbot (Let's Encrypt).
```

- `NEXTAUTH_URL` **must equal** the public origin, and the proxy must forward the real
  `Host`/`Origin` — otherwise NextAuth callbacks and the same-origin CSRF check on
  `/api/admin/action` + `/api/events/participate` will reject.
- TLS free via **Let's Encrypt** (certbot). Prefer an institute `.ac.in` subdomain as the
  single canonical origin. Caddy is a valid alternative (automatic TLS + easy reverse proxy).

---

## 8. Process management (PM2)

```bash
# one-time
npm ci
npm run db:migrate          # prisma migrate deploy (uses DIRECT_URL)
npm run db:seed             # first environment only
npm run build               # next build (does NOT connect to the DB — a well-formed URL suffices)
pm2 start "npm run start" --name student-welfare
pm2 save && pm2 startup     # survive reboots

# redeploy
git pull && npm ci && npm run db:migrate && npm run build && pm2 restart student-welfare && pm2 save
```

- **Mode:** run a **single fork instance** on Tier A/B. The rate limiter
  (`lib/http/guard.mjs`) is **in-memory / per-process**, and any real-time (SSE/WS) state is
  in-process — so a naive PM2 **cluster** would fragment both. If you need cluster mode, add
  **sticky sessions** at the proxy and move rate limits + pub/sub to **Redis**.
- **Health check:** the app has **no dedicated `/health` route** today (only the Developer
  Console's DB-health view). Add a lightweight liveness route before wiring an external
  uptime monitor / orchestrator probe (small, recommended follow-up).

---

## 9. Concurrency & scale — what's already safe, and what "large simultaneous userbase" needs

**Already robust at the DB tier (no app-level locks needed):**
- **Event registration is concurrency-safe by design.** `registered_at` is a Postgres
  `CURRENT_TIMESTAMP` default (server-authoritative ordering); a **partial-unique** dedups one
  active registration per user; a **`DEFERRABLE INITIALLY DEFERRED` constraint trigger**
  (`event_registration_capacity_guard_trg`) guarantees confirmed count never exceeds capacity —
  if two users race the last seat, the loser is caught and retried as **waitlisted**; waitlist
  auto-promotion uses `FOR UPDATE SKIP LOCKED`. This holds under a thundering herd.
- **Capacity / "unlimited until a deadline"** already model cleanly: `event_settings.capacity`
  (`NULL` = unlimited) + `registration_opens_at` / `registration_closes_at`.

**What a large *simultaneous* audience for live features needs (design constraints, not yet built):**
- **Don't query-per-viewer.** A live leaderboard must read from a **cached/denormalized
  aggregate** (a counter or Redis-cached ranking updated on write), never recompute rankings on
  every poll/render. (On Neon this was mandatory; on **local Postgres** per-query cost is tiny,
  so *near*-real-time polling of a cheap count endpoint is viable even without Redis.)
- **Fan-out transport.** "Live" needs push (**SSE** or **WebSocket**) or client **polling**.
  None exists today (no ws/SSE/polling anywhere in the codebase). See §12 for the options and
  their VM impact.

---

## 10. Real-time / live-quiz infrastructure — options & their VM impact

The live-quiz + live-leaderboard requirement is the **one feature that changes the VM spec**.
Three viable approaches on a single institute VM:

| Approach | New infra on VM | Latency | VM cost | Trade-off |
|---|---|---|---|---|
| **A. Polling a cached count/leaderboard endpoint** | none (Tier A) | ~1–3 s (poll interval) | lowest | Simplest; "near-real-time"; fine for hundreds of viewers with local Postgres + a short-TTL cache. |
| **B. Self-hosted SSE + Redis** | **Redis 7** (Docker) + SSE routes (Tier B) | sub-second | +Redis (~few hundred MB RAM) | True live; single-VM; you own the socket lifecycle; needs single-instance PM2 or sticky sessions. |
| **C. External broker (Pusher/Ably)** | none on VM | sub-second | external free tier / paid | Offloads fan-out; adds an external dependency + per-connection limits; least VM load. |

**Chosen approach: B — self-hosted SSE + Redis** (project decision, 2026-07-02). True live
quizzes/leaderboards, $0 external, everything on the VM. This **fixes the target at Tier B**
(4 vCPU / 8 GB / 60 GB SSD + a Redis 7 container) whenever the live-quiz feature is turned on:
run the Next app **single-instance under PM2** (or add sticky sessions), keep long-lived SSE
connections open through the proxy (§7 headers), and use Redis for pub/sub fan-out + a cached
leaderboard so rankings are never recomputed per viewer.

> **SHIPPED (Session 16, 2026-07-02).** The live-quiz domain — `quiz_question` /
> `quiz_session` / `quiz_participant` / `quiz_answer` keyed on the durable event id, a
> per-answer write path with a **server-authoritative timer**, and a **Redis-cached
> running-score leaderboard** — plus the **SSE transport** (`lib/realtime/*` +
> `app/api/live/*`) and a live **registration** leaderboard as the first step on the same
> transport. **Redis is OPTIONAL** and LAZY + INJECTABLE (the nodemailer pattern): without
> `REDIS_URL` + `ioredis` the app runs single-instance with an in-process broadcaster + a
> Postgres leaderboard fallback (fine for hundreds of viewers on local Postgres, §9). Turn
> Redis on for the large-concurrent-audience Tier-B path: start the **`redis` service in
> [`docker-compose.prod.yml`](docker-compose.prod.yml)** (loopback-bound), set `REDIS_URL`
> (§5), and `npm install ioredis`. The quiz is gated by the existing `event.manage` seam —
> no new permission/content type.

---

## 11. Backups & recovery

- **Postgres:** nightly `pg_dump` inside the container to the mounted `./backups` volume, plus
  periodic **volume snapshots** at the VM/host level. Example cron:
  ```bash
  0 2 * * *  docker exec iitj-prod-pg pg_dump -U iitj -d iitj -F c -f /backups/iitj-$(date +\%F).dump
  ```
  Retain ~14 daily + a few weekly; test a restore quarterly. Never `migrate reset` — restore
  from a dump.
- **Media:** already durable in **Cloudinary** (off-VM); no VM backup needed for media.
- **Config:** keep `.env.local`, the prod compose, and the nginx config in the host secret
  store / a private ops repo (not the app repo).
- The repo has a `backup_record` ledger + recovery delegates (`lib/devconsole`) and
  [`docs/BACKUP_AND_RECOVERY.md`](docs/BACKUP_AND_RECOVERY.md) for the app-level story.

---

## 12. Security posture

- **Firewall (ufw):** allow **22** (SSH, ideally key-only + restricted source), **80**, **443**
  only. **Do not** expose **5432** (Postgres) or **6379** (Redis) — bind both to `127.0.0.1`.
- **Postgres:** strong creds from a secret store; loopback-bound; own volume.
- **App:** all writes funnel through **one endpoint** (`POST /api/admin/action`) or gated
  routes with **same-origin CSRF** + **per-account rate limits** + live RBAC (permissions
  resolved from the DB every request; JWT proves identity only). Security headers (HSTS,
  X-Frame-Options, etc.) are set in `next.config.mjs`. **CSP is not yet set** (needs a nonce
  pipeline — tracked follow-up).
- **Secrets:** rotate any historically-committed secrets before publishing (see
  `KNOWN_ISSUES.md #1/#19`); `.env.local` is git-ignored.

---

## 13. Sizing summary & when to scale up

| Signal | Action |
|---|---|
| Public site + admin/coordinator/member + registration only | **Tier A**: 2 vCPU / 4 GB / 40 GB SSD, single VM, local Docker Postgres. |
| Adding **live quizzes / live leaderboards** for a large simultaneous audience | **Tier B**: 4 vCPU / 8 GB / 60 GB SSD + Redis; single-instance PM2 (or sticky + Redis limits). |
| Sustained CPU > ~70% or RAM pressure during events | Scale the VM up (more vCPU/RAM) before scaling out. |
| Need multiple app instances / HA | Move rate limits + real-time state to Redis, add sticky sessions or an external broker, front with a load balancer. |
| `audit_log` / `page_visit` growth | Use the built-in threshold + export/truncate tooling; `page_visit` is truncatable. |

**Bottom line:** one **2 vCPU / 4 GB / 40 GB** VM running the Next app under PM2 + a
loopback-bound Docker **Postgres 16**, fronted by nginx/Caddy with Let's Encrypt TLS, media on
Cloudinary — is sufficient for the current product at institute scale. Add **4 vCPU / 8 GB +
Redis** only when you turn on live real-time quizzes for a large concurrent audience.
