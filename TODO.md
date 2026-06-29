# TODO

Backlog grouped by the **10 sessions** (see [docs/MILESTONE_PLAN.md](docs/MILESTONE_PLAN.md)
and [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md)). Updated at the end of
every session. `[ ]` pending · `[~]` in progress · `[x]` done.

## Session 1 — Analysis + Documentation + Architecture ✅
- [x] Full repo analysis
- [x] `/docs` (as-is + target) + tracking files
- [x] Security scanning (gitleaks CI + runbook)
- [x] Verified backup incl. Mongo dump (events 3 + queries 1)
- [x] Database pivot → PostgreSQL (Neon) + Prisma; secret in `.env.local`
- [x] Verified schema design (SCHEMA_DESIGN.md, 33 tables, ER + reasoning)
- [x] DATA_MIGRATION_REPORT, DECISION_LOG, SESSION_PROTOCOL; MILESTONE_PLAN as living doc

## Session 2 — Database + Prisma + RBAC + Authentication ✅
- [x] Install deps; add Prisma + adapter (+ @node-rs/argon2); set `DIRECT_URL` (+ `pgbouncer=true` on pooled)
- [x] `prisma/schema.prisma` from SCHEMA_DESIGN.md (33 tables, 14 Prisma enums)
- [x] Raw-SQL migration objects (partial/NULLS-NOT-DISTINCT uniques, composite FK, 6 triggers, GIN/BRIN, CHECKs)
- [x] `prisma migrate` applied on Neon (single hand-assembled init; `migrate status` clean)
- [x] Seed (year 2025-26, 40 perms, 5 roles+role_permission, 6 org types + 6 edges, 16 positions, 10 content types, bootstrap dev/admins)
- [x] NextAuth + Prisma adapter; Google + credentials (argon2id); one account per email; JWT
- [x] Server-side RBAC util; replaced hardcoded email allowlist (KNOWN_ISSUES #8); gated `POST /api/events` (#2)
- [x] Tests: auth/password, credentials authorize, RBAC, content-type registry, schema+migration, live DB smoke (50 passing)
- [x] Adversarial review workflow (16 agents); confirmed findings fixed + re-verified

## Session 3 — CMS Foundation ✅
- [x] Draft/publish lifecycle + restore + version history (content_item/content_revision/*_payload) — `lib/cms/content.mjs`
- [x] Central audit-log writer — one Prisma client `$extends` + semantic service path (DL-012/DL-025/DL-028); attached to lib/prisma.mjs
- [x] Generic schema-driven editing layer + content_type registry handlers (lib/cms/content-types.mjs)
- [x] Public visibility rule (published AND current year + event/announcement windows) — `lib/cms/visibility.mjs`
- [x] Friendly DB-guard error mapping (`lib/cms/errors.mjs`, DL-029); honors triggers/uniques, no app re-implementation
- [x] Tests: 101 static (cms-errors/audit/content-types/visibility/diff) + 8 live-DB (lifecycle/restore/version/audit/visibility/republish/lock_guard)
- [x] Adversarial review workflow (30 agents, 5 lenses); 24 confirmed findings fixed + re-verified

## Session 4 — Academic Year Engine ✅
- [x] Year context (`lib/year/context.mjs`): current-year resolve/set-current, list/create years; gated on `year.*`, audited
- [x] History queries (`lib/year/history.mjs`): cross-year content/org/roster reads + `org_unit_lineage` follow; lock_guard respected (read-only past years)
- [x] Transition Wizard (`lib/year/transition.mjs`): copy structure forward reusing lineage (DL-007); copy_appointments/content/role_assignments options (DL-026); `transition_run` status+counts; idempotent/resumable + force re-sync; audited `transition`
- [x] Lock/unlock (`lib/year/lock.mjs`): can't lock current year; `YEAR_LOCKED` surfaced
- [x] Public year selector (`lib/year/public.mjs`): chosen-year published content, archive-aware windows (DL-032)
- [x] Shared `auditedMutation`+`TX_OPTS` (`lib/cms/audited-mutation.mjs`, DL-033); shared public read loop; `mapDbError` year/transition signatures
- [x] Tests: 130 static (year + year-transition) + 6 live-DB (resolution/history/transition×3/lock); 8 CMS live still green
- [x] Adversarial review (24 agents, 6 lenses); 18 findings → 16 fixed, 2 nits accepted

## Session 5 — Organization Model (Clubs, Councils, Hostels, Mess) ✅
- [x] Org-unit + lineage service (`lib/org/units.mjs`); honors hierarchy + lock guards; lineage minted only for new logical units (DL-007)
- [x] Person directory (`lib/org/people.mjs`, dedup-by-name case-insensitive, DL-034) + appointment service (`lib/org/appointments.mjs`); honors composite FK + type guard + both cardinality guards
- [x] V1 dataset (`lib/org/data/*`: 4 councils/30 clubs/6 hostels/5 messes/17 committee; "Technical Secretary") + idempotent importer (`lib/org/import.mjs`, `npm run db:import:org`)
- [x] Data-driven public pages: one `<OrgUnitPage>` + `app/org/[type]/...` replaces the 4 Clubs pages (#13); `lib/org/public.mjs` read layer
- [x] Forward migration `20260628130000_fix_appointment_singleton_guard` (is_singleton NULL bug; DL-036), applied to Neon
- [x] Tests: 152 static (`org.test.mjs`) + 4 live-DB (`org.db.test.mjs`: hierarchy/type/cardinality guards, idempotent importer, public read)
- [x] Adversarial review (25 agents, 6 lenses); 15 confirmed → 13 fixed, 2 accepted
- [ ] **Operator:** run `npm run db:import:org` to populate the live 2025-26 year (#27)

## Session 6 — Events + Announcements ✅
- [x] Events + Announcements as CMS `content_type` callers (`lib/events/*`) — no new pipeline (DL-037); publish windows via the DB CHECKs → `PUBLISH_WINDOW`
- [x] Idempotent events importer (`lib/events/import.mjs`, `npm run db:import:events`) — 3 backed-up Mongo events → `content_item`+`event_payload` (+ media inventory, never base64 blobs — #5/DL-039); re-runs create 0; partial run resumes
- [x] V1 Mongo events API replaced by a CMS-backed `app/api/events` (Mongoose retired from the request path); gated POST → `createDraft`; rejects base64 (closes #2/#9/#16 at the API)
- [x] Announcements (pinned-first, audience, window; DL-010); public **audience gating** to `audience='public'` (DL-040)
- [x] Data-driven `/events`, `/past-events` (fixes #3), `/announcements` Server Components + `EventsBoard`/`AnnouncementCard`; responsive; V1 `/admin` form now URL-based (not base64)
- [x] `queries` doc disposition: junk test data → not migrated; no `contact_message` module (DL-038, closes #20)
- [x] Tests: 171 static (`events.test.mjs`) + 10 live-DB (`events.db.test.mjs`: window/expire/open, PUBLISH_WINDOW event+announcement, split, pinned-first, idempotency, audience, media inventory, resume, archive/by-slug, concurrency). `next build` clean. No new migration
- [x] Adversarial review (64 agents, 8 lenses); 23 confirmed → 12 fixed, 1 accepted
- [ ] **Operator:** run `npm run db:import:events` (and `db:import:org`) to populate the live 2025-26 year (#27)

## Session 7 — Resources + Media ✅
- [x] Resources (`content_type='resource'`, org-bound) via the CMS service (DL-041); each resource gets its own content lineage; `lib/resources/{data,public,import}.mjs` + idempotent `npm run db:import:resources`
- [x] Data-driven resources view: `ResourcesSection` (PDF via `PdfSlideshow` + link cards) rendered in `<OrgUnitPage>`; `getPublicOrgUnit` returns `resources`
- [x] Media service (DL-042): `lib/media/service.mjs` curated `media_asset` CRUD (audited) + the one shared `findOrCreateInventoryAsset`; `lib/media/cloudinary.mjs` pure URL/signature/`resolveDeliveryUrl` + injectable uploader
- [x] Admin Media Migration Tool (DL-043): `lib/media/migrate.mjs` idempotent + reversible + dry-run `/public`→Cloudinary, reconciling base64 placeholders (DL-039); `npm run db:migrate:media` (`--apply`/`--rollback`)
- [x] Config: pdfjs pinned + legacy build (#4/DL-044); image hosts → `res.cloudinary.com` only (#17/DL-045); `CLOUDINARY_*` in `env.example`
- [x] Tests: 219 static (`media.test.mjs` + `resources.test.mjs`) + 7 live-DB (`media.db` ×3, `resources.db` ×4); `next build` clean; no new migration
- [x] Adversarial review (10 lenses, per-finding 2-verifier); 14 confirmed → all addressed
- [ ] **Operator:** run `npm run db:import:resources` (after `db:import:org`) and the media migration `npm run db:migrate:media -- --apply` against 2025-26 (#27/#18)

## Session 8 — Developer Console ✅
- [x] Read-mostly caller layer `lib/devconsole/*` over Sessions 2–7 plumbing; no new audit writer / mutation / rollback pipeline (DL-046); `authorizeConsole` any-of gate (system bypass, developer short-circuit)
- [x] Audit-log viewer (`lib/devconsole/audit.mjs`): filter by actor/entity/action/year/time-range, keyset pagination, stats, timeline, entry drill-down; gated on dedicated `audit.read`; PII data-minimized on list rows; date-only `?to=` = inclusive end-of-day (DL-047)
- [x] Monitoring + status (`lib/devconsole/status.mjs`): DB latency probe (never-throws), `prisma migrate status`-shaped ledger diff, transition history, media-migration plan as a pure read (reuses `selectMigrationCandidates`); resilient `getSystemStatus` aggregator (DL-048)
- [x] Testing + cost reports (`lib/devconsole/reports.mjs`): suite catalog, `Token_Usage.md` parser, build-cost + Neon/Cloudinary free-tier estimate over live infra usage (isolated read)
- [x] Backups/restore/rollback (`lib/devconsole/backups.mjs`): `backup_record` ledger via `auditedMutation` (bytes→422; JSON-safe returns) + recovery delegates to media rollback (DL-043) and transition force re-sync (DL-031), gated `backup.*`
- [x] Gated routes `GET /api/dev/status` (`dev.console`, `Promise.allSettled`) + `GET /api/dev/audit` (`audit.read`); CLI `scripts/devconsole.mjs` (`npm run db:console`)
- [x] Tests: 258 static (`devconsole.test.mjs`, 39) + 10 live-DB (`devconsole.db.test.mjs`); org re-confirmed 4/4; `next build` + ESLint clean; no new migration
- [x] Adversarial review (7 lenses, per-finding 2-verifier, 43 agents); 18 → 6 confirmed-both + 8 single-vote → all legitimate addressed, 4 rejected

## Session 9 — Admin Panel ⬜ (next)
- [ ] RBAC-gated admin shell + per-permission nav; modules for all content/structure/events/resources/media + the Session-8 dev-console readers
- [ ] NEW users-&-roles service (`lib/users/*` or `lib/rbac/admin.mjs`): create/invite/suspend users, grant/revoke role assignments (audited, gated `user.*`/`role.*`)

## Session 10 — Testing + Deployment + Optimization ⬜
- [ ] Full test gate; CWV/perf; responsive/cross-browser; deploy hardening; handover

## Owner-owned (out-of-band)
- [ ] Rotate/remove V1 leaked secrets in `README.md` (KNOWN_ISSUES #1)
- [ ] Consider rotating Neon password if the sharing channel isn't private (#19)
