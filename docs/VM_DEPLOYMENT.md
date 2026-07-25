# VM Deployment — as actually deployed

The concrete, executed record of standing this portal up on a single institute VM:
**local Docker Postgres 16 · PM2 · nginx · email+password login only**. Every command
here was run and verified on 2026-07-25.

> Related docs: [`OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md) is the general
> operator manual (env checklist, imports, admins, recovery);
> [`../systemRequirements.md`](../systemRequirements.md) originates the sizing and
> firewall posture; [`DEPLOYMENT.md`](DEPLOYMENT.md) is the build/run background.
> **This file is the VM-specific instance of those** — where they describe options,
> this describes what was chosen and run.

---

## 0. This deployment's shape

| Decision | Value | Why / consequence |
|---|---|---|
| Database | **Local Postgres 16 in Docker**, loopback-only | Sub-ms queries, no cold starts. Neon is *not* used — every "waking Neon" retry message in the scripts is dead code on this host. You own backups (§10). |
| Process manager | **PM2**, fork mode, process `student-welfare` | Single instance. The rate limiter and in-process SSE broadcaster are per-process, so cluster mode would fragment both. |
| Reverse proxy | **nginx** on :80 → `127.0.0.1:3000` | Port 3000 is never exposed. Config carries the SSE upgrade/buffering settings already. |
| TLS | **Not yet** — pending domain | §11 is the whole remaining step. |
| Google OAuth | **Not configured** | The provider is conditional ([`../lib/auth/options.mjs`](../lib/auth/options.mjs) `buildProviders`) — the button simply doesn't render. Login is email+password (argon2id) only. |
| Cloudinary | **Not configured** | Images serve from the bundled `public/` folder. **Do not** run `db:migrate:media` and **do not** prune `public/`. |
| Redis | **Not started** | Optional by design. Live features run single-instance with an in-process broadcaster + Postgres leaderboard fallback. |
| Repo path | `~/SW_HUB_IITJ` | Arbitrary; the docs' `~/IIT-JAMMU-STUDENT-WELFARE` is V1 convention. |

Verified VM: Ubuntu 24.04 LTS, 2 vCPU, 4 GB RAM, 38 GB SSD — Tier A per
[`../systemRequirements.md §3`](../systemRequirements.md).

---

## 1. VM baseline

```bash
nproc; free -h; df -h /; lsb_release -a

# 2 GB swap — next build will OOM on a 4 GB box without it
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# IST — event windows, countdowns and registered_at ordering depend on it
sudo timedatectl set-timezone Asia/Kolkata
```

## 2. Base packages

```bash
sudo apt update && sudo apt install -y git curl nginx build-essential ca-certificates
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

**Reboot here** — it applies the `docker` group membership and any pending kernel
upgrade in one go. Then confirm `docker ps` works *without* sudo.

Installed versions at time of deploy: Node 22.23.1, Docker Compose v5.3.1, nginx 1.24.0.

## 3. Clone

```bash
cd ~ && git clone https://github.com/Aman-Pathak-0243/SW_HUB_IITJ.git
cd ~/SW_HUB_IITJ
```

## 4. Postgres 16

The password is a Docker secret file, not an env var
([`../docker-compose.prod.yml`](../docker-compose.prod.yml) `secrets:`). Use
alphanumerics only — the value goes into a URL, where `@ : / ?` would need encoding.

```bash
mkdir -p secrets
printf '%s' "$(openssl rand -hex 24)" > secrets/pg_password.txt
chmod 600 secrets/pg_password.txt
```

```bash
# postgres ONLY — a bare `up -d` would also start the Redis container, which this
# deployment does not use
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml ps          # wait for "healthy"
```

```bash
# the bind-mounted ./backups must be writable by the container's postgres uid
sudo chown 999:999 backups
docker exec iitj-prod-pg pg_isready -U iitj -d iitj   # "accepting connections"
```

Postgres publishes to `127.0.0.1:5432` only — never to `0.0.0.0`.

## 5. `.env.local`

Git-ignored, so it exists **only on the VM**. Create it at the repo root:

```bash
PGPW=$(cat secrets/pg_password.txt)
cat > .env.local <<EOF
DATABASE_URL="postgresql://iitj:${PGPW}@127.0.0.1:5432/iitj?sslmode=disable"
DIRECT_URL="postgresql://iitj:${PGPW}@127.0.0.1:5432/iitj?sslmode=disable"

NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="http://<VM_IP>"

BOOTSTRAP_DEVELOPER_EMAIL=<you>@iitjammu.ac.in
BOOTSTRAP_DEVELOPER_PASSWORD='<strong-password>'
EOF
chmod 600 .env.local
```

Notes specific to this deployment:

- Local Postgres has no PgBouncer pooler, so **`DIRECT_URL` equals `DATABASE_URL`**.
- **`BOOTSTRAP_DEVELOPER_PASSWORD` is mandatory here.** With no Google provider, an
  account seeded without a password cannot sign in at all
  ([`../prisma/seed.mjs`](../prisma/seed.mjs) — `devCredential` is `{}` when unset).
- **Do not use `BOOTSTRAP_ADMIN_EMAILS`** on a password-only deployment: the seed
  creates those accounts *without* a password, so they would be locked out. Create
  colleagues from **Users & Roles** (`/admin/users`) in the panel instead.
- `NEXTAUTH_URL` must match the origin typed in the browser, port included if
  non-standard. It drives NextAuth's post-login redirect **and** the same-origin CSRF
  check ([`../lib/http/guard.mjs`](../lib/http/guard.mjs) `assertSameOrigin`).
  A mismatch bounces login to an unreachable host.
- No `GOOGLE_*`, no `CLOUDINARY_*`, no `REDIS_URL`.

## 6. Install, migrate, seed

```bash
npm ci
npm run db:generate
npm run db:migrate     # prisma migrate deploy — 13 forward migrations
npm run db:seed
```

Expected seed result:

```json
{ "academicYear": "2025-26", "permissions": 52, "roles": 11, "rolePermissions": 181,
  "orgUnitTypes": 6, "allowedChildEdges": 6, "positions": 16, "contentTypes": 13,
  "users": 1, "roleAssignments": 1, "featureFlags": 1 }
```

> **Never** run `npm run db:reset`, `prisma migrate reset`, or `prisma db pull`
> against this database. The schema's triggers, partial uniques and `citext` live in
> raw SQL inside the migrations and are invisible to Prisma introspection — a reset
> or pull destroys them. Schema changes are new forward migrations only
> ([`OPERATIONS_RUNBOOK.md §0`](OPERATIONS_RUNBOOK.md)).

## 7. Build + PM2

```bash
npm run build
pm2 start npm --name student-welfare -- run start
pm2 list                        # expect status=online, restarts=0
pm2 save
pm2 startup systemd             # run the sudo command it prints back
curl -I http://127.0.0.1:3000   # expect 200 + the security headers
```

Three build warnings are **expected and benign**:

| Warning | Why it's fine |
|---|---|
| `Can't resolve 'ioredis'` | Optional, lazily imported in a `try/catch` with a documented fallback ([`../lib/realtime/redis.mjs`](../lib/realtime/redis.mjs)). |
| `Can't resolve 'nodemailer'` | Same pattern for bulk mail ([`../lib/mail/service.mjs`](../lib/mail/service.mjs)). |
| `Unexpected file in NFT list` on `next.config.mjs` | The dev-console fs reads; KNOWN_ISSUES #32. |

`pm2 start npm --name X -- run start` is more reliable than the quoted-string form.
PM2 prints a large ASCII banner on first run — let it finish; interrupting it leaves
no process registered and `pm2 save` then warns *"PM2 is not managing any process"*.

## 8. nginx

```bash
sudo tee /etc/nginx/sites-available/portal >/dev/null <<'EOF'
server {
  listen 80 default_server;
  server_name _;                       # replace with the domain in §11

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;                    # real Host → NextAuth + CSRF
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;         # SSE / live endpoints
    proxy_set_header Connection "upgrade";
    proxy_buffering off;                            # stream SSE immediately
    proxy_read_timeout 3600s;
  }
}
EOF

sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/portal /etc/nginx/sites-enabled/portal
sudo nginx -t && sudo systemctl reload nginx
curl -I http://127.0.0.1
```

A correct response carries `X-Powered-By: Next.js` and `Content-Length: 59211`.
A 615-byte `text/html` response is nginx's own welcome page — reload hadn't taken
effect yet; re-run the curl.

## 9. Firewall

```bash
sudo ufw allow 22        # ALWAYS before enable, or you lock yourself out over SSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw --force enable
sudo ufw status
```

Only 22/80/443. **5432** (Postgres) and **3000** (the Next server) stay closed —
Postgres is loopback-bound and the app is reachable only through nginx.

## 10. Populate the academic year

Order matters — resources bind to org units. All are idempotent (a re-run reports
`0 created`).

```bash
npm run db:import:org        # councils, clubs, hostels, messes + profiles/people/appointments
npm run db:import:events     # the 3 backed-up V1 events
npm run db:import:resources  # per-unit PDFs / Drive links — AFTER org
npm run db:seed:flagship     # the 6 curated fests
```

Verified 2025-26 result on this VM:

```
  content_type   |  status   | count
-----------------+-----------+-------
 club_profile    | published |    30
 council_profile | published |     5
 event           | published |     3
 flagship_event  | published |     6
 hostel_profile  | published |     6
 mess_profile    | published |     5
 resource        | published |     6
```

Check it any time with:

```bash
docker exec iitj-prod-pg psql -U iitj -d iitj -c "
SELECT content_type, status, count(*)
FROM content_item WHERE archived_at IS NULL
GROUP BY 1,2 ORDER BY 1,2;"
```

`resources.missingUnit` must be **0** — a non-zero count means the org import didn't
complete first; re-run `db:import:resources` after fixing that (it is resumable).

Until `db:import:org` has run, `/org/*` renders an empty "not available for the
current year" state. That is correct data-driven behavior, not a bug.

## 11. Backups

```bash
crontab -e
```

```cron
0 2 * * * docker exec iitj-prod-pg pg_dump -U iitj -d iitj -F c -f /backups/iitj-$(date +\%F).dump
```

`/backups` inside the container is `~/SW_HUB_IITJ/backups` on the VM. The `\%` escape
is required — cron reads a bare `%` as a newline. Restore with `pg_restore`, never
with `migrate reset`.

Two gaps to close when convenient: **retention** (this keeps dumps forever; ~14 daily
is the runbook's suggestion) and **off-box copies** (dumps currently sit on the same
VM as the database, so a VM loss takes both).

## 12. Remaining: domain + TLS

The only outstanding work. When DNS points at the VM:

```bash
# 1. env
nano .env.local                  # NEXTAUTH_URL="https://<domain>"

# 2. nginx
sudo nano /etc/nginx/sites-available/portal   # server_name _;  →  server_name <domain>;
sudo nginx -t && sudo systemctl reload nginx

# 3. certificate (rewrites the vhost to :443 and adds the :80 redirect)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d <domain>

# 4. restart so Next re-reads .env.local
pm2 restart student-welfare
```

Nothing else changes. Port 443 is already open from §9.

## 13. Redeploying

```bash
cd ~/SW_HUB_IITJ
git pull origin main
npm ci                 # only if dependencies changed
npm run db:migrate     # only if there are new migrations
npm run build          # always — Next serves the built output
pm2 restart student-welfare && pm2 save
```

## 14. Host-only state — back this up separately

None of these are in git; losing them is painful:

| File | Consequence if lost |
|---|---|
| `.env.local` | Regenerating `NEXTAUTH_SECRET` invalidates every active session. |
| `secrets/pg_password.txt` | Must be re-derived to reach the database. |
| `/etc/nginx/sites-available/portal` | Rebuild from §8. |
| `backups/*.dump` | The only copy of the data outside the Docker volume. |

Keep copies in a private ops repo or a secret store, per
[`../systemRequirements.md §11`](../systemRequirements.md).

## 15. Things that actually went wrong

| Symptom | Cause | Fix |
|---|---|---|
| `pm2 save` → *"not managing any process"* | `^C` during PM2's first-run banner killed the start | Re-run `pm2 start`, let the banner finish |
| Site unreachable on `:3000` after it had worked | `sudo ufw` lines executed from a shell paste buffer; 3000 isn't in the allow list | Intended state — reach it via nginx on :80 |
| `curl http://127.0.0.1` returned the 615-byte nginx page | curl raced `systemctl reload` | Re-run the curl |
| `ERROR: column d.id does not exist` | `content_item.content_type` *is* the key — no join to `content_type_def` needed | Query `content_item` directly |
| `rm: remove write-protected file?` on a dump | `docker exec pg_dump` writes as root | Answer `y`, or `sudo rm` |

Multi-line pastes into an interactive shell are the common thread in two of those:
commands typed while a foreground process runs are buffered and execute afterwards.
Paste one command at a time when a step is long-running or chatty.
