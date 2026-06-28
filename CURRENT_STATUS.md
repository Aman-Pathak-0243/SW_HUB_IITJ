# Current Status

**Last updated:** 2026-06-28
**Session:** 2 of 10 — **COMPLETE** (Database + Prisma + RBAC + Authentication)
**Next session:** 3 — CMS Foundation (draft/publish, version history, audit logging)
**Branch:** `portal-v2`

> New session? Read [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md) first,
> then this file, [NEXT_TASK.md](NEXT_TASK.md), [TODO.md](TODO.md),
> [KNOWN_ISSUES.md](KNOWN_ISSUES.md), [docs/CHANGELOG.md](docs/CHANGELOG.md).

## What is done (Session 2)

- **Prisma wired up** — `prisma@6` + `@prisma/client` + `@next-auth/prisma-adapter`
  + `@node-rs/argon2` installed; pooled `DATABASE_URL` (with `pgbouncer=true`) +
  unpooled `DIRECT_URL` in git-ignored `.env.local`.
- **Schema implemented** — [prisma/schema.prisma](prisma/schema.prisma): all 33
  tables + 14 enums from [docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md), composite
  FK, plain-scalar revision pointers, full back-relation graph. `prisma validate`
  passes.
- **First migration applied to Neon** — one hand-assembled init migration
  (Prisma base DDL + raw-SQL tail: citext extension, partial/expression/
  NULLS-NOT-DISTINCT uniques, GIN/BRIN, CHECKs, and **6 trigger functions**:
  lock_guard, org_unit_hierarchy_guard, appointment_type_guard,
  appointment_cardinality_guard, content_item_pointer_guard,
  person_email_link_guard). `prisma migrate status` → up to date.
- **Seeded** — current `academic_year` 2025-26 (active, is_current); 40
  permissions; 5 roles (developer `grants_all`, super_admin, content_editor,
  org_manager, viewer) + role_permission; 6 org_unit_types + 6 allowed-child
  edges; 16 positions; 10 content_type_def rows; bootstrap developer + the two
  former V1 admin emails as super_admins (replacing the hardcoded allowlist).
- **Auth** — NextAuth v4 + PrismaAdapter; Google OAuth + email/password
  (argon2id); one account per email (account linking); JWT sessions; suspended/
  disabled accounts blocked at sign-in and at protected routes.
- **RBAC** — one server-side authorization utility
  ([lib/rbac/authorize.mjs](lib/rbac/authorize.mjs) +
  [lib/auth/session.mjs](lib/auth/session.mjs)): permission union + grants_all/
  is_developer short-circuit, scope (year/org-lineage), live revocation. V1
  hardcoded email allowlist **removed** (KNOWN_ISSUES #8 closed). `POST
  /api/events` now permission-gated (KNOWN_ISSUES #2 closed).
- **Tests** — 50 passing across 6 files (password/argon2, RBAC resolution +
  catalog, content-type registry, credentials authorize, schema+migration
  structure, and a live Neon DB smoke incl. behavioral trigger tests for the
  singleton-cardinality and org-hierarchy guards).
- **Adversarial review workflow** (16 agents) run; all confirmed critical/major
  findings fixed and re-verified.

## What is NOT done yet (next sessions)

- **Central audit-write Prisma extension → Session 3** (table + indexes exist;
  the single write choke point lands with the CMS mutation pipeline — DL-025).
- CMS draft/publish lifecycle, version history, generic editing layer → Session 3.
- Events rebuilt on Postgres → Session 6; full RBAC-gated admin panel → Session 9.
- Owner-owned: rotate/remove the V1 leaked secrets in `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md)).

## Key facts for the next session

- DB is live on Neon with the seeded baseline. `npm test` (static) is always
  green; `RUN_DB_TESTS=1 npm test` adds the live smoke (needs `.env.local`).
- Neon serverless compute **auto-suspends**; the first connection wakes it
  (retry — the seed has a `waitForDb` loop; the smoke test warms in `beforeAll`).
- Prisma CLI reads `.env`, not `.env.local`: use the `db:*` npm scripts
  (`dotenv -e .env.local -- ...`) or `set -a; . ./.env.local; set +a` first.
- Raw-SQL objects live in the init migration's tail and are **invisible to
  Prisma** — never `prisma db pull`. They're catalogued in SCHEMA_DESIGN and
  guarded by `tests/migration.test.mjs`.

## Next action

See [NEXT_TASK.md](NEXT_TASK.md).
