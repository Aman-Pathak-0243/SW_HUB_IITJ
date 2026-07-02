-- ============================================================================
-- Session 16 — LIVE QUIZZES & LIVE LEADERBOARDS (Tier B: self-hosted SSE + Redis).
-- ============================================================================
-- A NEW FORWARD migration (DL-027): ADDITIVE ONLY — four new operational tables
-- keyed on the DURABLE event content_item id + a raw-SQL tail (CHECKs, a partial
-- unique, indexes). The init is never rewritten and `prisma db pull` / `migrate
-- reset` are never run. Apply with `npm run db:migrate`.
--
-- The live quiz is part of an event's OPERATIONAL subsystem (like rounds/scores,
-- DL-087), gated by the SAME `event.manage` seam (DL-086) — so NO new permission
-- and NO new content type (DL-104). Organizer authoring/control is authorized by
-- assertEventManage; member play is login-only via assertCanParticipate.
--   • quiz_question    — an event's question bank (authored ahead; reusable across
--                        sessions): prompt + options JSONB + correct option id(s)
--                        (text[]) + points + time limit.
--   • quiz_session     — one LIVE run: status pending→active→reveal→ended, the
--                        current question pointer, and the SERVER-AUTHORITATIVE
--                        timer `question_started_at` (DL-106). A partial unique
--                        allows at most one non-ended session per event.
--   • quiz_participant — lobby membership (one per session/member), upserted on
--                        stream join. Durable, NOT audited.
--   • quiz_answer      — one answer per (session, question, member) — the UNIQUE
--                        makes each answer one-shot; server-scored. Durable, NOT
--                        audited (the member is the actor; the row is the record).

-- ── quiz_question ──────────────────────────────────────────────────────────
CREATE TABLE "quiz_question" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_item_id"      UUID NOT NULL,
  "prompt"             TEXT NOT NULL,
  "options"            JSONB NOT NULL,
  "correct_option_ids" TEXT[] NOT NULL DEFAULT '{}'::text[],
  "points"             INTEGER NOT NULL DEFAULT 1000,
  "time_limit_seconds" INTEGER NOT NULL DEFAULT 20,
  "sort_order"         INTEGER NOT NULL DEFAULT 0,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"         UUID,
  CONSTRAINT "quiz_question_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "quiz_question_item_idx" ON "quiz_question" ("event_item_id");
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_points_chk"
  CHECK ("points" >= 0);
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_time_limit_chk"
  CHECK ("time_limit_seconds" > 0 AND "time_limit_seconds" <= 3600);
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_item_fkey"
  FOREIGN KEY ("event_item_id") REFERENCES "content_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_question" ADD CONSTRAINT "quiz_question_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── quiz_session ─────────────────────────────────────────────────────────────
CREATE TABLE "quiz_session" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "event_item_id"       UUID NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'pending',
  "current_question_id" UUID,
  "question_started_at" TIMESTAMPTZ,
  "started_at"          TIMESTAMPTZ,
  "ended_at"            TIMESTAMPTZ,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"          UUID,
  CONSTRAINT "quiz_session_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "quiz_session_item_idx" ON "quiz_session" ("event_item_id");
ALTER TABLE "quiz_session" ADD CONSTRAINT "quiz_session_status_chk"
  CHECK ("status" IN ('pending', 'active', 'reveal', 'ended'));
-- at most ONE non-ended (live/lobby) session per event — a second run must first
-- end the current one. (A cancelled/finished session sets status='ended', freeing it.)
CREATE UNIQUE INDEX "quiz_session_one_live_uq"
  ON "quiz_session" ("event_item_id")
  WHERE "status" <> 'ended';
ALTER TABLE "quiz_session" ADD CONSTRAINT "quiz_session_item_fkey"
  FOREIGN KEY ("event_item_id") REFERENCES "content_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_session" ADD CONSTRAINT "quiz_session_current_question_fkey"
  FOREIGN KEY ("current_question_id") REFERENCES "quiz_question"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quiz_session" ADD CONSTRAINT "quiz_session_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── quiz_participant ─────────────────────────────────────────────────────────
CREATE TABLE "quiz_participant" (
  "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id" UUID NOT NULL,
  "user_id"    UUID NOT NULL,
  "joined_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quiz_participant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "quiz_participant_session_user_uq" ON "quiz_participant" ("session_id", "user_id");
CREATE INDEX "quiz_participant_session_idx" ON "quiz_participant" ("session_id");
ALTER TABLE "quiz_participant" ADD CONSTRAINT "quiz_participant_session_fkey"
  FOREIGN KEY ("session_id") REFERENCES "quiz_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_participant" ADD CONSTRAINT "quiz_participant_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── quiz_answer ──────────────────────────────────────────────────────────────
CREATE TABLE "quiz_answer" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "session_id"          UUID NOT NULL,
  "question_id"         UUID NOT NULL,
  "user_id"             UUID NOT NULL,
  "selected_option_ids" TEXT[] NOT NULL DEFAULT '{}'::text[],
  "is_correct"          BOOLEAN NOT NULL DEFAULT false,
  "points_awarded"      DOUBLE PRECISION NOT NULL DEFAULT 0,
  "response_ms"         INTEGER,
  "answered_at"         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quiz_answer_pkey" PRIMARY KEY ("id")
);
-- one answer per (session, question, member) — one-shot; a late/second submit is rejected.
CREATE UNIQUE INDEX "quiz_answer_session_question_user_uq" ON "quiz_answer" ("session_id", "question_id", "user_id");
CREATE INDEX "quiz_answer_session_user_idx" ON "quiz_answer" ("session_id", "user_id");
ALTER TABLE "quiz_answer" ADD CONSTRAINT "quiz_answer_session_fkey"
  FOREIGN KEY ("session_id") REFERENCES "quiz_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_answer" ADD CONSTRAINT "quiz_answer_question_fkey"
  FOREIGN KEY ("question_id") REFERENCES "quiz_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quiz_answer" ADD CONSTRAINT "quiz_answer_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
