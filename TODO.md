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

## Session 7 — Resources + Media ⬜ (next)
- [ ] Resources (`content_type='resource'`, org-bound) via the CMS service + public/data-driven view
- [ ] Media service + Cloudinary upload path; Admin Media Migration Tool (`/public` → Cloudinary, reversible) reconciling the Session-5/6 inventory rows + base64 placeholders (DL-039)

## Session 8 — Developer Console ⬜
- [ ] Monitoring, logs, audit viewer, testing reports, deploy status
- [ ] Backup/restore/rollback UI, migration tools, cost estimation

## Session 9 — Admin Panel ⬜
- [ ] RBAC-gated modules for all content/structure/users/roles

## Session 10 — Testing + Deployment + Optimization ⬜
- [ ] Full test gate; CWV/perf; responsive/cross-browser; deploy hardening; handover

## Owner-owned (out-of-band)
- [ ] Rotate/remove V1 leaked secrets in `README.md` (KNOWN_ISSUES #1)
- [ ] Consider rotating Neon password if the sharing channel isn't private (#19)
