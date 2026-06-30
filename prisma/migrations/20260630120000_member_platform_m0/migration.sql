-- ============================================================================
-- Session 11 / M0 — Member-platform foundation: plugin control plane,
-- account-lifecycle columns, and the centralized notification/request queue.
-- ============================================================================
-- A NEW FORWARD migration (DL-027): additive only — new columns + two new tables
-- + their FKs/indexes + one raw-SQL tail (a sequence + a status CHECK). The init
-- migration is never rewritten and `prisma db pull` / `migrate reset` are never
-- run (they would drop the raw-SQL objects from the schema's view). Apply with
-- `npm run db:migrate` (prisma migrate deploy, reads .env.local).

-- ── 1. app_user: forced-first-login-change columns (M0) ──
ALTER TABLE "app_user"
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "app_user"
  ADD COLUMN "password_set_at" TIMESTAMPTZ;

-- ── 2. feature_flag: the developer-controlled plugin registry ──
CREATE TABLE "feature_flag" (
  "key"         TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "enabled"     BOOLEAN NOT NULL DEFAULT false,
  "category"    TEXT NOT NULL DEFAULT 'plugin',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ NOT NULL,
  "updated_by"  UUID,
  CONSTRAINT "feature_flag_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "feature_flag_category_idx" ON "feature_flag" ("category");
ALTER TABLE "feature_flag" ADD CONSTRAINT "feature_flag_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 3. notification: centralized request / notification queue ──
CREATE TABLE "notification" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "reference_id"        TEXT NOT NULL,
  "type"                TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'open',
  "title"               TEXT NOT NULL,
  "body"                TEXT,
  "subject_email"       CITEXT,
  "entity_type"         TEXT,
  "entity_id"           UUID,
  "data"                JSONB,
  "assigned_to_user_id" UUID,
  "assigned_at"         TIMESTAMPTZ,
  "resolved_by_user_id" UUID,
  "resolved_at"         TIMESTAMPTZ,
  "resolution_note"     TEXT,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ NOT NULL,
  CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_reference_id_key" ON "notification" ("reference_id");
CREATE INDEX "notification_status_created_at_idx" ON "notification" ("status", "created_at" DESC);
CREATE INDEX "notification_type_status_idx" ON "notification" ("type", "status");
CREATE INDEX "notification_subject_email_idx" ON "notification" ("subject_email");
CREATE INDEX "notification_assigned_to_user_id_idx" ON "notification" ("assigned_to_user_id");
ALTER TABLE "notification" ADD CONSTRAINT "notification_assigned_to_user_id_fkey"
  FOREIGN KEY ("assigned_to_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification" ADD CONSTRAINT "notification_resolved_by_user_id_fkey"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 4. Raw-SQL tail (invisible to Prisma drift — catalogued in SCHEMA_DESIGN) ──
-- A monotonic sequence backs the human reference ids (AR-00001 / PR-00001 / …).
-- The notification service reads nextval() and formats the id, so concurrent
-- requests can never collide on reference_id (DB-enforced unique + sequence).
CREATE SEQUENCE IF NOT EXISTS "notification_ref_seq" AS BIGINT START 1;

-- The request/notification workflow status is a small fixed vocabulary — guard it
-- at the DB so an app bug can't write a bogus state (the request queue must always
-- be in one of these). M7 may extend this CHECK with a forward migration.
ALTER TABLE "notification" ADD CONSTRAINT "notification_status_chk"
  CHECK ("status" IN ('open', 'assigned', 'resolved', 'dismissed'));
