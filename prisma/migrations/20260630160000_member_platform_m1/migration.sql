-- ============================================================================
-- Session 11 / M1 — User status & access modes (active / inactive / revoked).
-- ============================================================================
-- A NEW FORWARD migration (DL-027): additive + a CREATE-style enum swap with a
-- DATA BACKFILL — never an init rewrite, never `prisma db pull` / `migrate reset`.
-- Apply with `npm run db:migrate` (prisma migrate deploy, reads .env.local).
--
-- WHY a type swap (DL-065): Postgres cannot DROP a value from an in-use enum, so
-- reconciling the legacy {active, suspended, invited, disabled} set down to the
-- new {active, inactive, revoked} set is done by creating a fresh type, retyping
-- the column through a CASE backfill, then dropping the old type and renaming.
-- Mapping: suspended -> inactive, invited -> inactive (a not-yet-onboarded account
-- with no usable credential), disabled -> revoked, active -> active. The CASE has a
-- safe ELSE (inactive) so any unexpected value lands in the least-privileged
-- logged-in state rather than failing the migration.

-- 1. Drop the column default so the type change isn't blocked by the 'active'::user_status default.
ALTER TABLE "app_user" ALTER COLUMN "status" DROP DEFAULT;

-- 2. The new three-mode enum.
CREATE TYPE "user_status_new" AS ENUM ('active', 'inactive', 'revoked');

-- 3. Retype the column, backfilling legacy values to the new vocabulary.
ALTER TABLE "app_user"
  ALTER COLUMN "status" TYPE "user_status_new"
  USING (
    CASE "status"::text
      WHEN 'active'    THEN 'active'
      WHEN 'suspended' THEN 'inactive'
      WHEN 'invited'   THEN 'inactive'
      WHEN 'disabled'  THEN 'revoked'
      ELSE 'inactive'
    END
  )::"user_status_new";

-- 4. Restore the default under the new type.
ALTER TABLE "app_user" ALTER COLUMN "status" SET DEFAULT 'active';

-- 5. Retire the old type and adopt the new name (so Prisma's `@@map("user_status")`
--    keeps resolving; no app/Prisma reference to the type name changes).
DROP TYPE "user_status";
ALTER TYPE "user_status_new" RENAME TO "user_status";

-- ── M1: per-account "allow normal (member) view" toggle (DL-067) ──
-- Withholds the authenticated member surface when false even though the account can
-- still log in. Default true so every existing account is unaffected.
ALTER TABLE "app_user"
  ADD COLUMN "allow_normal_view" BOOLEAN NOT NULL DEFAULT true;
