-- ============================================================================
-- Session 11 / M2 — RBAC: per-email permission overrides (categories = roles).
-- ============================================================================
-- A NEW FORWARD migration (DL-027): additive only — ONE new table + its FKs /
-- indexes + a raw-SQL tail (a mode CHECK and a NULLS-NOT-DISTINCT unique). The
-- init migration is never rewritten and `prisma db pull` / `migrate reset` are
-- never run (they would drop the raw-SQL objects from the schema's view). Apply
-- with `npm run db:migrate` (prisma migrate deploy, reads .env.local).
--
-- This table is what REVISES DL-026 #8's "no-deny" RBAC rule (DL-062): the
-- additive role union is computed first, then these per-user overrides are
-- applied — GRANT adds a single catalog permission, DENY removes it, and DENY
-- WINS. A developer / `grants_all` role still short-circuits BEFORE overrides.
-- The "categories" (normal_user / coordinator / co_coordinator / secretary /
-- staff / admin) are pure DATA (new `role` + `role_permission` rows added by the
-- seed) — no schema change needed for them. The email-format smart search reuses
-- the existing `app_user.email` citext unique + the pure parser (no new column).

-- ── user_permission_override: per-(user, permission, scope?) grant|deny ──
CREATE TABLE "user_permission_override" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"              UUID NOT NULL,
  "permission_id"        UUID NOT NULL,
  "mode"                 TEXT NOT NULL,
  "org_unit_lineage_key" UUID,
  "academic_year_id"     UUID,
  "reason"               TEXT,
  "created_at"           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMPTZ NOT NULL,
  "created_by"           UUID,
  CONSTRAINT "user_permission_override_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_permission_override_user_id_idx" ON "user_permission_override" ("user_id");
CREATE INDEX "user_permission_override_permission_id_idx" ON "user_permission_override" ("permission_id");

-- A permission override is cascade-deleted with its user / permission (it is meta
-- about that pair); the optional scope FKs RESTRICT (mirroring role_assignment) so
-- a scoped override can't dangle past the unit/year it references.
ALTER TABLE "user_permission_override" ADD CONSTRAINT "user_permission_override_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permission_override" ADD CONSTRAINT "user_permission_override_permission_id_fkey"
  FOREIGN KEY ("permission_id") REFERENCES "permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permission_override" ADD CONSTRAINT "user_permission_override_org_unit_lineage_key_fkey"
  FOREIGN KEY ("org_unit_lineage_key") REFERENCES "org_unit_lineage"("lineage_key") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_permission_override" ADD CONSTRAINT "user_permission_override_academic_year_id_fkey"
  FOREIGN KEY ("academic_year_id") REFERENCES "academic_year"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_permission_override" ADD CONSTRAINT "user_permission_override_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Raw-SQL tail (invisible to Prisma drift — catalogued in SCHEMA_DESIGN) ──
-- `mode` is a tiny fixed vocabulary — guard it at the DB so an app bug can't write
-- a bogus override that the resolver wouldn't understand.
ALTER TABLE "user_permission_override" ADD CONSTRAINT "user_permission_override_mode_chk"
  CHECK ("mode" IN ('grant', 'deny'));

-- At most ONE override per (user, permission, scope). The scope columns are
-- nullable; NULLS NOT DISTINCT (PG15+) closes the null-scope hole so a second
-- institute-wide override for the same (user, permission) is rejected — exactly
-- the role_assignment_unique_active_grant_uq pattern. This makes "set" an upsert
-- target and means grant/deny are mutually exclusive at a given scope.
CREATE UNIQUE INDEX "user_permission_override_unique_uq"
  ON "user_permission_override" ("user_id", "permission_id", "org_unit_lineage_key", "academic_year_id")
  NULLS NOT DISTINCT;
