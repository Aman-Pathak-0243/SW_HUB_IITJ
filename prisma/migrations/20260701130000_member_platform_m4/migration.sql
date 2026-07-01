-- ============================================================================
-- Session 11 / M4 — Wall of Fame (student achievements).
-- ============================================================================
-- A NEW FORWARD migration (DL-027): ADDITIVE ONLY — two new tables + a raw-SQL
-- tail (CHECK constraints). The init is never rewritten and `prisma db pull` /
-- `migrate reset` are never run. Apply with `npm run db:migrate` (prisma migrate
-- deploy, reads .env.local).
--
--   • achievement_payload (DL-080) — the typed 1:1 payload for the NEW
--     content_type='achievement' (year-scoped, NOT org-bound; a central Wall-of-
--     Fame entry). Scalars (category / achievement_date / hero_media_id) live in
--     columns; the HYBRID ORDERED BLOCKS (markdown / markdown+image / banner /
--     link / gallery) live in the `blocks` JSONB column (DL-016 precedent). The
--     content_type itself is pure DATA (a content_type_def seed row) — no DDL.
--   • achievement_credit (DL-081) — the STANDALONE many-to-many mapping crediting
--     an achievement to a USER *or* a CLUB (org_unit_lineage), so a member's and a
--     club's contributions are trackable across a year (feeds M6 profiles). Each
--     row credits exactly one of {user, club} (a CHECK enforces it).

-- ── M4: achievement_payload (DL-080) — 1:1 with content_revision ──
CREATE TABLE "achievement_payload" (
  "revision_id"      UUID NOT NULL,
  "category"         TEXT,
  "achievement_date" TIMESTAMPTZ,
  "hero_media_id"    UUID,
  "blocks"           JSONB,
  CONSTRAINT "achievement_payload_pkey" PRIMARY KEY ("revision_id")
);
CREATE INDEX "achievement_payload_hero_media_id_idx" ON "achievement_payload" ("hero_media_id");

ALTER TABLE "achievement_payload" ADD CONSTRAINT "achievement_payload_revision_id_fkey"
  FOREIGN KEY ("revision_id") REFERENCES "content_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "achievement_payload" ADD CONSTRAINT "achievement_payload_hero_media_id_fkey"
  FOREIGN KEY ("hero_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── M4: achievement_credit (DL-081) — the contribution mapping ──
CREATE TABLE "achievement_credit" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "achievement_item_id"  UUID NOT NULL,
  "user_id"              UUID,
  "org_unit_lineage_key" UUID,
  "role"                 TEXT,
  "sort_order"           INTEGER NOT NULL DEFAULT 0,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"           UUID,
  CONSTRAINT "achievement_credit_pkey" PRIMARY KEY ("id")
);

-- At most one credit per (achievement, user) and per (achievement, club) — the
-- idempotency key for setting credits. Postgres treats NULLs as distinct, so a
-- user-credit (null lineage) and a club-credit (null user) never collide here.
CREATE UNIQUE INDEX "achievement_credit_item_user_uq"
  ON "achievement_credit" ("achievement_item_id", "user_id");
CREATE UNIQUE INDEX "achievement_credit_item_lineage_uq"
  ON "achievement_credit" ("achievement_item_id", "org_unit_lineage_key");
CREATE INDEX "achievement_credit_user_id_idx" ON "achievement_credit" ("user_id");
CREATE INDEX "achievement_credit_lineage_idx" ON "achievement_credit" ("org_unit_lineage_key");
CREATE INDEX "achievement_credit_item_idx" ON "achievement_credit" ("achievement_item_id");

ALTER TABLE "achievement_credit" ADD CONSTRAINT "achievement_credit_item_fkey"
  FOREIGN KEY ("achievement_item_id") REFERENCES "content_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "achievement_credit" ADD CONSTRAINT "achievement_credit_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "achievement_credit" ADD CONSTRAINT "achievement_credit_lineage_fkey"
  FOREIGN KEY ("org_unit_lineage_key") REFERENCES "org_unit_lineage"("lineage_key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "achievement_credit" ADD CONSTRAINT "achievement_credit_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Raw-SQL tail (invisible to Prisma drift — catalogued in SCHEMA_DESIGN) ──
-- Each credit references EXACTLY ONE of {user, club}: a member contribution OR a
-- club/stakeholder contribution, never both and never neither (DL-081).
ALTER TABLE "achievement_credit" ADD CONSTRAINT "achievement_credit_one_target_chk"
  CHECK ((("user_id" IS NOT NULL)::int + ("org_unit_lineage_key" IS NOT NULL)::int) = 1);
