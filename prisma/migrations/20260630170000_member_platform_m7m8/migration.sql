-- ============================================================================
-- Session 11 / M7 + M8 — the notifications/feedback + developer-dashboard SPINE.
-- ============================================================================
-- A NEW FORWARD migration (DL-027): ADDITIVE ONLY — one new column + four new
-- tables + a sequence + a raw-SQL tail (CHECKs). The init is never rewritten and
-- `prisma db pull` / `migrate reset` are never run. Apply with `npm run db:migrate`
-- (prisma migrate deploy, reads .env.local).
--
--   • M7: notification gains a free-text `label` (grouping/filter); a standalone
--     `feedback` support-ticket table (DL-070, the DL-038 "own table" rule) with a
--     human ref id from `feedback_ref_seq`.
--   • M8: `page_visit` (hidden usage analytics, BIGSERIAL like audit_log),
--     `table_threshold` (per-table size monitoring), `authorized_sender` (the bulk-
--     mail allowlist).

-- ── M7: notification label (grouping facet) ──
ALTER TABLE "notification" ADD COLUMN "label" TEXT;
CREATE INDEX "notification_label_idx" ON "notification" ("label");

-- ── M7: feedback / support tickets (DL-070) ──
CREATE SEQUENCE IF NOT EXISTS "feedback_ref_seq" START 1;

CREATE TABLE "feedback" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "reference_id"        TEXT NOT NULL,
  "category"            TEXT NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'open',
  "subject"             TEXT NOT NULL,
  "body"                TEXT NOT NULL,
  "component"           TEXT,
  "submitter_email"     CITEXT,
  "submitter_user_id"   UUID,
  "assigned_to_user_id" UUID,
  "assigned_at"         TIMESTAMPTZ,
  "resolved_by_user_id" UUID,
  "resolved_at"         TIMESTAMPTZ,
  "resolution_note"     TEXT,
  "data"                JSONB,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ NOT NULL,
  CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "feedback_reference_id_key" ON "feedback" ("reference_id");
CREATE INDEX "feedback_status_created_at_idx" ON "feedback" ("status", "created_at" DESC);
CREATE INDEX "feedback_category_status_idx" ON "feedback" ("category", "status");
CREATE INDEX "feedback_submitter_email_idx" ON "feedback" ("submitter_email");
CREATE INDEX "feedback_assigned_to_user_id_idx" ON "feedback" ("assigned_to_user_id");

ALTER TABLE "feedback" ADD CONSTRAINT "feedback_submitter_user_id_fkey"
  FOREIGN KEY ("submitter_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_assigned_to_user_id_fkey"
  FOREIGN KEY ("assigned_to_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_resolved_by_user_id_fkey"
  FOREIGN KEY ("resolved_by_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── M8: hidden usage analytics (DL-071) — BIGSERIAL monotonic PK (keyset) ──
CREATE TABLE "page_visit" (
  "id"         BIGSERIAL NOT NULL,
  "path"       TEXT NOT NULL,
  "section"    TEXT,
  "user_id"    UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "page_visit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "page_visit_section_created_at_idx" ON "page_visit" ("section", "created_at" DESC);
CREATE INDEX "page_visit_created_at_idx" ON "page_visit" ("created_at" DESC);
ALTER TABLE "page_visit" ADD CONSTRAINT "page_visit_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── M8: per-table size thresholds (DL-072) ──
CREATE TABLE "table_threshold" (
  "table_name"      TEXT NOT NULL,
  "threshold_bytes" BIGINT NOT NULL,
  "note"            TEXT,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMPTZ NOT NULL,
  "updated_by"      UUID,
  CONSTRAINT "table_threshold_pkey" PRIMARY KEY ("table_name")
);
ALTER TABLE "table_threshold" ADD CONSTRAINT "table_threshold_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── M8: authorized mail senders (DL-073) ──
CREATE TABLE "authorized_sender" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "email"      CITEXT NOT NULL,
  "name"       TEXT,
  "active"     BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  "created_by" UUID,
  CONSTRAINT "authorized_sender_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "authorized_sender_email_key" ON "authorized_sender" ("email");
CREATE INDEX "authorized_sender_active_idx" ON "authorized_sender" ("active");
ALTER TABLE "authorized_sender" ADD CONSTRAINT "authorized_sender_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Raw-SQL tail (invisible to Prisma drift — catalogued in SCHEMA_DESIGN) ──
-- Guard the small fixed vocabularies at the DB so an app bug can't write a status
-- the workflow doesn't understand (mirrors notification / user_permission_override).
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_category_chk"
  CHECK ("category" IN ('bug', 'issue', 'query', 'suggestion'));
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_status_chk"
  CHECK ("status" IN ('open', 'triaged', 'in_progress', 'resolved', 'dismissed'));
