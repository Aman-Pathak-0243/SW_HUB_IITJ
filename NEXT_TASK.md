# Next Task

**As of:** 2026-06-29 · **Session 9 complete → Session 10 is next (the FINAL session).**

## Session 10 — Testing + Deployment + Optimization + Handover

The last session: harden, prove, and ship. The product is feature-complete across
Sessions 1–9 (DB/RBAC/auth, CMS, year engine, org model, events/announcements,
resources/media, developer console, and the RBAC-gated Admin Panel). Session 10 is
about confidence and deployability, **not** new features. **Read first:**
[docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md), [CURRENT_STATUS.md](CURRENT_STATUS.md),
[TODO.md](TODO.md), [KNOWN_ISSUES.md](KNOWN_ISSUES.md), [docs/CHANGELOG.md](docs/CHANGELOG.md),
[docs/DECISION_LOG.md](docs/DECISION_LOG.md), and the testing/perf/deploy docs in `/docs`.

### Ordered tasks (suggested)
1. **Full test gate** — run the complete static suite (`npm test`, currently 285
   green) AND the full live-DB suite (`RUN_DB_TESTS=1 dotenv -e .env.local -- npm test`:
   cms 8 / year 6 / org 4 / events 10 / resources 4 / media 3 / devconsole 10 /
   users 6). Confirm all green on a warm Neon (re-run once on a cold-compute
   transient). Add a CI workflow that runs the static suite on push/PR (the live
   suite stays opt-in / nightly with the secret).
2. **Performance / Core Web Vitals** — measure + improve the public pages (the org /
   events / resources Server Components): bundle size, image strategy (Cloudinary
   `f_auto,q_auto`), font consolidation (KNOWN_ISSUES #12), brand-blue consistency
   (#11). The admin panel is `force-dynamic` (internal, low-traffic) — focus CWV on
   public routes.
3. **Responsive / cross-browser** — verify the public pages + the admin panel across
   breakpoints (the admin sidebar has a mobile-collapse class — wire the toggle) and
   browsers; fix layout regressions.
4. **Deploy hardening** — production env checklist (`NEXTAUTH_SECRET`, Google OAuth
   redirect URIs, `DATABASE_URL`/`DIRECT_URL`, `CLOUDINARY_*`); confirm `next build`
   output + serverless function tracing (the benign Turbopack NFT warning from the
   dev-console fs reads — decide: silence via `outputFileTracingIncludes` or accept);
   security headers; rate-limit / CSRF posture on `POST /api/admin/action` and
   `POST /api/events`.
5. **Prune the V1 leftovers** — now that `/admin` + `/org/*` supersede them, remove the
   remaining static V1 pages where safe (`app/page1.js`, the four `app/Clubs/*` once
   `/org/*` is confirmed, KNOWN_ISSUES #10/#13) and prune `/public` after a verified
   media migration (#18).
6. **Handover** — a concise operator runbook (deploy, seed/bootstrap, run the
   imports, manage admins) pointing at [docs/ADMIN_PANEL_GUIDE.md](docs/ADMIN_PANEL_GUIDE.md);
   final docs sweep so a future student can run the whole thing from zero.

### Guard rails (unchanged)
- Never `prisma db pull` / `migrate reset`; any raw-SQL change is a NEW forward
  migration (`CREATE OR REPLACE`). Prisma CLI reads `.env` not `.env.local` — use the
  `db:*` scripts. Neon has high per-query latency + auto-suspends (generous live-test
  timeouts; re-run once on a cold-compute "Can't reach database server").
- Don't add features; if a gap is found, fix/test it, don't expand scope.

### End-of-session (mandatory)
Run the END-OF-SESSION checklist in [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md):
update all tracking docs, record decisions, prepare one specific commit, and write the
**final project handover** (this is the last session — there is no Session 11 prompt).

## Operator-owned (run when convenient — still pending from earlier sessions)
- **Populate the live current year:** `npm run db:import:org` (~15 min) → `db:import:events`
  → `db:import:resources` (all idempotent; KNOWN_ISSUES #27).
- **Run the Media Migration:** set `CLOUDINARY_*` in `.env.local`, then
  `npm run db:migrate:media` (dry-run) → `-- --apply`; then prune `/public` (#18).
- **Observe it all:** `npm run db:console [-- --audit]`, or the Developer Console at
  `/admin/console`.

## Owner-owned (parallel, anytime)
- Rotate/revoke the V1 leaked secrets and clean `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md));
  consider rotating the Neon password (#19).
