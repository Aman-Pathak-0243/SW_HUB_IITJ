# Next Task

**As of:** 2026-06-29 · **Session 6 complete → Session 7 is next.**

## Session 7 — Resources + Media

Build the **Resources** module (per-org-unit PDFs/links) on the existing CMS spine,
and the **Media** layer: a real `media_asset` upload path (Cloudinary) plus the
**Admin Media Migration Tool** that moves the ~105 `/public` assets (and the base64
placeholders left by Session 6) to Cloudinary and updates references. **Read first:**
[docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md),
[docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md) (`resource_payload`, `media_asset`,
`content_media`, `media_kind`/`storage_provider`/`media_role`),
[docs/DATA_MIGRATION_REPORT.md](docs/DATA_MIGRATION_REPORT.md) §3 (the `/public`
assets + the two Cloudinary accounts) and §9 (static→Cloudinary),
[docs/DECISION_LOG.md](docs/DECISION_LOG.md) (DL-039 base64 placeholders, DL-016
JSONB policy), [CURRENT_STATUS.md](CURRENT_STATUS.md),
[KNOWN_ISSUES.md](KNOWN_ISSUES.md) (#4 pdfjs version, #5 base64 placeholders to
reconcile, #17 unused image hosts, #18 `/public` ~74 MB).

### Ordered tasks
1. **Resources on Postgres** — drive `content_type='resource'` (org-bound) through
   the CMS service (the handler/payload already exist: `resource_kind`,
   `file_media_id`, `external_url`, `description`). A public read layer + a
   data-driven resources view (per org unit, like the Session-5/6 patterns).
2. **Media service** (`lib/media/*`) — create/list/curate `media_asset` rows; a
   Cloudinary upload path (use the env-configured account); resolve a `media_asset`
   → delivery URL. Honor the audited-mutation pattern; media inventory writes that
   should NOT flood the audit log use `prismaBase` (as the importers do).
3. **Admin Media Migration Tool** — idempotent, reversible `/public` → Cloudinary
   migration that sets `cloudinary_public_id`/`url`/`migrated_at` and **reconciles
   the Session-6 base64 placeholders** (`BASE64_PLACEHOLDER_URL`, DL-039) and the
   Session-5 `/public`/external inventory rows. Dry-run + rollback.
4. **Cover/host follow-ups** — broaden `next.config.mjs` image hosts as needed (the
   events `EventsBoard` allowlist is intentionally narrow today); fix the pdfjs
   version mismatch (#4) when the PDF resource view is built.
5. **Tests** — static (payload/migration-plan logic, URL/host resolution) + live-DB
   (resource publish→visible; a small idempotent media-migration fixture). Keep the
   static suite default-green; reuse the self-healing throwaway-year fixture pattern.

### Guard rails (rely on them; don't re-implement)
- Resources are CMS content — a CALLER of `lib/cms/content.mjs`, like events
  (DL-037). Honor DB guards via `mapDbError`; never re-implement them (DL-029).
- Use `prisma` from `lib/prisma.mjs` (audited); `prismaBase` only to bypass
  (bulk media inventory). Neon has high per-query latency + auto-suspends — give
  live tests generous timeouts and re-run once on a cold-compute "Can't reach
  database server". Prisma CLI reads `.env` not `.env.local` — use the `db:*` scripts.
- Never `prisma db pull` / `migrate reset`; any raw-SQL change is a NEW forward
  migration (`CREATE OR REPLACE`), never an init edit (DL-027/DL-036).

### End-of-session (mandatory)
Run the END-OF-SESSION checklist in
[docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md): update CURRENT_STATUS,
NEXT_TASK, TODO, CHANGELOG, DECISION_LOG, KNOWN_ISSUES, Developer Guide,
Token_Usage; prepare one specific commit; output the Session-8 starter prompt.

## Operator-owned (run when convenient)
- **Populate the live current year:** `npm run db:import:org` (~15 min, idempotent;
  4 councils / 30 clubs / 6 hostels / 5 messes + people + appointments) and
  `npm run db:import:events` (~1 min; the 3 backed-up events). Both are operator
  steps like `db:seed` (KNOWN_ISSUES #27).

## Owner-owned (parallel, anytime)
- Rotate/revoke the V1 leaked secrets and clean `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md));
  consider rotating the Neon password (#19).
