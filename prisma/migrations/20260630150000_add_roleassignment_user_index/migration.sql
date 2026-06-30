-- ============================================================================
-- Session 11 / M1 prelude — index the hottest RBAC query path.
-- ============================================================================
-- A NEW FORWARD migration (DL-027): additive only, applied with `npm run db:migrate`
-- (prisma migrate deploy, reads .env.local). NOT created via `prisma migrate dev`
-- (which uses a shadow DB + can prompt to RESET on a perceived drift from the
-- raw-SQL objects the init carries — forbidden by the protocol).
--
-- lib/rbac/authorize.mjs resolves permissions on EVERY protected request and filters
-- role_assignment by (user_id, revoked_at). user_id is an FK column, and Postgres
-- does NOT auto-index FK columns, so that resolution was a sequential scan — the
-- dominant cost once the per-request React.cache memo (the "latency caching" change)
-- still has to make this one DB round-trip. This composite serves the lookup
-- directly (and its leading user_id column also covers plain user_id filters).
--
-- Matches the Prisma `@@index([userId, revokedAt])` on model RoleAssignment, so the
-- index name is exactly what Prisma would emit — a later `migrate dev` sees no drift.
CREATE INDEX IF NOT EXISTS "role_assignment_user_id_revoked_at_idx"
  ON "role_assignment" ("user_id", "revoked_at");
