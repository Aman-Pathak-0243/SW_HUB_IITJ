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

## Session 4 — Academic Year Engine ⬜
- [ ] Current-year context + history queries; lock_guard behavior
- [ ] Transition Wizard (copy structure forward; options); public year selector

## Session 5 — Organization Model (Clubs, Councils, Hostels, Mess) ⬜
- [ ] Org units/positions/appointments; migrate hardcoded org content (Report §7)
- [ ] Data-driven public pages (one `<OrgUnitPage>` replaces 4 Clubs pages)

## Session 6 — Events + Announcements ⬜
- [ ] Migrate 3 backed-up events → Postgres (year 2025-26); fix V1 event bugs
- [ ] Announcements (schedule/pin/audience); decide `queries` doc disposition

## Session 7 — Resources + Media ⬜
- [ ] Resources (PDFs/links); MediaAsset + Cloudinary uploads
- [ ] Admin Media Migration Tool (`/public` → Cloudinary, reversible)

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
