# Next Task

**As of:** 2026-06-28 · **Session 1 complete → Session 2 is next.**

## Session 2 — Database + Prisma + RBAC + Authentication

Implement the verified schema and stand up identity/access. **Read first:**
[docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md),
[docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md) (authoritative spec),
[docs/DATA_MIGRATION_REPORT.md](docs/DATA_MIGRATION_REPORT.md),
[docs/DECISION_LOG.md](docs/DECISION_LOG.md).

### Ordered tasks
1. **Setup:** `npm install`; add Prisma + `@prisma/client` + `@auth/prisma-adapter`
   (or NextAuth v4 `@next-auth/prisma-adapter`); confirm `.env.local` has
   `DATABASE_URL` (pooled) and add `DIRECT_URL` (unpooled — get the non-pooler
   host from the Neon dashboard).
2. **Prisma schema:** translate [docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md) into
   `prisma/schema.prisma` — all 33 tables + 15 enums. Honor the **Prisma/Postgres/
   Neon notes** in that doc (snake_case `@@map`, `gen_random_uuid()`, `citext`,
   plain non-FK revision-pointer columns, NextAuth canonical model shape, etc.).
3. **Raw-SQL migration objects:** add the partial/expression uniques, composite
   FK, triggers (lock_guard, cardinality, type-compat, pointer same-item/status,
   person.email=user.email), GIN/BRIN indexes, and the bigint-identity audit PK —
   all listed in SCHEMA_DESIGN.md (Prisma can't express these).
4. **Migrate:** `prisma migrate dev` against Neon (uses `DIRECT_URL`).
5. **Seed:** current `academic_year` (2025-26, is_current, active); system roles
   (Developer grants_all, Admin) + permission catalog + role_permission;
   org_unit_type + allowed-child edges; base positions; content_type_def rows.
6. **Auth:** NextAuth v4 + Prisma adapter; Google + Credentials (argon2id hashed),
   one account per email (account linking); JWT sessions.
7. **RBAC:** one server-side authorization utility (permission union + grants_all
   short-circuit) used by all protected handlers; replace the V1 hardcoded email
   allowlist (KNOWN_ISSUES #8).
8. **Tests:** auth + permission + a basic DB/migration test (in-memory or a Neon
   test branch).

### Confirm before/while building (from SCHEMA_DESIGN.md → Open questions)
- Transition-wizard appointment-copy default (OFF), locked-year errata path,
  approval-workflow depth, slug URL namespacing, JWT revocation latency,
  person.email vs user.email link. Take expert defaults; record in DECISION_LOG.

### End-of-session (mandatory)
Run the END-OF-SESSION checklist in
[docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md): update CURRENT_STATUS,
NEXT_TASK, TODO, CHANGELOG, DECISION_LOG, KNOWN_ISSUES, Developer Guide; prepare
one specific commit; output the Session-3 starter prompt.

## Owner-owned (parallel, anytime)
- Rotate/revoke the V1 leaked secrets and clean `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md)).
- If the chat where the Neon string was shared isn't private, consider rotating
  the Neon password too (KNOWN_ISSUES #19).
