# Changelog

All notable changes to this project are recorded here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are YYYY-MM-DD.

A new entry is added after **every completed milestone** (per the documentation
update protocol in [README.md](README.md)).

---

## [Unreleased]

### Added
- `/docs` documentation set describing the **as-is** system (architecture, data
  inventory, API, database, auth, components, styling, security, deployment) and
  the **proposed V2** design (PRD, target architecture, migration, backup,
  testing, performance, responsive), plus guides and an ADR log.
- Root tracking files: `CURRENT_STATUS.md`, `NEXT_TASK.md`, `TODO.md`,
  `KNOWN_ISSUES.md`, `PROGRESS.md`.
- `docs/MILESTONE_PLAN.md` — the V2.0 roadmap.

### Notes
- **No production code was changed** in the analysis phase (analysis + docs only).
- Critical finding logged: secrets are committed in `README.md` and must be
  rotated/removed (see `docs/SECURITY.md`).

### Added — Milestone 0.5 (Security scanning) · 2026-06-28
- `.github/workflows/secret-scan.yml` — gitleaks CI on push/PR (full-history scan).
- `.gitleaks.toml` — gitleaks config (default ruleset + tight allowlist).
- `docs/runbooks/git-history-purge.md` — secret rotation + history-purge runbook.
- **Note:** removing the leaked secrets from `README.md` and rotating the keys is
  owned by the project owner (per decision); `README.md` was left untouched.

### Added — Milestone 1 (Pre-migration backup) · 2026-06-28
- `scripts/backup.sh` — reusable, verifying backup tool (public bytes +
  source content + manifests + checksums → zip → re-extract & verify).
- `scripts/export-events.mjs` — read-only MongoDB `events` export (needs
  `MONGODB_URI`) feeding the backup.
- `backups/.gitignore` — keeps backup artifacts out of git.
- Produced and **verified** the first backup
  (`backups/backup-<ts>-1c88312.zip`, 105 public files / ~77 MB, VERIFY: PASS).
- `scripts/backup-mongo.mjs` — full read-only Mongo dump (Extended JSON). Captured
  the live `test.events` (3 docs) **and** a previously-undocumented `test.queries`
  (1 doc) collection; folded both into a fresh DB-inclusive verified backup.
- **M1 complete.**

### Added/Changed — Session 1 close: Database pivot + Architecture · 2026-06-28
- **Database pivot:** V2 moves from MongoDB/Mongoose to **PostgreSQL (Neon) +
  Prisma**. Neon `DATABASE_URL` stored in git-ignored `.env.local`; `env.example`
  updated with `DATABASE_URL`/`DIRECT_URL` placeholders.
- **Verified schema design** (multi-agent workflow: 3 designs → synthesize → 4
  adversarial reviewers → finalize): `docs/SCHEMA_DESIGN.md` — 33 normalized
  tables, 15 enums, ER diagram, feature-coverage matrix for all 9 capabilities,
  and Prisma/Neon implementation notes. **No Prisma migrations yet** (Session 2).
- `docs/DATA_MIGRATION_REPORT.md` — V1→V2 item map (CMS-managed / DB-managed /
  static / retired).
- `docs/DECISION_LOG.md` — detailed decision log (16 records).
- `docs/SESSION_PROTOCOL.md` — 10-session model + start/end-of-session checklists.
- `docs/MILESTONE_PLAN.md` restructured around the 10 sessions (living doc).
- Updated TARGET_ARCHITECTURE, DATABASE_DESIGN, MIGRATION_PLAN,
  AUTHENTICATION_AND_RBAC, PROJECT_OVERVIEW, DEVELOPER_GUIDE, README,
  ARCHITECTURAL_DECISIONS (ADR-0006 Postgres/Prisma, ADR-0007 session model).

### Added/Changed — Session 2: Database + Prisma + RBAC + Authentication · 2026-06-28

- **Prisma + Postgres stood up.** Added `prisma@6`, `@prisma/client`,
  `@next-auth/prisma-adapter`, `@node-rs/argon2`; dev deps `vitest`, `dotenv-cli`.
  `.env.local` gains `DIRECT_URL` (unpooled) and `pgbouncer=true` on the pooled
  `DATABASE_URL`; `env.example` updated. `package.json` gains `test` + `db:*`
  scripts and the Prisma `seed` config.
- **`prisma/schema.prisma`** — all 33 tables + 14 Prisma enums from
  `SCHEMA_DESIGN.md`: snake_case `@@map`, `gen_random_uuid()` defaults, citext/
  inet/time/jsonb types, the composite FK `appointment(org_unit_id,
  academic_year_id) → org_unit(id, academic_year_id)`, plain-scalar revision
  pointers (no circular FK), and the full enumerated back-relation graph.
  NextAuth canonical `User`/`Account`/`VerificationToken` models mapped to
  `app_user`/`auth_account`/`verification_token`.
- **First migration applied to Neon** — one hand-assembled init migration:
  Prisma base DDL + a raw-SQL tail (CREATE EXTENSION citext; partial/expression/
  `NULLS NOT DISTINCT` unique indexes; GIN/BRIN; CHECK constraints; and **6
  trigger functions** — lock_guard, org_unit_hierarchy_guard,
  appointment_type_guard, appointment_cardinality_guard (deferred),
  content_item_pointer_guard, person_email_link_guard). `migrate status` clean.
- **Seed** (`prisma/seed.mjs`, idempotent) — current `academic_year` 2025-26;
  40-permission catalog; 5 roles (developer `grants_all`, super_admin, +3
  operational) + role_permission; 6 org_unit_types + 6 allowed-child edges; 16
  positions; 10 content_type_def rows; bootstrap developer + the two former V1
  admin emails as super_admins.
- **Authentication** — NextAuth v4 + PrismaAdapter; Google OAuth +
  email/password (argon2id); one account per email (account linking); JWT
  sessions; suspended/disabled accounts blocked at sign-in and at protected
  routes. The **V1 hardcoded `ADMIN_EMAILS` allowlist is removed**.
- **RBAC** — one server-side authorization utility (`lib/rbac/authorize.mjs` +
  `lib/auth/session.mjs`): permission union + grants_all/is_developer
  short-circuit, year/org-lineage scope, live (per-request) revocation.
  `POST /api/events` is now permission-gated.
- **Tests** — 50 passing across 6 Vitest files (password/argon2, credentials
  authorize, RBAC resolution + catalog, content-type registry, schema+migration
  structure, and a live Neon DB smoke incl. behavioral trigger tests).
- **Adversarial review** — a 16-agent review workflow checked schema fidelity,
  raw-SQL, auth, RBAC, seed, and task completeness; all confirmed critical/major
  findings were fixed (singleton partial unique + `is_singleton`, org-hierarchy
  guard, OAuth status gate, Google `name` coalesce, events-API gating, seed
  robustness) and re-verified.
- **Docs** — `DECISION_LOG.md` DL-017..DL-027; `SCHEMA_DESIGN.md` Session-2
  implementation addenda; `DEVELOPER_GUIDE.md` DB/test workflow; `Token_Usage.md`
  Session-2 row; `KNOWN_ISSUES.md` (#2/#8 closed, new items noted).
- **KNOWN_ISSUES closed:** #8 (hardcoded email allowlist) and #2 (unauthenticated
  `POST /api/events`).

---

## Milestone history

*(Each completed milestone adds a dated, versioned entry here describing what
shipped, tests added, and docs updated.)*
