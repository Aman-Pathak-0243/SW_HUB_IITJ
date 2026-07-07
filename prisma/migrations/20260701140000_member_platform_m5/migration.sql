-- ============================================================================
-- Session 11 / M5 — Centralized Event Playground (the largest module).
-- ============================================================================
-- A NEW FORWARD migration (DL-027): ADDITIVE ONLY — a few new operational tables
-- + additive columns on event_payload + a raw-SQL tail (CHECKs, partial uniques,
-- one deferred cardinality trigger). The init is never rewritten and
-- `prisma db pull` / `migrate reset` are never run. Apply with `npm run db:migrate`.
--
-- The event stays an `event` content_item (DL-037): its CONTENT (details / a
-- markdown problem statement / hybrid ordered blocks / eligibility / category) is
-- VERSIONED on event_payload, reusing the M4 hybrid-block pattern (DL-080) via a
-- coercePayload hook (DL-084). Its OPERATIONAL subsystem lives in these standalone
-- tables keyed on the DURABLE event content_item id (DL-084/085/087):
--   • event_entity          — custom organizing entities admin/dev define (a
--                             syndicate / external partner / ad-hoc committee).
--   • event_organizer       — stakeholder TAGGING (organizer | collaborator),
--                             each row EXACTLY ONE of {club-lineage, custom-entity,
--                             member} (a CHECK); defines who gets SCOPED event access.
--   • event_settings        — 1:1 operational config (capacity / registration
--                             window) — NOT versioned (separate from the payload).
--   • event_round           — stages.
--   • event_registration    — per user; a PARTIAL-UNIQUE dedup (one active reg per
--                             user) + an optional capacity → WAITLIST DEFERRED
--                             cardinality guard reading event_settings.capacity
--                             (DL-009/021 reuse).
--   • event_score           — round-wise (round_id) + overall (round_id NULL).
--   • event_attendance      — round-wise (round_id) + overall (round_id NULL),
--                             manually marked.
--   • event_closure_report  — an OPTIONAL markdown closure report per (event,
--                             submitter): role + contribution + self-reported
--                             budget; admin review comment + corrected budget.
-- The "Events Organized" curated markdown doc is a NEW content_type='events_organized'
-- reusing page_block_payload — pure DATA (a content_type_def seed row), no DDL here.
-- The `event.manage` permission is likewise pure DATA (seeded in lib/rbac/permissions).

-- ── M5: additive columns on event_payload (DL-084) — versioned event CONTENT ──
-- problem_statement + eligibility are markdown (rendered escape-first, DL-077);
-- blocks is the hybrid ordered-block JSONB (reuses the M4 normalizer, DL-080);
-- category is the event's facet/tag that feeds M6 performance tracking.
ALTER TABLE "event_payload" ADD COLUMN "problem_statement" TEXT;
ALTER TABLE "event_payload" ADD COLUMN "eligibility" TEXT;
ALTER TABLE "event_payload" ADD COLUMN "category" TEXT;
ALTER TABLE "event_payload" ADD COLUMN "blocks" JSONB;

-- ── M5: event_entity (DL-085) — custom organizing stakeholders ──
CREATE TABLE "event_entity" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "name"        TEXT NOT NULL,
  "kind"        TEXT,
  "description" TEXT,
  "status"      TEXT NOT NULL DEFAULT 'active',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"  UUID,
  CONSTRAINT "event_entity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_entity_name_uq" ON "event_entity" (lower("name"));
CREATE INDEX "event_entity_status_idx" ON "event_entity" ("status");
ALTER TABLE "event_entity" ADD CONSTRAINT "event_entity_status_chk"
  CHECK ("status" IN ('active', 'archived'));
ALTER TABLE "event_entity" ADD CONSTRAINT "event_entity_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── M5: event_organizer (DL-085) — organizer/collaborator TAGGING ──
CREATE TABLE "event_organizer" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_item_id"        UUID NOT NULL,
  "kind"                 TEXT NOT NULL DEFAULT 'organizer',
  "org_unit_lineage_key" UUID,
  "entity_id"            UUID,
  "user_id"              UUID,
  "role"                 TEXT,
  "sort_order"           INTEGER NOT NULL DEFAULT 0,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"           UUID,
  CONSTRAINT "event_organizer_pkey" PRIMARY KEY ("id")
);
-- one tag per target per event (Postgres NULL-distinct: the three targets never collide)
CREATE UNIQUE INDEX "event_organizer_item_lineage_uq" ON "event_organizer" ("event_item_id", "org_unit_lineage_key");
CREATE UNIQUE INDEX "event_organizer_item_entity_uq"  ON "event_organizer" ("event_item_id", "entity_id");
CREATE UNIQUE INDEX "event_organizer_item_user_uq"    ON "event_organizer" ("event_item_id", "user_id");
CREATE INDEX "event_organizer_item_idx"    ON "event_organizer" ("event_item_id");
CREATE INDEX "event_organizer_lineage_idx" ON "event_organizer" ("org_unit_lineage_key");
CREATE INDEX "event_organizer_entity_idx"  ON "event_organizer" ("entity_id");
CREATE INDEX "event_organizer_user_idx"    ON "event_organizer" ("user_id");
ALTER TABLE "event_organizer" ADD CONSTRAINT "event_organizer_item_fkey"
  FOREIGN KEY ("event_item_id") REFERENCES "content_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_organizer" ADD CONSTRAINT "event_organizer_lineage_fkey"
  FOREIGN KEY ("org_unit_lineage_key") REFERENCES "org_unit_lineage"("lineage_key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_organizer" ADD CONSTRAINT "event_organizer_entity_fkey"
  FOREIGN KEY ("entity_id") REFERENCES "event_entity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_organizer" ADD CONSTRAINT "event_organizer_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_organizer" ADD CONSTRAINT "event_organizer_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── M5: event_settings (DL-084/087) — 1:1 operational config (NOT versioned) ──
CREATE TABLE "event_settings" (
  "event_item_id"          UUID NOT NULL,
  "capacity"               INTEGER,
  "registration_opens_at"  TIMESTAMPTZ,
  "registration_closes_at" TIMESTAMPTZ,
  "registration_closed"    BOOLEAN NOT NULL DEFAULT false,
  "created_at"             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"             UUID,
  CONSTRAINT "event_settings_pkey" PRIMARY KEY ("event_item_id")
);
ALTER TABLE "event_settings" ADD CONSTRAINT "event_settings_capacity_chk"
  CHECK ("capacity" IS NULL OR "capacity" >= 0);
ALTER TABLE "event_settings" ADD CONSTRAINT "event_settings_item_fkey"
  FOREIGN KEY ("event_item_id") REFERENCES "content_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_settings" ADD CONSTRAINT "event_settings_updated_by_fkey"
  FOREIGN KEY ("updated_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── M5: event_round (DL-087) — stages ──
CREATE TABLE "event_round" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_item_id" UUID NOT NULL,
  "round_no"      INTEGER NOT NULL,
  "name"          TEXT NOT NULL,
  "description"   TEXT,
  "starts_at"     TIMESTAMPTZ,
  "ends_at"       TIMESTAMPTZ,
  "sort_order"    INTEGER NOT NULL DEFAULT 0,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"    UUID,
  CONSTRAINT "event_round_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_round_item_no_uq" ON "event_round" ("event_item_id", "round_no");
CREATE INDEX "event_round_item_idx" ON "event_round" ("event_item_id");
ALTER TABLE "event_round" ADD CONSTRAINT "event_round_item_fkey"
  FOREIGN KEY ("event_item_id") REFERENCES "content_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_round" ADD CONSTRAINT "event_round_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── M5: event_registration (DL-087) — per user ──
CREATE TABLE "event_registration" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_item_id" UUID NOT NULL,
  "user_id"       UUID NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'confirmed',
  "team_name"     TEXT,
  "note"          TEXT,
  "registered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cancelled_at"  TIMESTAMPTZ,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"    UUID,
  CONSTRAINT "event_registration_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_status_chk"
  CHECK ("status" IN ('confirmed', 'waitlisted', 'cancelled'));
-- one ACTIVE (non-cancelled) registration per (event, user) — the dedup key; a
-- cancelled row is kept for history and allows a later re-registration.
CREATE UNIQUE INDEX "event_registration_active_uq"
  ON "event_registration" ("event_item_id", "user_id")
  WHERE "status" <> 'cancelled';
CREATE INDEX "event_registration_item_status_idx" ON "event_registration" ("event_item_id", "status");
CREATE INDEX "event_registration_user_idx" ON "event_registration" ("user_id");
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_item_fkey"
  FOREIGN KEY ("event_item_id") REFERENCES "content_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_registration" ADD CONSTRAINT "event_registration_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── M5: event_score (DL-087) — round-wise (round_id) + overall (round_id NULL) ──
CREATE TABLE "event_score" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_item_id" UUID NOT NULL,
  "round_id"      UUID,
  "user_id"       UUID NOT NULL,
  "points"        DOUBLE PRECISION NOT NULL DEFAULT 0,
  "note"          TEXT,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"    UUID,
  CONSTRAINT "event_score_pkey" PRIMARY KEY ("id")
);
-- one score per (round, user) for round scores; one OVERALL score per (event, user).
CREATE UNIQUE INDEX "event_score_round_user_uq" ON "event_score" ("round_id", "user_id");
CREATE UNIQUE INDEX "event_score_overall_user_uq" ON "event_score" ("event_item_id", "user_id") WHERE "round_id" IS NULL;
CREATE INDEX "event_score_item_round_user_idx" ON "event_score" ("event_item_id", "round_id", "user_id");
ALTER TABLE "event_score" ADD CONSTRAINT "event_score_item_fkey"
  FOREIGN KEY ("event_item_id") REFERENCES "content_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_score" ADD CONSTRAINT "event_score_round_fkey"
  FOREIGN KEY ("round_id") REFERENCES "event_round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_score" ADD CONSTRAINT "event_score_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_score" ADD CONSTRAINT "event_score_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── M5: event_attendance (DL-087) — round-wise + overall, manually marked ──
CREATE TABLE "event_attendance" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_item_id" UUID NOT NULL,
  "round_id"      UUID,
  "user_id"       UUID NOT NULL,
  "present"       BOOLEAN NOT NULL DEFAULT true,
  "note"          TEXT,
  "marked_at"     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"    UUID,
  CONSTRAINT "event_attendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_attendance_round_user_uq" ON "event_attendance" ("round_id", "user_id");
CREATE UNIQUE INDEX "event_attendance_overall_user_uq" ON "event_attendance" ("event_item_id", "user_id") WHERE "round_id" IS NULL;
CREATE INDEX "event_attendance_item_round_user_idx" ON "event_attendance" ("event_item_id", "round_id", "user_id");
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_item_fkey"
  FOREIGN KEY ("event_item_id") REFERENCES "content_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_round_fkey"
  FOREIGN KEY ("round_id") REFERENCES "event_round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_attendance" ADD CONSTRAINT "event_attendance_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── M5: event_closure_report (DL-088) — optional markdown closure report ──
CREATE TABLE "event_closure_report" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_item_id"     UUID NOT NULL,
  "submitted_by"      UUID NOT NULL,
  "role_contribution" TEXT NOT NULL,
  "reported_budget"   NUMERIC(14,2),
  "status"            TEXT NOT NULL DEFAULT 'submitted',
  "review_comment"    TEXT,
  "corrected_budget"  NUMERIC(14,2),
  "reviewed_by"       UUID,
  "reviewed_at"       TIMESTAMPTZ,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_closure_report_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "event_closure_report" ADD CONSTRAINT "event_closure_report_status_chk"
  CHECK ("status" IN ('submitted', 'reviewed'));
-- one report per (event, submitting stakeholder).
CREATE UNIQUE INDEX "event_closure_report_item_submitter_uq" ON "event_closure_report" ("event_item_id", "submitted_by");
CREATE INDEX "event_closure_report_item_idx" ON "event_closure_report" ("event_item_id");
ALTER TABLE "event_closure_report" ADD CONSTRAINT "event_closure_report_item_fkey"
  FOREIGN KEY ("event_item_id") REFERENCES "content_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_closure_report" ADD CONSTRAINT "event_closure_report_submitted_by_fkey"
  FOREIGN KEY ("submitted_by") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_closure_report" ADD CONSTRAINT "event_closure_report_reviewed_by_fkey"
  FOREIGN KEY ("reviewed_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Raw-SQL tail (invisible to Prisma drift — catalogued in SCHEMA_DESIGN) ──
-- event_organizer: each tag references EXACTLY ONE of {club-lineage, custom-entity,
-- member} — never two, never none (DL-085).
ALTER TABLE "event_organizer" ADD CONSTRAINT "event_organizer_one_target_chk"
  CHECK ((("org_unit_lineage_key" IS NOT NULL)::int + ("entity_id" IS NOT NULL)::int + ("user_id" IS NOT NULL)::int) = 1);
ALTER TABLE "event_organizer" ADD CONSTRAINT "event_organizer_kind_chk"
  CHECK ("kind" IN ('organizer', 'collaborator'));

-- event_registration capacity → WAITLIST backstop (DL-009/021 reuse, DL-087). The
-- SERVICE decides confirmed-vs-waitlisted at registration time; this DEFERRABLE
-- constraint trigger is the concurrency backstop that guarantees the count of
-- CONFIRMED registrations never exceeds event_settings.capacity (NULL / no settings
-- row = unlimited). Deferred so multi-row roster writes validate at COMMIT.
CREATE OR REPLACE FUNCTION event_registration_capacity_guard() RETURNS trigger AS $$
DECLARE
  v_capacity int;
  v_count int;
BEGIN
  IF NEW.status <> 'confirmed' THEN
    RETURN NEW; -- only confirmed registrations consume capacity
  END IF;
  SELECT capacity INTO v_capacity FROM event_settings WHERE event_item_id = NEW.event_item_id;
  IF v_capacity IS NULL THEN
    RETURN NEW; -- unlimited (no settings row, or capacity NULL)
  END IF;
  SELECT count(*) INTO v_count FROM event_registration
    WHERE event_item_id = NEW.event_item_id AND status = 'confirmed';
  IF v_count > v_capacity THEN
    RAISE EXCEPTION 'event_registration_capacity_guard: event % is full (capacity %); confirmed=%',
      NEW.event_item_id, v_capacity, v_count USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER event_registration_capacity_guard_trg
  AFTER INSERT OR UPDATE ON "event_registration"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION event_registration_capacity_guard();
