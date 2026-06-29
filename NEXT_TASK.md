# Next Task

**As of:** 2026-06-29 · **Session 8 complete → Session 9 is next.**

## Session 9 — Admin Panel

Build the **full RBAC-gated Admin Panel**: the authenticated UI over everything the
prior sessions built as services — CMS content (draft/publish/version/restore), the
Academic Year engine (years / transition wizard / lock), the Organization model
(units / people / appointments), Events + Announcements, Resources, Media, the
Developer Console (Session 8 readers), and **Users & Roles** (RBAC administration).
This is the first session whose primary deliverable is UI; it should call the
EXISTING services + readers, not add new business logic. **Read first:**
[docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md), [CURRENT_STATUS.md](CURRENT_STATUS.md),
[TODO.md](TODO.md), [KNOWN_ISSUES.md](KNOWN_ISSUES.md), [docs/CHANGELOG.md](docs/CHANGELOG.md),
[docs/DECISION_LOG.md](docs/DECISION_LOG.md) (esp. DL-019 live RBAC, DL-028 audit,
DL-046/047/048 dev console), and the service/reader layers in `lib/cms/*`,
`lib/year/*`, `lib/org/*`, `lib/events/*`, `lib/resources/*`, `lib/media/*`,
`lib/devconsole/*`.

### Ordered tasks (suggested)
1. **Admin shell + nav** — an authenticated `/admin` layout gated by
   `requireUser()`; render nav items per the viewer's effective permissions (call
   `getEffectivePermissions` once; show only modules the user can touch). Sign-in /
   sign-out, current-year indicator, developer badge.
2. **Content modules** — list / create / edit-draft / publish / unpublish / archive /
   restore + version history & diff for each `content_type` (events, announcements,
   resources, the org `*_profile` payloads), all through `lib/cms/content.mjs` wrapped
   in `withAuditContext`. Reuse the generic handler/registry so a new type needs no new
   screen.
3. **Org + Year modules** — org-unit / person / appointment CRUD (`lib/org/*`); the
   Transition Wizard UI + lock/unlock + set-current (`lib/year/*`).
4. **Media library** — browse / upload (curated `createMediaAsset`) / edit metadata /
   archive (`lib/media/service.mjs`); surface the migration status from the dev console.
5. **Users & Roles (NEW service work)** — the one area without a service yet: a
   `lib/users/*` (or `lib/rbac/admin.mjs`) for create/invite/suspend users and
   grant/revoke role assignments, audited via `auditedMutation`, gated on
   `user.*` / `role.*`. This is the main net-new backend of Session 9.
6. **Developer Console UI** — render the Session-8 readers: status dashboard, the
   audit-log viewer (filters + pagination + entry drill-down), testing/cost reports,
   the backup ledger, and the recovery actions (media rollback / transition force).
7. **Tests** — static (pure view-model / form-validation helpers) + a small live-DB
   test for any NEW service (users/roles). Keep the static suite default-green; reuse
   the throwaway-fixture pattern.

### Guard rails (rely on them; don't re-implement)
- The UI calls EXISTING services/readers; mutations go through `lib/cms/*` /
  `lib/year/*` / `lib/org/*` / `lib/media/service.mjs` / the new users-roles service —
  never a new mutation/audit pipeline. Honor DB guards via `mapDbError`.
- Every route handler / server action calls `requirePermission(...)` (or
  `requireUser()` + the service gate) FIRST; the dev-console readers already gate
  themselves (`authorizeConsole`). Developer / `grants_all` short-circuits.
- Audit every mutation via `withAuditContext({ actorUserId, ip, userAgent }, ...)` so
  rows are attributed; the Session-8 viewer will show them.
- Neon has high per-query latency + auto-suspends — generous live-test timeouts,
  re-run once on a cold-compute "Can't reach database server". Prisma CLI reads `.env`
  not `.env.local` — use the `db:*` scripts.
- Never `prisma db pull` / `migrate reset`; any raw-SQL change is a NEW forward
  migration (`CREATE OR REPLACE`), never an init edit (DL-027/DL-036).

### End-of-session (mandatory)
Run the END-OF-SESSION checklist in [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md):
update CURRENT_STATUS, NEXT_TASK, TODO, CHANGELOG, DECISION_LOG, KNOWN_ISSUES,
Developer Guide, Token_Usage; prepare one specific commit; output the Session-10
starter prompt.

## Operator-owned (run when convenient)
- **Populate the live current year:** `npm run db:import:org` (~15 min) then
  `npm run db:import:events` (~1 min) then `npm run db:import:resources` (after org;
  ~1 min). All idempotent operator steps like `db:seed` (KNOWN_ISSUES #27).
- **Run the Media Migration:** set `CLOUDINARY_*` in `.env.local`, then
  `npm run db:migrate:media` (dry-run) → `-- --apply`. Idempotent + reversible
  (`-- --rollback`). After verifying, prune `/public` to shrink the ~74 MB (#18).
- **Observe it all:** `npm run db:console` (system status + reports) and
  `npm run db:console -- --audit` (recent audit-log entries) read the live DB.

## Owner-owned (parallel, anytime)
- Rotate/revoke the V1 leaked secrets and clean `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md));
  consider rotating the Neon password (#19).
