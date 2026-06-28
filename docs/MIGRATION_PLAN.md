# Migration Plan (V2.0)

> **Status:** Backup done (Session 1, verified). Migrations run in later sessions
> (org content in Session 5; events in Session 6; media in Session 7). Per the
> master spec: **do not modify or delete existing content until backups have been
> verified** — that gate is satisfied (`scripts/backup.sh`, VERIFY: PASS).
>
> **This is now a Mongo → PostgreSQL migration.** The authoritative item-by-item
> mapping (what becomes CMS-managed / DB-managed / static / retired) is in
> [DATA_MIGRATION_REPORT.md](DATA_MIGRATION_REPORT.md); the target schema is in
> [SCHEMA_DESIGN.md](SCHEMA_DESIGN.md).

## What needs to migrate

| Source | Today | Target |
|---|---|---|
| Hardcoded content (clubs, councils, hostels, messes, team, flagship events, contacts, home content) | React source arrays/objects | **PostgreSQL** tables (year-scoped) via Prisma |
| `events` documents (3) | MongoDB | PostgreSQL `event` table (+ `academic_year_id` = 2025-26) |
| `queries` document (1) | MongoDB (undocumented) | Decision in [DATA_MIGRATION_REPORT.md](DATA_MIGRATION_REPORT.md) |
| `/public` images (105 files) | Local filesystem | Stay local for now; later → Cloudinary via Media Migration Tool |
| Cloudinary media | Two accounts (`dveqd1vm1`, `dabviijid`) | Tracked as `media_asset` records (references preserved) |

See [DATA_INVENTORY.md](DATA_INVENTORY.md) for the exhaustive source list and
[DATA_MIGRATION_REPORT.md](DATA_MIGRATION_REPORT.md) for dispositions.

## Principles

1. **Backup first, verified.** No destructive operation before a verified backup
   (see [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)).
2. **Idempotent + reversible.** Each migration script is re-runnable and has a
   documented rollback.
3. **Additive schema.** Add fields; never drop data. Backfill `academicYearId`
   to the 2025–26 year for all existing content.
4. **Dry-run + diff.** Every migration runs in dry-run mode first, producing a
   diff/report for review before applying.
5. **Migration tests.** Each migration ships with tests (see
   [TESTING_STRATEGY.md](TESTING_STRATEGY.md)).
6. **Media untouched.** `/public` is **not** reorganized; the later Media
   Migration Tool handles Cloudinary upload + reference updates with rollback.

## Phased migration

### Phase 0 — Pre-migration backup (blocking)
- Export the current `events` collection (JSON).
- Extract all hardcoded data into structured JSON/CSV/Markdown.
- Snapshot a manifest of `/public` (filenames, sizes, checksums).
- Package as a timestamped ZIP; verify integrity (checksums + restore test).

### Phase 1 — Foundation schema
- Create `AcademicYear` (seed `2025-26`, `isCurrent=true`).
- Extend `Event` (add `academicYearId`, author, status, Cloudinary image ref);
  backfill existing events to `2025-26`. Keep old `image` strings working until
  re-hosted.

### Phase 2 — Organization & people
- Seed `OrganizationType` (Council, Club, Committee, Hostel, Mess, Office).
- Import councils → units; clubs → child units (with Instagram, vision/mission).
- Import `Person`, `Position`, `Appointment` from the hardcoded coordinators,
  PICs, secretaries, wardens, caretakers, committee, and team arrays.

### Phase 3 — Remaining content
- Import hostels, messes (timings/committee), flagship events, announcements
  source content, resources (the infrastructure PDFs), and home-page content.

### Phase 4 — Media migration (separate tool, later)
- Admin Media Migration Tool uploads `/public` media to Cloudinary, creates
  `MediaAsset` records, and updates references — with a per-asset rollback.

## Validation & rollback

- After each phase: counts and spot-checks against the inventory; the public
  site renders identically from DB as it did from hardcoded data.
- Rollback: restore from the Phase-0 backup (or per-phase snapshot); migration
  scripts provide a `--down` path where feasible.

## Acceptance for the migration milestones

- Verified backup exists and a **restore test passed**.
- Public pages render from the database with no visual regression.
- All migration tests green; counts match the inventory.
- Docs updated (architecture, database, changelog, progress).
