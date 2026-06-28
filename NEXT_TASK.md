# Next Task

**As of:** 2026-06-29 · **Session 7 complete → Session 8 is next.**

## Session 8 — Developer Console

Build the **Developer Console**: the RBAC-gated operational surface a developer uses
to observe and run the system — monitoring, logs, the **audit-log viewer**, testing
reports, backup/restore/rollback, migration status, and cost estimation. This is the
first Session that consumes the audit/migration/backup plumbing built in Sessions
2–7 (it reads more than it writes). **Read first:** [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md),
[CURRENT_STATUS.md](CURRENT_STATUS.md), [TODO.md](TODO.md),
[KNOWN_ISSUES.md](KNOWN_ISSUES.md), [docs/CHANGELOG.md](docs/CHANGELOG.md),
[docs/DECISION_LOG.md](docs/DECISION_LOG.md) (esp. DL-012/DL-028 audit, DL-031
transition, DL-043 media migration), [docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md)
(`audit_log`, `transition_run`, `backup_record`), and the existing services in
`lib/cms/*`, `lib/year/*`, `lib/media/migrate.mjs`.

### Ordered tasks (suggested)
1. **Audit-log viewer / reader** — a read layer over `audit_log` (filter by actor /
   entity / action / year / time-range; the BRIN/GIN indexes already exist). Gate on
   `audit.read` / `dev.console`. The central writer (DL-028) already populates it.
2. **Monitoring + status** — surface DB connectivity / Neon state, migration status
   (`prisma migrate status` shape), `transition_run` history + counts, and the media
   migration plan/counts (dry-run of `migratePublicAssets`). Read-only.
3. **Testing reports** — a place to surface the static/live test outcome + the
   per-session token usage (`docs/Token_Usage.md`).
4. **Backups / restore / rollback** — wire `backup_record` + the existing
   `scripts/backup*.mjs`; expose the media migration **rollback** (DL-043) and the
   transition **force re-sync** (DL-031) behind `backup.*` / `dev.console`.
5. **Cost estimation** — surface the Token_Usage numbers + a simple Neon/Cloudinary
   cost view.
6. **Tests** — static (pure filter/format/report logic) + a small live-DB read test
   over `audit_log`. Keep the static suite default-green; reuse the throwaway-fixture
   pattern.

### Guard rails (rely on them; don't re-implement)
- Reads use `prisma` from `lib/prisma.mjs`; any mutating op (rollback, re-run) goes
  through the EXISTING service (`lib/media/migrate.mjs`, `lib/year/transition.mjs`,
  CMS) — do NOT write a new mutation/audit pipeline. Honor DB guards via `mapDbError`.
- Gate every console surface with `requirePermission` (`dev.console` / `audit.read` /
  `backup.*`). Developer (`is_developer` / `grants_all`) short-circuits.
- Neon has high per-query latency + auto-suspends — give live tests generous timeouts
  and re-run once on a cold-compute "Can't reach database server". Prisma CLI reads
  `.env` not `.env.local` — use the `db:*` scripts.
- Never `prisma db pull` / `migrate reset`; any raw-SQL change is a NEW forward
  migration (`CREATE OR REPLACE`), never an init edit (DL-027/DL-036).

### End-of-session (mandatory)
Run the END-OF-SESSION checklist in [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md):
update CURRENT_STATUS, NEXT_TASK, TODO, CHANGELOG, DECISION_LOG, KNOWN_ISSUES,
Developer Guide, Token_Usage; prepare one specific commit; output the Session-9
starter prompt.

## Operator-owned (run when convenient)
- **Populate the live current year:** `npm run db:import:org` (~15 min) then
  `npm run db:import:events` (~1 min) then `npm run db:import:resources` (after org;
  ~1 min). All idempotent operator steps like `db:seed` (KNOWN_ISSUES #27).
- **Run the Media Migration:** set `CLOUDINARY_*` in `.env.local`, then
  `npm run db:migrate:media` (dry-run) → `-- --apply`. Idempotent + reversible
  (`-- --rollback`). After verifying, prune `/public` to shrink the ~74 MB (#18).

## Owner-owned (parallel, anytime)
- Rotate/revoke the V1 leaked secrets and clean `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md));
  consider rotating the Neon password (#19).
