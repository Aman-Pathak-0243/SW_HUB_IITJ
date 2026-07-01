-- ============================================================================
-- Session 11 / M3 — Club/Council pages expansion + memberships.
-- ============================================================================
-- A NEW FORWARD migration (DL-027): ADDITIVE ONLY — one new table + one new column
-- + a raw-SQL tail (a status CHECK). The init is never rewritten and `prisma db
-- pull` / `migrate reset` are never run. Apply with `npm run db:migrate`
-- (prisma migrate deploy, reads .env.local).
--
--   • club_membership (DL-075) — a STANDALONE many-to-many between an account
--     (app_user) and a LOGICAL org unit (org_unit_lineage), durable across years;
--     one user in many clubs/societies/chapters. Idempotency key: (user, lineage).
--   • announcement_payload.sync_to_central (DL-078) — a club announcement opts in to
--     ALSO appear on the central board (NULL/false = club-only).
--
-- The club MARKDOWN docs are a new content_type ('club_doc') that REUSES the
-- existing page_block_payload table (DL-006/037) — pure DATA (a content_type_def
-- seed row), so no DDL is needed here for it.

-- ── M3: club_membership (DL-075) ──
CREATE TABLE "club_membership" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"              UUID NOT NULL,
  "org_unit_lineage_key" UUID NOT NULL,
  "role"                 TEXT,
  "status"               TEXT NOT NULL DEFAULT 'active',
  "joined_at"            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMPTZ NOT NULL,
  "created_by"           UUID,
  CONSTRAINT "club_membership_pkey" PRIMARY KEY ("id")
);

-- One membership per (account, logical unit) — the importer's idempotency key.
CREATE UNIQUE INDEX "club_membership_user_lineage_uq"
  ON "club_membership" ("user_id", "org_unit_lineage_key");
CREATE INDEX "club_membership_lineage_status_idx"
  ON "club_membership" ("org_unit_lineage_key", "status");
CREATE INDEX "club_membership_user_id_idx" ON "club_membership" ("user_id");

ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_org_unit_lineage_key_fkey"
  FOREIGN KEY ("org_unit_lineage_key") REFERENCES "org_unit_lineage"("lineage_key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── M3: announcement_payload.sync_to_central (DL-078) ──
ALTER TABLE "announcement_payload" ADD COLUMN "sync_to_central" BOOLEAN;

-- ── Raw-SQL tail (invisible to Prisma drift — catalogued in SCHEMA_DESIGN) ──
-- Guard the small fixed status vocabulary at the DB (mirrors feedback / notification).
ALTER TABLE "club_membership" ADD CONSTRAINT "club_membership_status_chk"
  CHECK ("status" IN ('active', 'inactive'));
