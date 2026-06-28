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

---

## Milestone history

*(Each completed milestone adds a dated, versioned entry here describing what
shipped, tests added, and docs updated.)*
