import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");

const migrationsDir = join(root, "prisma", "migrations");
const migrationFolder = readdirSync(migrationsDir).find((d) => d.endsWith("_init"));
const migration = readFileSync(join(migrationsDir, migrationFolder, "migration.sql"), "utf8");

const m0Folder = readdirSync(migrationsDir).find((d) => d.endsWith("_member_platform_m0"));
const m0 = m0Folder ? readFileSync(join(migrationsDir, m0Folder, "migration.sql"), "utf8") : "";

const dedupFolder = readdirSync(migrationsDir).find((d) => d.endsWith("_notification_dedup_uq"));
const dedup = dedupFolder ? readFileSync(join(migrationsDir, dedupFolder, "migration.sql"), "utf8") : "";

const m3Folder = readdirSync(migrationsDir).find((d) => d.endsWith("_member_platform_m3"));
const m3 = m3Folder ? readFileSync(join(migrationsDir, m3Folder, "migration.sql"), "utf8") : "";

const m4Folder = readdirSync(migrationsDir).find((d) => d.endsWith("_member_platform_m4"));
const m4 = m4Folder ? readFileSync(join(migrationsDir, m4Folder, "migration.sql"), "utf8") : "";

const m5Folder = readdirSync(migrationsDir).find((d) => d.endsWith("_member_platform_m5"));
const m5 = m5Folder ? readFileSync(join(migrationsDir, m5Folder, "migration.sql"), "utf8") : "";

const TABLES = [
  "app_user", "auth_account", "verification_token", "academic_year", "role",
  "permission", "role_permission", "org_unit_lineage", "role_assignment",
  "org_unit_type", "org_unit_type_allowed_child", "org_unit", "person",
  "position", "appointment", "content_type_def", "content_item",
  "content_revision", "club_profile_payload", "club_mission_point",
  "hostel_profile_payload", "mess_profile_payload", "mess_meal_timing",
  "event_payload", "announcement_payload", "flagship_event_payload",
  "resource_payload", "page_block_payload", "content_media", "media_asset",
  "audit_log", "transition_run", "backup_record",
];

const ENUMS = [
  "academic_year_status", "user_status", "entity_status", "content_status",
  "revision_status", "person_type", "meal_type", "audience_type",
  "resource_kind", "storage_provider", "media_kind", "media_role",
  "audit_action", "transition_status",
];

describe("Prisma schema completeness", () => {
  it("declares all 33 tables via @@map", () => {
    for (const t of TABLES) {
      expect(schema.includes(`@@map("${t}")`), `missing @@map("${t}")`).toBe(true);
    }
    expect(TABLES).toHaveLength(33);
  });

  it("declares all 14 enums via @@map", () => {
    for (const e of ENUMS) {
      expect(schema.includes(`@@map("${e}")`), `missing enum @@map("${e}")`).toBe(true);
    }
    expect(ENUMS).toHaveLength(14);
  });

  it("models the plain-scalar revision pointers (no FK relation)", () => {
    expect(schema).toMatch(/publishedRevisionId\s+String\?\s+@map\("published_revision_id"\)\s+@db\.Uuid/);
    expect(schema).toMatch(/draftRevisionId\s+String\?\s+@map\("draft_revision_id"\)\s+@db\.Uuid/);
  });

  it("configures pooled url + direct url", () => {
    expect(schema).toContain('env("DATABASE_URL")');
    expect(schema).toContain('env("DIRECT_URL")');
  });
});

describe("init migration: base DDL", () => {
  it("creates 33 tables and 14 enum types", () => {
    expect((migration.match(/CREATE TABLE /g) || []).length).toBe(33);
    expect((migration.match(/CREATE TYPE /g) || []).length).toBe(14);
  });

  it("enables the citext extension before tables", () => {
    expect(migration).toMatch(/CREATE EXTENSION IF NOT EXISTS citext/i);
    const extIdx = migration.search(/CREATE EXTENSION IF NOT EXISTS citext/i);
    const firstTable = migration.search(/CREATE TABLE /);
    expect(extIdx).toBeGreaterThanOrEqual(0);
    expect(extIdx).toBeLessThan(firstTable);
  });

  it("uses gen_random_uuid() defaults and a BIGSERIAL audit PK", () => {
    expect(migration).toContain("gen_random_uuid()");
    expect(migration).toMatch(/"id"\s+BIGSERIAL/);
  });

  it("creates the composite year-agreement FK appointment → org_unit(id, academic_year_id)", () => {
    expect(migration).toMatch(
      /FOREIGN KEY \("org_unit_id", "academic_year_id"\) REFERENCES "org_unit"\("id", "academic_year_id"\)/
    );
  });
});

describe("init migration: raw-SQL guard objects", () => {
  const has = (re) => expect(migration).toMatch(re);

  it("has the partial / NULLS-NOT-DISTINCT unique indexes", () => {
    has(/academic_year_one_current_uq[\s\S]*WHERE "is_current" = true/);
    has(/content_revision_one_draft_uq[\s\S]*WHERE "revision_status" = 'draft'/);
    has(/content_revision_one_published_uq[\s\S]*WHERE "revision_status" = 'published'/);
    has(/content_media_one_primary_hero_uq[\s\S]*WHERE "role" = 'hero_primary'/);
    has(/appointment_no_dup_active_uq[\s\S]*WHERE "archived_at" IS NULL/);
    has(/appointment_singleton_position_uq[\s\S]*WHERE "archived_at" IS NULL AND "status" <> 'archived' AND "is_singleton"/);
    has(/role_assignment_unique_active_grant_uq[\s\S]*NULLS NOT DISTINCT WHERE "revoked_at" IS NULL/);
    has(/content_item_slug_uq[\s\S]*NULLS NOT DISTINCT WHERE "slug" IS NOT NULL/);
    has(/media_asset_cloudinary_public_id_uq[\s\S]*WHERE "cloudinary_public_id" IS NOT NULL/);
    has(/transition_run_one_completed_uq[\s\S]*WHERE "status" = 'completed'/);
  });

  it("has the expression index on lower(full_name)", () => {
    has(/person_full_name_lower_idx[\s\S]*lower\("full_name"\)/);
  });

  it("has GIN and BRIN indexes", () => {
    has(/page_block_payload_data_gin[\s\S]*USING GIN \("data" jsonb_path_ops\)/);
    has(/audit_log_after_gin[\s\S]*USING GIN \("after" jsonb_path_ops\)/);
    has(/audit_log_created_at_brin[\s\S]*USING BRIN \("created_at"\)/);
  });

  it("has the CHECK constraints", () => {
    has(/academic_year_label_format_chk[\s\S]*'\^\[0-9\]\{4\}-\[0-9\]\{2\}\$'/);
    has(/academic_year_no_self_transition_chk/);
    has(/transition_no_self_chk[\s\S]*"source_year_id" <> "target_year_id"/);
    has(/mess_meal_time_order_chk[\s\S]*"wraps_midnight" OR "end_time" > "start_time"/);
    has(/event_publish_window_chk/);
  });

  it("has all six trigger functions and their triggers", () => {
    for (const fn of [
      "lock_guard",
      "org_unit_hierarchy_guard",
      "appointment_type_guard",
      "appointment_cardinality_guard",
      "content_item_pointer_guard",
      "person_email_link_guard",
    ]) {
      expect(migration).toContain(`FUNCTION ${fn}()`);
    }
    // four lock_guard triggers on the year-scoped tables
    expect((migration.match(/CREATE TRIGGER lock_guard_/g) || []).length).toBe(4);
    // org_unit parent-hierarchy guard (same-year + allowed-child-type)
    has(/CREATE TRIGGER org_unit_hierarchy_guard_trg[\s\S]*ON "org_unit"/);
    // cardinality is a DEFERRABLE constraint trigger
    has(/CREATE CONSTRAINT TRIGGER appointment_cardinality_guard_trg[\s\S]*DEFERRABLE INITIALLY DEFERRED/);
  });
});

describe("Session 11 / M0 forward migration (member platform)", () => {
  it("the migration file exists", () => {
    expect(m0Folder, "missing _member_platform_m0 migration").toBeTruthy();
  });

  it("adds the forced-change columns to app_user (additive, not a rewrite of init)", () => {
    expect(m0).toMatch(/ALTER TABLE "app_user"[\s\S]*ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false/);
    expect(m0).toMatch(/ADD COLUMN "password_set_at" TIMESTAMPTZ/);
  });

  it("creates the feature_flag and notification tables with FKs to app_user", () => {
    expect(m0).toMatch(/CREATE TABLE "feature_flag"/);
    expect(m0).toMatch(/CREATE TABLE "notification"/);
    expect(m0).toMatch(/feature_flag_updated_by_fkey[\s\S]*REFERENCES "app_user"/);
    expect(m0).toMatch(/notification_assigned_to_user_id_fkey[\s\S]*REFERENCES "app_user"/);
  });

  it("has the raw-SQL tail: the reference-id sequence + the status CHECK", () => {
    expect(m0).toMatch(/CREATE SEQUENCE IF NOT EXISTS "notification_ref_seq"/);
    expect(m0).toMatch(/notification_status_chk[\s\S]*'open', 'assigned', 'resolved', 'dismissed'/);
  });

  it("the schema declares the two new models via @@map", () => {
    expect(schema).toContain('@@map("feature_flag")');
    expect(schema).toContain('@@map("notification")');
    expect(schema).toMatch(/mustChangePassword\s+Boolean\s+@default\(false\)\s+@map\("must_change_password"\)/);
  });

  it("the dedup follow-up migration adds the one-open-request-per-(type,email) partial unique", () => {
    expect(dedupFolder, "missing _notification_dedup_uq migration").toBeTruthy();
    expect(dedup).toMatch(/CREATE UNIQUE INDEX "notification_one_open_per_email_uq"[\s\S]*WHERE "status" IN \('open', 'assigned'\) AND "subject_email" IS NOT NULL/);
  });
});

describe("Session 11 / M3 forward migration (club pages + memberships)", () => {
  it("the migration file exists", () => {
    expect(m3Folder, "missing _member_platform_m3 migration").toBeTruthy();
  });

  it("creates the club_membership table with its FKs to app_user + org_unit_lineage", () => {
    expect(m3).toMatch(/CREATE TABLE "club_membership"/);
    expect(m3).toMatch(/club_membership_user_id_fkey[\s\S]*REFERENCES "app_user"\("id"\) ON DELETE CASCADE/);
    expect(m3).toMatch(/club_membership_org_unit_lineage_key_fkey[\s\S]*REFERENCES "org_unit_lineage"\("lineage_key"\) ON DELETE RESTRICT/);
    expect(m3).toMatch(/club_membership_created_by_fkey[\s\S]*REFERENCES "app_user"\("id"\) ON DELETE SET NULL/);
  });

  it("has the one-membership-per-(user, lineage) unique + the status CHECK (additive, not an init rewrite)", () => {
    expect(m3).toMatch(/CREATE UNIQUE INDEX "club_membership_user_lineage_uq"[\s\S]*"user_id", "org_unit_lineage_key"/);
    expect(m3).toMatch(/club_membership_status_chk[\s\S]*'active', 'inactive'/);
  });

  it("adds the announcement_payload.sync_to_central opt-in column (additive)", () => {
    expect(m3).toMatch(/ALTER TABLE "announcement_payload" ADD COLUMN "sync_to_central" BOOLEAN/);
  });

  it("the schema declares the ClubMembership model + the sync_to_central field via @@map/@map", () => {
    expect(schema).toContain('@@map("club_membership")');
    expect(schema).toMatch(/syncToCentral\s+Boolean\?\s+@map\("sync_to_central"\)/);
  });
});

describe("Session 11 / M4 forward migration (Wall of Fame)", () => {
  it("the migration file exists", () => {
    expect(m4Folder, "missing _member_platform_m4 migration").toBeTruthy();
  });

  it("creates achievement_payload (1:1 with content_revision) with a blocks JSONB + hero FK", () => {
    expect(m4).toMatch(/CREATE TABLE "achievement_payload"/);
    expect(m4).toMatch(/"blocks"\s+JSONB/);
    expect(m4).toMatch(/achievement_payload_revision_id_fkey[\s\S]*REFERENCES "content_revision"\("id"\) ON DELETE CASCADE/);
    expect(m4).toMatch(/achievement_payload_hero_media_id_fkey[\s\S]*REFERENCES "media_asset"\("id"\) ON DELETE SET NULL/);
  });

  it("creates achievement_credit with FKs to content_item, app_user, and org_unit_lineage", () => {
    expect(m4).toMatch(/CREATE TABLE "achievement_credit"/);
    expect(m4).toMatch(/achievement_credit_item_fkey[\s\S]*REFERENCES "content_item"\("id"\) ON DELETE CASCADE/);
    expect(m4).toMatch(/achievement_credit_user_id_fkey[\s\S]*REFERENCES "app_user"\("id"\) ON DELETE CASCADE/);
    expect(m4).toMatch(/achievement_credit_lineage_fkey[\s\S]*REFERENCES "org_unit_lineage"\("lineage_key"\) ON DELETE RESTRICT/);
  });

  it("has the per-target uniques + the exactly-one-target CHECK (additive, not an init rewrite)", () => {
    expect(m4).toMatch(/CREATE UNIQUE INDEX "achievement_credit_item_user_uq"[\s\S]*"achievement_item_id", "user_id"/);
    expect(m4).toMatch(/CREATE UNIQUE INDEX "achievement_credit_item_lineage_uq"[\s\S]*"achievement_item_id", "org_unit_lineage_key"/);
    expect(m4).toMatch(/achievement_credit_one_target_chk[\s\S]*= 1/);
  });

  it("the schema declares the two M4 models via @@map", () => {
    expect(schema).toContain('@@map("achievement_payload")');
    expect(schema).toContain('@@map("achievement_credit")');
  });
});

describe("Session 11 / M5 forward migration (Centralized Event Playground)", () => {
  it("the migration file exists", () => {
    expect(m5Folder, "expected a *_member_platform_m5 migration").toBeTruthy();
    expect(m5.length).toBeGreaterThan(0);
  });

  it("adds the hybrid-content columns to event_payload (additive, not an init rewrite)", () => {
    expect(m5).toMatch(/ALTER TABLE "event_payload" ADD COLUMN "problem_statement"/);
    expect(m5).toMatch(/ALTER TABLE "event_payload" ADD COLUMN "blocks" JSONB/);
    expect(m5).toMatch(/ALTER TABLE "event_payload" ADD COLUMN "category"/);
    expect(m5).toMatch(/ALTER TABLE "event_payload" ADD COLUMN "eligibility"/);
  });

  it("creates the eight operational tables keyed on the event content_item", () => {
    for (const t of [
      "event_entity", "event_organizer", "event_settings", "event_round",
      "event_registration", "event_score", "event_attendance", "event_closure_report",
    ]) {
      expect(m5.includes(`CREATE TABLE "${t}"`), `missing CREATE TABLE "${t}"`).toBe(true);
      expect(schema.includes(`@@map("${t}")`), `missing @@map("${t}")`).toBe(true);
    }
  });

  it("has the registration dedup partial unique + the DEFERRED capacity → waitlist guard", () => {
    expect(m5).toMatch(/CREATE UNIQUE INDEX "event_registration_active_uq"[\s\S]*WHERE "status" <> 'cancelled'/);
    expect(m5).toMatch(/FUNCTION event_registration_capacity_guard\(\)/);
    expect(m5).toMatch(/CREATE CONSTRAINT TRIGGER event_registration_capacity_guard_trg[\s\S]*DEFERRABLE INITIALLY DEFERRED/);
  });

  it("has the organizer one-target CHECK + kind CHECK and per-target uniques", () => {
    expect(m5).toMatch(/event_organizer_one_target_chk[\s\S]*= 1/);
    expect(m5).toMatch(/event_organizer_kind_chk[\s\S]*'organizer', 'collaborator'/);
    expect(m5).toMatch(/CREATE UNIQUE INDEX "event_organizer_item_lineage_uq"/);
    expect(m5).toMatch(/CREATE UNIQUE INDEX "event_organizer_item_entity_uq"/);
    expect(m5).toMatch(/CREATE UNIQUE INDEX "event_organizer_item_user_uq"/);
  });

  it("has the round-wise + overall score/attendance uniques (round_id NULL = overall)", () => {
    expect(m5).toMatch(/CREATE UNIQUE INDEX "event_score_round_user_uq"/);
    expect(m5).toMatch(/CREATE UNIQUE INDEX "event_score_overall_user_uq"[\s\S]*WHERE "round_id" IS NULL/);
    expect(m5).toMatch(/CREATE UNIQUE INDEX "event_attendance_overall_user_uq"[\s\S]*WHERE "round_id" IS NULL/);
  });

  it("indexes (event, round, user) for the scoring hot path (DL-087 perf)", () => {
    expect(m5).toMatch(/CREATE INDEX "event_score_item_round_user_idx"[\s\S]*"event_item_id", "round_id", "user_id"/);
  });
});
