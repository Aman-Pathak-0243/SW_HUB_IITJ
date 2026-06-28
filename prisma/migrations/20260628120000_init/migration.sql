-- Migration: init — IIT Jammu Portal V2 schema (33 tables, 14 enums)
-- Generated base DDL (prisma migrate diff) + hand-written raw-SQL guards.
-- See docs/SCHEMA_DESIGN.md and DECISION_LOG.md (Session 2).

CREATE EXTENSION IF NOT EXISTS citext;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "academic_year_status" AS ENUM ('planning', 'active', 'locked');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'invited', 'disabled');

-- CreateEnum
CREATE TYPE "entity_status" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "content_status" AS ENUM ('draft', 'review', 'published', 'archived');

-- CreateEnum
CREATE TYPE "revision_status" AS ENUM ('draft', 'review', 'published', 'superseded');

-- CreateEnum
CREATE TYPE "person_type" AS ENUM ('faculty', 'student', 'staff', 'external');

-- CreateEnum
CREATE TYPE "meal_type" AS ENUM ('breakfast', 'lunch', 'snacks', 'dinner');

-- CreateEnum
CREATE TYPE "audience_type" AS ENUM ('public', 'students', 'faculty', 'staff', 'internal');

-- CreateEnum
CREATE TYPE "resource_kind" AS ENUM ('pdf', 'link', 'drive', 'file');

-- CreateEnum
CREATE TYPE "storage_provider" AS ENUM ('cloudinary', 'local', 'external');

-- CreateEnum
CREATE TYPE "media_kind" AS ENUM ('image', 'pdf', 'svg', 'gif');

-- CreateEnum
CREATE TYPE "media_role" AS ENUM ('gallery', 'hero', 'hero_primary', 'attachment');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('create', 'update', 'delete', 'publish', 'unpublish', 'archive', 'restore', 'login', 'transition', 'grant_role', 'revoke_role');

-- CreateEnum
CREATE TYPE "transition_status" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ,
    "password_hash" TEXT,
    "display_name" TEXT NOT NULL,
    "image" TEXT,
    "avatar_media_id" UUID,
    "is_developer" BOOLEAN NOT NULL DEFAULT false,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_account_id" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_token" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMPTZ NOT NULL
);

-- CreateTable
CREATE TABLE "academic_year" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "academic_year_status" NOT NULL DEFAULT 'planning',
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "transitioned_from_year_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "academic_year_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "grants_all" BOOLEAN NOT NULL DEFAULT false,
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permission" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "org_unit_lineage" (
    "lineage_key" UUID NOT NULL DEFAULT gen_random_uuid(),
    "canonical_name" TEXT,
    "first_seen_year_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "org_unit_lineage_pkey" PRIMARY KEY ("lineage_key")
);

-- CreateTable
CREATE TABLE "role_assignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "org_unit_lineage_key" UUID,
    "academic_year_id" UUID,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "granted_by" UUID,
    "revoked_at" TIMESTAMPTZ,
    "revoked_by" UUID,

    CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_unit_type" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon_media_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "org_unit_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_unit_type_allowed_child" (
    "parent_type_id" UUID NOT NULL,
    "child_type_id" UUID NOT NULL,

    CONSTRAINT "org_unit_type_allowed_child_pkey" PRIMARY KEY ("parent_type_id","child_type_id")
);

-- CreateTable
CREATE TABLE "org_unit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "org_unit_type_id" UUID NOT NULL,
    "parent_id" UUID,
    "lineage_key" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "org_unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" TEXT NOT NULL,
    "person_type" "person_type" NOT NULL,
    "email" CITEXT,
    "phone" TEXT,
    "profile_url" TEXT,
    "photo_media_id" UUID,
    "app_user_id" UUID,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "applies_to_type_id" UUID,
    "holder_kind" "person_type",
    "max_holders" INTEGER,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "is_lead" BOOLEAN NOT NULL DEFAULT false,
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "academic_year_id" UUID NOT NULL,
    "org_unit_id" UUID NOT NULL,
    "org_unit_type_id" UUID,
    "position_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,
    "title_override" TEXT,
    "is_singleton" BOOLEAN NOT NULL DEFAULT false,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMPTZ,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "start_date" DATE,
    "end_date" DATE,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_type_def" (
    "content_type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_year_scoped" BOOLEAN NOT NULL DEFAULT true,
    "supports_publish" BOOLEAN NOT NULL DEFAULT true,
    "is_org_bound" BOOLEAN NOT NULL DEFAULT false,
    "payload_table" TEXT NOT NULL,
    "status" "entity_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "content_type_def_pkey" PRIMARY KEY ("content_type")
);

-- CreateTable
CREATE TABLE "content_item" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_type" TEXT NOT NULL,
    "academic_year_id" UUID,
    "org_unit_id" UUID,
    "lineage_key" UUID NOT NULL,
    "slug" TEXT,
    "status" "content_status" NOT NULL DEFAULT 'draft',
    "published_revision_id" UUID,
    "draft_revision_id" UUID,
    "published_at" TIMESTAMPTZ,
    "published_by" UUID,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "content_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_revision" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_item_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "revision_status" "revision_status" NOT NULL DEFAULT 'draft',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "change_note" TEXT,
    "is_restore_of_revision_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "content_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "club_profile_payload" (
    "revision_id" UUID NOT NULL,
    "vision" TEXT,
    "instagram_url" TEXT,
    "logo_media_id" UUID,
    "hero_media_id" UUID,
    "detail_drive_url" TEXT,

    CONSTRAINT "club_profile_payload_pkey" PRIMARY KEY ("revision_id")
);

-- CreateTable
CREATE TABLE "club_mission_point" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "revision_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,

    CONSTRAINT "club_mission_point_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hostel_profile_payload" (
    "revision_id" UUID NOT NULL,
    "building_media_id" UUID,
    "office_email" CITEXT,
    "office_phone" TEXT,
    "infrastructure_pdf_media_id" UUID,
    "detail_drive_url" TEXT,

    CONSTRAINT "hostel_profile_payload_pkey" PRIMARY KEY ("revision_id")
);

-- CreateTable
CREATE TABLE "mess_profile_payload" (
    "revision_id" UUID NOT NULL,
    "location" TEXT,
    "capacity" INTEGER,
    "image_media_id" UUID,
    "infrastructure_pdf_media_id" UUID,
    "detail_drive_url" TEXT,

    CONSTRAINT "mess_profile_payload_pkey" PRIMARY KEY ("revision_id")
);

-- CreateTable
CREATE TABLE "mess_meal_timing" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "revision_id" UUID NOT NULL,
    "meal" "meal_type" NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "wraps_midnight" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mess_meal_timing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_payload" (
    "revision_id" UUID NOT NULL,
    "body" TEXT,
    "event_date" TIMESTAMPTZ,
    "location" TEXT,
    "audience" "audience_type" NOT NULL DEFAULT 'public',
    "publish_from" TIMESTAMPTZ,
    "publish_until" TIMESTAMPTZ,
    "cover_media_id" UUID,

    CONSTRAINT "event_payload_pkey" PRIMARY KEY ("revision_id")
);

-- CreateTable
CREATE TABLE "announcement_payload" (
    "revision_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "audience" "audience_type" NOT NULL DEFAULT 'public',
    "publish_from" TIMESTAMPTZ,
    "publish_until" TIMESTAMPTZ,
    "cover_media_id" UUID,

    CONSTRAINT "announcement_payload_pkey" PRIMARY KEY ("revision_id")
);

-- CreateTable
CREATE TABLE "flagship_event_payload" (
    "revision_id" UUID NOT NULL,
    "description" TEXT,
    "image_media_id" UUID,
    "category" TEXT,

    CONSTRAINT "flagship_event_payload_pkey" PRIMARY KEY ("revision_id")
);

-- CreateTable
CREATE TABLE "resource_payload" (
    "revision_id" UUID NOT NULL,
    "resource_kind" "resource_kind" NOT NULL,
    "file_media_id" UUID,
    "external_url" TEXT,
    "description" TEXT,

    CONSTRAINT "resource_payload_pkey" PRIMARY KEY ("revision_id")
);

-- CreateTable
CREATE TABLE "page_block_payload" (
    "revision_id" UUID NOT NULL,
    "block_kind" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "primary_media_id" UUID,

    CONSTRAINT "page_block_payload_pkey" PRIMARY KEY ("revision_id")
);

-- CreateTable
CREATE TABLE "content_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "revision_id" UUID NOT NULL,
    "media_id" UUID NOT NULL,
    "role" "media_role" NOT NULL DEFAULT 'gallery',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "alt_text_override" TEXT,

    CONSTRAINT "content_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_asset" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "storage_provider" "storage_provider" NOT NULL DEFAULT 'cloudinary',
    "cloudinary_public_id" TEXT,
    "url" TEXT NOT NULL,
    "original_path" TEXT,
    "mime_type" TEXT,
    "kind" "media_kind" NOT NULL DEFAULT 'image',
    "width" INTEGER,
    "height" INTEGER,
    "bytes" BIGINT,
    "alt_text" TEXT,
    "checksum" TEXT,
    "uploaded_by" UUID,
    "migrated_at" TIMESTAMPTZ,
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_user_id" UUID,
    "action" "audit_action" NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "academic_year_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "summary" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transition_run" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_year_id" UUID NOT NULL,
    "target_year_id" UUID NOT NULL,
    "copy_structure" BOOLEAN NOT NULL DEFAULT true,
    "copy_appointments" BOOLEAN NOT NULL DEFAULT false,
    "copy_content" BOOLEAN NOT NULL DEFAULT false,
    "copy_role_assignments" BOOLEAN NOT NULL DEFAULT false,
    "status" "transition_status" NOT NULL DEFAULT 'pending',
    "counts" JSONB,
    "started_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "run_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transition_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backup_record" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "checksum" TEXT,
    "bytes" BIGINT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "backup_record_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user"("email");

-- CreateIndex
CREATE INDEX "app_user_status_idx" ON "app_user"("status");

-- CreateIndex
CREATE INDEX "auth_account_user_id_idx" ON "auth_account"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_account_provider_provider_account_id_key" ON "auth_account"("provider", "provider_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "verification_token_token_key" ON "verification_token"("token");

-- CreateIndex
CREATE UNIQUE INDEX "verification_token_identifier_token_key" ON "verification_token"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "academic_year_label_key" ON "academic_year"("label");

-- CreateIndex
CREATE INDEX "academic_year_status_idx" ON "academic_year"("status");

-- CreateIndex
CREATE INDEX "academic_year_transitioned_from_year_id_idx" ON "academic_year"("transitioned_from_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_key_key" ON "role"("key");

-- CreateIndex
CREATE INDEX "role_status_idx" ON "role"("status");

-- CreateIndex
CREATE UNIQUE INDEX "permission_key_key" ON "permission"("key");

-- CreateIndex
CREATE INDEX "permission_module_idx" ON "permission"("module");

-- CreateIndex
CREATE INDEX "role_permission_permission_id_idx" ON "role_permission"("permission_id");

-- CreateIndex
CREATE INDEX "org_unit_lineage_first_seen_year_id_idx" ON "org_unit_lineage"("first_seen_year_id");

-- CreateIndex
CREATE INDEX "role_assignment_org_unit_lineage_key_idx" ON "role_assignment"("org_unit_lineage_key");

-- CreateIndex
CREATE INDEX "role_assignment_academic_year_id_idx" ON "role_assignment"("academic_year_id");

-- CreateIndex
CREATE INDEX "role_assignment_role_id_idx" ON "role_assignment"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_unit_type_key_key" ON "org_unit_type"("key");

-- CreateIndex
CREATE INDEX "org_unit_type_status_idx" ON "org_unit_type"("status");

-- CreateIndex
CREATE INDEX "org_unit_type_allowed_child_child_type_id_idx" ON "org_unit_type_allowed_child"("child_type_id");

-- CreateIndex
CREATE INDEX "org_unit_academic_year_id_org_unit_type_id_idx" ON "org_unit"("academic_year_id", "org_unit_type_id");

-- CreateIndex
CREATE INDEX "org_unit_parent_id_idx" ON "org_unit"("parent_id");

-- CreateIndex
CREATE INDEX "org_unit_lineage_key_idx" ON "org_unit"("lineage_key");

-- CreateIndex
CREATE UNIQUE INDEX "org_unit_id_academic_year_id_key" ON "org_unit"("id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_unit_academic_year_id_slug_key" ON "org_unit"("academic_year_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "org_unit_academic_year_id_lineage_key_key" ON "org_unit"("academic_year_id", "lineage_key");

-- CreateIndex
CREATE INDEX "person_person_type_idx" ON "person"("person_type");

-- CreateIndex
CREATE INDEX "person_app_user_id_idx" ON "person"("app_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "position_key_key" ON "position"("key");

-- CreateIndex
CREATE INDEX "position_applies_to_type_id_idx" ON "position"("applies_to_type_id");

-- CreateIndex
CREATE INDEX "position_status_idx" ON "position"("status");

-- CreateIndex
CREATE INDEX "appointment_org_unit_id_academic_year_id_status_idx" ON "appointment"("org_unit_id", "academic_year_id", "status");

-- CreateIndex
CREATE INDEX "appointment_person_id_academic_year_id_idx" ON "appointment"("person_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "appointment_position_id_idx" ON "appointment"("position_id");

-- CreateIndex
CREATE INDEX "appointment_academic_year_id_idx" ON "appointment"("academic_year_id");

-- CreateIndex
CREATE INDEX "content_type_def_status_idx" ON "content_type_def"("status");

-- CreateIndex
CREATE INDEX "content_item_org_unit_id_idx" ON "content_item"("org_unit_id");

-- CreateIndex
CREATE INDEX "content_item_lineage_key_idx" ON "content_item"("lineage_key");

-- CreateIndex
CREATE INDEX "content_item_published_revision_id_idx" ON "content_item"("published_revision_id");

-- CreateIndex
CREATE INDEX "content_item_draft_revision_id_idx" ON "content_item"("draft_revision_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_item_content_type_academic_year_id_lineage_key_key" ON "content_item"("content_type", "academic_year_id", "lineage_key");

-- CreateIndex
CREATE INDEX "content_revision_content_item_id_created_at_idx" ON "content_revision"("content_item_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "content_revision_content_item_id_revision_status_idx" ON "content_revision"("content_item_id", "revision_status");

-- CreateIndex
CREATE INDEX "content_revision_revision_status_idx" ON "content_revision"("revision_status");

-- CreateIndex
CREATE UNIQUE INDEX "content_revision_content_item_id_revision_no_key" ON "content_revision"("content_item_id", "revision_no");

-- CreateIndex
CREATE UNIQUE INDEX "content_revision_id_content_item_id_key" ON "content_revision"("id", "content_item_id");

-- CreateIndex
CREATE INDEX "club_profile_payload_logo_media_id_idx" ON "club_profile_payload"("logo_media_id");

-- CreateIndex
CREATE INDEX "club_profile_payload_hero_media_id_idx" ON "club_profile_payload"("hero_media_id");

-- CreateIndex
CREATE INDEX "club_mission_point_revision_id_sort_order_idx" ON "club_mission_point"("revision_id", "sort_order");

-- CreateIndex
CREATE INDEX "hostel_profile_payload_building_media_id_idx" ON "hostel_profile_payload"("building_media_id");

-- CreateIndex
CREATE INDEX "hostel_profile_payload_infrastructure_pdf_media_id_idx" ON "hostel_profile_payload"("infrastructure_pdf_media_id");

-- CreateIndex
CREATE INDEX "mess_profile_payload_image_media_id_idx" ON "mess_profile_payload"("image_media_id");

-- CreateIndex
CREATE INDEX "mess_profile_payload_infrastructure_pdf_media_id_idx" ON "mess_profile_payload"("infrastructure_pdf_media_id");

-- CreateIndex
CREATE INDEX "mess_meal_timing_revision_id_sort_order_idx" ON "mess_meal_timing"("revision_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "mess_meal_timing_revision_id_meal_key" ON "mess_meal_timing"("revision_id", "meal");

-- CreateIndex
CREATE INDEX "event_payload_event_date_idx" ON "event_payload"("event_date");

-- CreateIndex
CREATE INDEX "event_payload_cover_media_id_idx" ON "event_payload"("cover_media_id");

-- CreateIndex
CREATE INDEX "announcement_payload_cover_media_id_idx" ON "announcement_payload"("cover_media_id");

-- CreateIndex
CREATE INDEX "flagship_event_payload_image_media_id_idx" ON "flagship_event_payload"("image_media_id");

-- CreateIndex
CREATE INDEX "resource_payload_file_media_id_idx" ON "resource_payload"("file_media_id");

-- CreateIndex
CREATE INDEX "page_block_payload_primary_media_id_idx" ON "page_block_payload"("primary_media_id");

-- CreateIndex
CREATE INDEX "content_media_revision_id_role_sort_order_idx" ON "content_media"("revision_id", "role", "sort_order");

-- CreateIndex
CREATE INDEX "content_media_media_id_idx" ON "content_media"("media_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_media_revision_id_media_id_role_key" ON "content_media"("revision_id", "media_id", "role");

-- CreateIndex
CREATE INDEX "media_asset_storage_provider_idx" ON "media_asset"("storage_provider");

-- CreateIndex
CREATE INDEX "media_asset_uploaded_by_idx" ON "media_asset"("uploaded_by");

-- CreateIndex
CREATE INDEX "media_asset_original_path_idx" ON "media_asset"("original_path");

-- CreateIndex
CREATE INDEX "media_asset_checksum_idx" ON "media_asset"("checksum");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_created_at_idx" ON "audit_log"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_actor_user_id_created_at_idx" ON "audit_log"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_action_idx" ON "audit_log"("action");

-- CreateIndex
CREATE INDEX "transition_run_target_year_id_idx" ON "transition_run"("target_year_id");

-- CreateIndex
CREATE INDEX "backup_record_scope_created_at_idx" ON "backup_record"("scope", "created_at" DESC);

-- CreateIndex
CREATE INDEX "backup_record_verified_idx" ON "backup_record"("verified");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_avatar_media_id_fkey" FOREIGN KEY ("avatar_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_year" ADD CONSTRAINT "academic_year_transitioned_from_year_id_fkey" FOREIGN KEY ("transitioned_from_year_id") REFERENCES "academic_year"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_year" ADD CONSTRAINT "academic_year_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_year" ADD CONSTRAINT "academic_year_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role" ADD CONSTRAINT "role_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit_lineage" ADD CONSTRAINT "org_unit_lineage_first_seen_year_id_fkey" FOREIGN KEY ("first_seen_year_id") REFERENCES "academic_year"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit_lineage" ADD CONSTRAINT "org_unit_lineage_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_org_unit_lineage_key_fkey" FOREIGN KEY ("org_unit_lineage_key") REFERENCES "org_unit_lineage"("lineage_key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit_type" ADD CONSTRAINT "org_unit_type_icon_media_id_fkey" FOREIGN KEY ("icon_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit_type_allowed_child" ADD CONSTRAINT "org_unit_type_allowed_child_parent_type_id_fkey" FOREIGN KEY ("parent_type_id") REFERENCES "org_unit_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit_type_allowed_child" ADD CONSTRAINT "org_unit_type_allowed_child_child_type_id_fkey" FOREIGN KEY ("child_type_id") REFERENCES "org_unit_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_org_unit_type_id_fkey" FOREIGN KEY ("org_unit_type_id") REFERENCES "org_unit_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "org_unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_lineage_key_fkey" FOREIGN KEY ("lineage_key") REFERENCES "org_unit_lineage"("lineage_key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit" ADD CONSTRAINT "org_unit_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_photo_media_id_fkey" FOREIGN KEY ("photo_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_app_user_id_fkey" FOREIGN KEY ("app_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person" ADD CONSTRAINT "person_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position" ADD CONSTRAINT "position_applies_to_type_id_fkey" FOREIGN KEY ("applies_to_type_id") REFERENCES "org_unit_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_org_unit_id_academic_year_id_fkey" FOREIGN KEY ("org_unit_id", "academic_year_id") REFERENCES "org_unit"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_org_unit_type_id_fkey" FOREIGN KEY ("org_unit_type_id") REFERENCES "org_unit_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "person"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_content_type_fkey" FOREIGN KEY ("content_type") REFERENCES "content_type_def"("content_type") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_item" ADD CONSTRAINT "content_item_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_content_item_id_fkey" FOREIGN KEY ("content_item_id") REFERENCES "content_item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_is_restore_of_revision_id_fkey" FOREIGN KEY ("is_restore_of_revision_id") REFERENCES "content_revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_revision" ADD CONSTRAINT "content_revision_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_profile_payload" ADD CONSTRAINT "club_profile_payload_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_profile_payload" ADD CONSTRAINT "club_profile_payload_logo_media_id_fkey" FOREIGN KEY ("logo_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_profile_payload" ADD CONSTRAINT "club_profile_payload_hero_media_id_fkey" FOREIGN KEY ("hero_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "club_mission_point" ADD CONSTRAINT "club_mission_point_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_profile_payload" ADD CONSTRAINT "hostel_profile_payload_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_profile_payload" ADD CONSTRAINT "hostel_profile_payload_building_media_id_fkey" FOREIGN KEY ("building_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hostel_profile_payload" ADD CONSTRAINT "hostel_profile_payload_infrastructure_pdf_media_id_fkey" FOREIGN KEY ("infrastructure_pdf_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_profile_payload" ADD CONSTRAINT "mess_profile_payload_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_profile_payload" ADD CONSTRAINT "mess_profile_payload_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_profile_payload" ADD CONSTRAINT "mess_profile_payload_infrastructure_pdf_media_id_fkey" FOREIGN KEY ("infrastructure_pdf_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mess_meal_timing" ADD CONSTRAINT "mess_meal_timing_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_payload" ADD CONSTRAINT "event_payload_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_payload" ADD CONSTRAINT "event_payload_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_payload" ADD CONSTRAINT "announcement_payload_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcement_payload" ADD CONSTRAINT "announcement_payload_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flagship_event_payload" ADD CONSTRAINT "flagship_event_payload_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flagship_event_payload" ADD CONSTRAINT "flagship_event_payload_image_media_id_fkey" FOREIGN KEY ("image_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_payload" ADD CONSTRAINT "resource_payload_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_payload" ADD CONSTRAINT "resource_payload_file_media_id_fkey" FOREIGN KEY ("file_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_block_payload" ADD CONSTRAINT "page_block_payload_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_block_payload" ADD CONSTRAINT "page_block_payload_primary_media_id_fkey" FOREIGN KEY ("primary_media_id") REFERENCES "media_asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_media" ADD CONSTRAINT "content_media_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "content_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_media" ADD CONSTRAINT "content_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media_asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_asset" ADD CONSTRAINT "media_asset_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transition_run" ADD CONSTRAINT "transition_run_source_year_id_fkey" FOREIGN KEY ("source_year_id") REFERENCES "academic_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transition_run" ADD CONSTRAINT "transition_run_target_year_id_fkey" FOREIGN KEY ("target_year_id") REFERENCES "academic_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transition_run" ADD CONSTRAINT "transition_run_run_by_fkey" FOREIGN KEY ("run_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_record" ADD CONSTRAINT "backup_record_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================
-- RAW-SQL MIGRATION OBJECTS — invisible to Prisma. NEVER `prisma db pull`
-- (it would silently drop these). Mirrors docs/SCHEMA_DESIGN.md
-- "Prisma/Postgres/Neon notes". Maintained by hand; covered by tests/migration.test.mjs.
-- ============================================================================

-- ── CHECK constraints (Prisma cannot express CHECKs) ──
ALTER TABLE "academic_year" ADD CONSTRAINT "academic_year_label_format_chk"
  CHECK ("label" ~ '^[0-9]{4}-[0-9]{2}$');
ALTER TABLE "academic_year" ADD CONSTRAINT "academic_year_date_order_chk"
  CHECK ("end_date" > "start_date");
ALTER TABLE "academic_year" ADD CONSTRAINT "academic_year_no_self_transition_chk"
  CHECK ("transitioned_from_year_id" IS NULL OR "transitioned_from_year_id" <> "id");
ALTER TABLE "position" ADD CONSTRAINT "position_max_holders_chk"
  CHECK ("max_holders" IS NULL OR "max_holders" >= 1);
ALTER TABLE "mess_profile_payload" ADD CONSTRAINT "mess_capacity_chk"
  CHECK ("capacity" IS NULL OR "capacity" >= 0);
ALTER TABLE "mess_meal_timing" ADD CONSTRAINT "mess_meal_time_order_chk"
  CHECK ("wraps_midnight" OR "end_time" > "start_time");
ALTER TABLE "event_payload" ADD CONSTRAINT "event_publish_window_chk"
  CHECK ("publish_until" IS NULL OR "publish_from" IS NULL OR "publish_until" > "publish_from");
ALTER TABLE "announcement_payload" ADD CONSTRAINT "announcement_publish_window_chk"
  CHECK ("publish_until" IS NULL OR "publish_from" IS NULL OR "publish_until" > "publish_from");
ALTER TABLE "transition_run" ADD CONSTRAINT "transition_no_self_chk"
  CHECK ("source_year_id" <> "target_year_id");

-- ── Partial / expression / NULLS-NOT-DISTINCT unique & helper indexes ──
-- exactly one current academic year
CREATE UNIQUE INDEX "academic_year_one_current_uq"
  ON "academic_year" ("is_current") WHERE "is_current" = true;
-- developer fast-path lookup
CREATE INDEX "app_user_is_developer_idx"
  ON "app_user" ("is_developer") WHERE "is_developer" = true;
-- one person per email (case-insensitive, when present)
CREATE UNIQUE INDEX "person_email_uq"
  ON "person" ("email") WHERE "email" IS NOT NULL;
-- directory name search
CREATE INDEX "person_full_name_lower_idx"
  ON "person" (lower("full_name"));
-- hot path: a user's effective (non-revoked) role assignments
CREATE INDEX "role_assignment_active_user_idx"
  ON "role_assignment" ("user_id") WHERE "revoked_at" IS NULL;
-- no duplicate ACTIVE grant (NULL scope columns treated as equal)
CREATE UNIQUE INDEX "role_assignment_unique_active_grant_uq"
  ON "role_assignment" ("user_id", "role_id", "org_unit_lineage_key", "academic_year_id")
  NULLS NOT DISTINCT WHERE "revoked_at" IS NULL;
-- public org listing
CREATE INDEX "org_unit_active_status_idx"
  ON "org_unit" ("academic_year_id", "status") WHERE "archived_at" IS NULL;
-- no duplicate active appointment of the same person to the same position/unit/year
CREATE UNIQUE INDEX "appointment_no_dup_active_uq"
  ON "appointment" ("academic_year_id", "org_unit_id", "position_id", "person_id")
  WHERE "archived_at" IS NULL;
-- singleton positions (max_holders=1, e.g. secretary/PIC/warden): at most one
-- active holder per (year, unit, position). Concurrency-safe at the index level
-- (closes the count-trigger TOCTOU race). is_singleton is maintained by
-- appointment_type_guard from position.max_holders. (DL-021 / SCHEMA_DESIGN line 858)
CREATE UNIQUE INDEX "appointment_singleton_position_uq"
  ON "appointment" ("academic_year_id", "org_unit_id", "position_id")
  WHERE "archived_at" IS NULL AND "status" <> 'archived' AND "is_singleton";
-- slug uniqueness per (type, year); NULLS NOT DISTINCT closes the NULL-year hole
CREATE UNIQUE INDEX "content_item_slug_uq"
  ON "content_item" ("content_type", "academic_year_id", "slug")
  NULLS NOT DISTINCT WHERE "slug" IS NOT NULL;
-- public content listing
CREATE INDEX "content_item_listing_idx"
  ON "content_item" ("content_type", "academic_year_id", "status") WHERE "archived_at" IS NULL;
-- pinned announcements
CREATE INDEX "content_item_pinned_idx"
  ON "content_item" ("pinned") WHERE "pinned" = true;
-- at most one open draft revision per item (matches content_item.draft_revision_id)
CREATE UNIQUE INDEX "content_revision_one_draft_uq"
  ON "content_revision" ("content_item_id") WHERE "revision_status" = 'draft';
-- at most one live published revision per item (matches content_item.published_revision_id)
CREATE UNIQUE INDEX "content_revision_one_published_uq"
  ON "content_revision" ("content_item_id") WHERE "revision_status" = 'published';
-- at most one primary hero per revision
CREATE UNIQUE INDEX "content_media_one_primary_hero_uq"
  ON "content_media" ("revision_id") WHERE "role" = 'hero_primary';
-- cloudinary public id unique when present
CREATE UNIQUE INDEX "media_asset_cloudinary_public_id_uq"
  ON "media_asset" ("cloudinary_public_id") WHERE "cloudinary_public_id" IS NOT NULL;
-- one successful transition per (source, target) pair
CREATE UNIQUE INDEX "transition_run_one_completed_uq"
  ON "transition_run" ("source_year_id", "target_year_id") WHERE "status" = 'completed';

-- ── GIN / BRIN indexes ──
CREATE INDEX "page_block_payload_data_gin"
  ON "page_block_payload" USING GIN ("data" jsonb_path_ops);
CREATE INDEX "audit_log_after_gin"
  ON "audit_log" USING GIN ("after" jsonb_path_ops);
CREATE INDEX "audit_log_created_at_brin"
  ON "audit_log" USING BRIN ("created_at");

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- ── lock_guard: a locked academic_year is structurally read-only. INSERT/
--    UPDATE/DELETE on year-scoped structure/content rows of a locked year are
--    rejected. content_revision INSERT is allowed (append-only errata path:
--    add a new revision to existing locked-year content); only UPDATE/DELETE of
--    existing revisions is blocked. Errata = unlock->correct->relock OR append. ──
CREATE OR REPLACE FUNCTION lock_guard() RETURNS trigger AS $$
DECLARE
  v_year_id uuid;
  v_status academic_year_status;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'content_revision' THEN
      SELECT ci.academic_year_id INTO v_year_id FROM content_item ci WHERE ci.id = OLD.content_item_id;
    ELSE
      v_year_id := OLD.academic_year_id;
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'content_revision' THEN
      SELECT ci.academic_year_id INTO v_year_id FROM content_item ci WHERE ci.id = NEW.content_item_id;
    ELSE
      v_year_id := NEW.academic_year_id;
    END IF;
  END IF;

  IF v_year_id IS NOT NULL THEN
    SELECT status INTO v_status FROM academic_year WHERE id = v_year_id;
    IF v_status = 'locked' THEN
      RAISE EXCEPTION 'lock_guard: % on % blocked — academic year % is locked (errata: unlock->correct->relock, or append a new content_revision)',
        TG_OP, TG_TABLE_NAME, v_year_id USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lock_guard_org_unit
  BEFORE INSERT OR UPDATE OR DELETE ON "org_unit"
  FOR EACH ROW EXECUTE FUNCTION lock_guard();
CREATE TRIGGER lock_guard_appointment
  BEFORE INSERT OR UPDATE OR DELETE ON "appointment"
  FOR EACH ROW EXECUTE FUNCTION lock_guard();
CREATE TRIGGER lock_guard_content_item
  BEFORE INSERT OR UPDATE OR DELETE ON "content_item"
  FOR EACH ROW EXECUTE FUNCTION lock_guard();
CREATE TRIGGER lock_guard_content_revision
  BEFORE UPDATE OR DELETE ON "content_revision"
  FOR EACH ROW EXECUTE FUNCTION lock_guard();

-- ── org_unit_hierarchy_guard: a child org_unit's parent must be in the SAME
--    academic year and of an ALLOWED parent type (org_unit_type_allowed_child).
--    Prevents cross-year hierarchy contamination (same class as the appointment
--    composite FK, DL-008) and enforces the normalized hierarchy rule. ──
CREATE OR REPLACE FUNCTION org_unit_hierarchy_guard() RETURNS trigger AS $$
DECLARE
  v_parent_year uuid;
  v_parent_type uuid;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'org_unit_hierarchy_guard: an org_unit cannot be its own parent (%)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT academic_year_id, org_unit_type_id INTO v_parent_year, v_parent_type
    FROM org_unit WHERE id = NEW.parent_id;
  IF v_parent_year IS NULL THEN
    RAISE EXCEPTION 'org_unit_hierarchy_guard: parent org_unit % not found', NEW.parent_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_parent_year <> NEW.academic_year_id THEN
    RAISE EXCEPTION 'org_unit_hierarchy_guard: parent % is in year % but child is in year % (parent must be same-year)',
      NEW.parent_id, v_parent_year, NEW.academic_year_id USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM org_unit_type_allowed_child
    WHERE parent_type_id = v_parent_type AND child_type_id = NEW.org_unit_type_id
  ) THEN
    RAISE EXCEPTION 'org_unit_hierarchy_guard: a unit of type % may not be parented under a unit of type % (no allowed-child edge)',
      NEW.org_unit_type_id, v_parent_type USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER org_unit_hierarchy_guard_trg
  BEFORE INSERT OR UPDATE ON "org_unit"
  FOR EACH ROW EXECUTE FUNCTION org_unit_hierarchy_guard();

-- ── appointment_type_guard: the echoed org_unit_type_id must equal the unit's
--    real type; auto-fills it when NULL; a position bound to a type
--    (applies_to_type_id) cannot be appointed to a unit of a different type
--    (e.g. a Warden cannot be appointed to a club). ──
CREATE OR REPLACE FUNCTION appointment_type_guard() RETURNS trigger AS $$
DECLARE
  v_unit_type uuid;
  v_applies_to uuid;
  v_max_holders int;
BEGIN
  SELECT org_unit_type_id INTO v_unit_type FROM org_unit
    WHERE id = NEW.org_unit_id AND academic_year_id = NEW.academic_year_id;
  IF v_unit_type IS NULL THEN
    RAISE EXCEPTION 'appointment_type_guard: org_unit % not found in academic year %',
      NEW.org_unit_id, NEW.academic_year_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_unit_type_id IS NULL THEN
    NEW.org_unit_type_id := v_unit_type;
  ELSIF NEW.org_unit_type_id <> v_unit_type THEN
    RAISE EXCEPTION 'appointment_type_guard: org_unit_type_id % does not match org_unit''s actual type %',
      NEW.org_unit_type_id, v_unit_type USING ERRCODE = 'check_violation';
  END IF;

  SELECT applies_to_type_id, max_holders INTO v_applies_to, v_max_holders
    FROM position WHERE id = NEW.position_id;
  IF v_applies_to IS NOT NULL AND v_applies_to <> v_unit_type THEN
    RAISE EXCEPTION 'appointment_type_guard: position % (applies to type %) is not valid for org_unit of type %',
      NEW.position_id, v_applies_to, v_unit_type USING ERRCODE = 'check_violation';
  END IF;

  -- Maintain the denormalized singleton flag that backs appointment_singleton_position_uq.
  NEW.is_singleton := (v_max_holders = 1);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER appointment_type_guard_trg
  BEFORE INSERT OR UPDATE ON "appointment"
  FOR EACH ROW EXECUTE FUNCTION appointment_type_guard();

-- ── appointment_cardinality_guard: enforce position.max_holders (NULL =
--    unlimited). Deferred so multi-row roster writes validate at COMMIT.
--    Covers both singletons (max_holders=1) and bounded multi-holder positions. ──
CREATE OR REPLACE FUNCTION appointment_cardinality_guard() RETURNS trigger AS $$
DECLARE
  v_max int;
  v_count int;
BEGIN
  SELECT max_holders INTO v_max FROM position WHERE id = NEW.position_id;
  IF v_max IS NULL THEN
    RETURN NEW; -- unlimited
  END IF;
  SELECT count(*) INTO v_count FROM appointment
    WHERE academic_year_id = NEW.academic_year_id
      AND org_unit_id = NEW.org_unit_id
      AND position_id = NEW.position_id
      AND archived_at IS NULL
      AND status <> 'archived';
  IF v_count > v_max THEN
    RAISE EXCEPTION 'appointment_cardinality_guard: position % allows at most % active holder(s) in org_unit % (year %); found %',
      NEW.position_id, v_max, NEW.org_unit_id, NEW.academic_year_id, v_count USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER appointment_cardinality_guard_trg
  AFTER INSERT OR UPDATE ON "appointment"
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION appointment_cardinality_guard();

-- ── content_item_pointer_guard: the plain cache columns published_revision_id /
--    draft_revision_id must each point at a content_revision OF THIS ITEM whose
--    revision_status matches (published / draft). Replaces the removed circular FK. ──
CREATE OR REPLACE FUNCTION content_item_pointer_guard() RETURNS trigger AS $$
DECLARE
  v_item uuid;
  v_status revision_status;
BEGIN
  IF NEW.published_revision_id IS NOT NULL THEN
    SELECT content_item_id, revision_status INTO v_item, v_status
      FROM content_revision WHERE id = NEW.published_revision_id;
    IF v_item IS NULL OR v_item <> NEW.id THEN
      RAISE EXCEPTION 'content_item_pointer_guard: published_revision_id % is not a revision of content_item %',
        NEW.published_revision_id, NEW.id USING ERRCODE = 'check_violation';
    END IF;
    IF v_status <> 'published' THEN
      RAISE EXCEPTION 'content_item_pointer_guard: published_revision_id % has status % (expected published)',
        NEW.published_revision_id, v_status USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.draft_revision_id IS NOT NULL THEN
    SELECT content_item_id, revision_status INTO v_item, v_status
      FROM content_revision WHERE id = NEW.draft_revision_id;
    IF v_item IS NULL OR v_item <> NEW.id THEN
      RAISE EXCEPTION 'content_item_pointer_guard: draft_revision_id % is not a revision of content_item %',
        NEW.draft_revision_id, NEW.id USING ERRCODE = 'check_violation';
    END IF;
    IF v_status <> 'draft' THEN
      RAISE EXCEPTION 'content_item_pointer_guard: draft_revision_id % has status % (expected draft)',
        NEW.draft_revision_id, v_status USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_item_pointer_guard_trg
  BEFORE INSERT OR UPDATE ON "content_item"
  FOR EACH ROW EXECUTE FUNCTION content_item_pointer_guard();

-- ── person_email_link_guard: when a person is linked to a login account, their
--    email must equal the account email (auto-filled when NULL) — prevents
--    identity drift. citext comparison is case-insensitive. ──
CREATE OR REPLACE FUNCTION person_email_link_guard() RETURNS trigger AS $$
DECLARE
  v_email citext;
BEGIN
  IF NEW.app_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT email INTO v_email FROM app_user WHERE id = NEW.app_user_id;
  IF NEW.email IS NULL THEN
    NEW.email := v_email;
  ELSIF NEW.email <> v_email THEN
    RAISE EXCEPTION 'person_email_link_guard: person.email (%) must equal linked app_user.email (%)',
      NEW.email, v_email USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER person_email_link_guard_trg
  BEFORE INSERT OR UPDATE ON "person"
  FOR EACH ROW EXECUTE FUNCTION person_email_link_guard();
