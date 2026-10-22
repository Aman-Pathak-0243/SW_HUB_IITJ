-- Adds the 'db' storage_provider — media_asset rows whose actual file bytes live
-- in Postgres itself (see the next migration), not on Cloudinary or a filesystem.
-- Split into its own migration file: Postgres does not allow a newly added enum
-- value to be referenced within the same transaction that added it, so this must
-- commit before anything (the next migration, or app code) can use 'db'.
ALTER TYPE "storage_provider" ADD VALUE 'db';
