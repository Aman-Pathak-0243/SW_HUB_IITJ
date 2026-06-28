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

## Session 2 — Database + Prisma + RBAC + Authentication ⏳ (next)
- [ ] Install deps; add Prisma + adapter; set `DIRECT_URL` for migrations
- [ ] `prisma/schema.prisma` from SCHEMA_DESIGN.md (33 tables, 15 enums)
- [ ] Raw-SQL migration objects (partial uniques, composite FK, triggers, GIN/BRIN, bigint identity)
- [ ] `prisma migrate` on Neon
- [ ] Seed (year, roles+permissions, org types, positions, content_type_def)
- [ ] NextAuth + Prisma adapter; Google + credentials; one account per email
- [ ] Server-side RBAC util; replace hardcoded email allowlist (KNOWN_ISSUES #8)
- [ ] Auth + permission + migration tests

## Session 3 — CMS Foundation ⬜
- [ ] Draft/publish lifecycle + version history (content_item/content_revision)
- [ ] Central audit-log writer (one Prisma client extension/service)
- [ ] Generic schema-driven editing layer + content_type registry handlers

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
