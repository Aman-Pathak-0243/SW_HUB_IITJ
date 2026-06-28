import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");

const migrationsDir = join(root, "prisma", "migrations");
const migrationFolder = readdirSync(migrationsDir).find((d) => d.endsWith("_init"));
const migration = readFileSync(join(migrationsDir, migrationFolder, "migration.sql"), "utf8");

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
