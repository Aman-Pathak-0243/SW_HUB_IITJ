# Backup & Recovery (V2.0 — Proposed)

> **Status:** Proposed. The first concrete deliverable is the **pre-migration
> backup** (Milestone 1), required before any data change.

> **Implemented (Milestone 1):** the backup is now automated by
> `scripts/backup.sh` (content + media + manifests + checksums → zip → verified by
> re-extraction) and `scripts/export-events.mjs` (read-only `events` dump, needs
> `MONGODB_URI`). The first verified backup has been produced
> (`backups/backup-<ts>-1c88312.zip`, VERIFY: PASS); the live DB dump is pending
> credentials. `backups/` is git-ignored.

## Policy (from the master spec)

- Generate a **complete backup before modifying anything**.
- Produce backups in **JSON / CSV / Markdown** (as appropriate), then package
  into a **ZIP archive** before any migration.
- **Do not modify or delete existing content until backups are verified.**

## What gets backed up

| Asset | Format | Notes |
|---|---|---|
| `events` collection | JSON | Full dump incl. `_id`, dates |
| Hardcoded content | JSON + CSV + Markdown | Extracted from source per [DATA_INVENTORY.md](DATA_INVENTORY.md) |
| `/public` manifest | CSV/JSON | filename, size, checksum (files themselves stay in repo) |
| Cloudinary references | JSON | URLs referenced in code (inventory, not re-download) |
| Environment template | `env.example` | Never back up real secrets into the archive |

## Backup procedure (proposed)

1. Connect read-only to MongoDB; export `events` to JSON.
2. Run an extraction script over the source tree to emit structured JSON/CSV/MD
   for each hardcoded domain.
3. Generate a `/public` manifest with checksums.
4. Write a `MANIFEST.md` (what's included, counts, timestamp, git commit SHA).
5. Compute checksums for every file; package all into
   `backups/backup-<YYYYMMDD-HHMM>-<shortsha>.zip`.
6. **Verify:** re-open the ZIP, validate checksums, and perform a **restore test**
   into a scratch database/dir. Record the result.

> Timestamps/commit SHA are captured at run time and written into the manifest.

## Restore procedure (proposed)

1. Select a backup ZIP; verify checksums.
2. Restore `events` into a target database (scratch first, then prod on approval).
3. Confirm counts and spot-checks match the manifest.
4. Log the restore in the audit trail.

## Rollback (proposed)

- Each migration phase keeps a pre-phase snapshot; rollback restores it.
- Media migration is reversible per asset (original `/public` references retained
  in `MediaAsset.originalPath`).
- The Developer Console surfaces backups, restores, and rollback actions.

## Storage & security

- Backups containing PII (names/emails/phones/photos) must be access-restricted
  and ideally encrypted at rest; never commit real secrets into an archive.
- Define a retention policy (e.g. keep last N + monthly) once backups are
  automated.

## Acceptance

- A backup ZIP exists, checksums verify, and a restore test has **passed and is
  recorded** before any migration runs.
- Backup/restore is covered by tests (see [TESTING_STRATEGY.md](TESTING_STRATEGY.md)).
