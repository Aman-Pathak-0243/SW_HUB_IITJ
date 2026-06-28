# Next Task

**As of:** 2026-06-28 · **Session 5 complete → Session 6 is next.**

## Session 6 — Events + Announcements

Rebuild the V1 events feature on Postgres and add Announcements, both as
year-scoped CMS content through the **Session-3 CMS service** (`lib/cms/content.mjs`)
— no new mutation pipeline, no new audit/visibility code. **Read first:**
[docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md),
[docs/DATA_MIGRATION_REPORT.md](docs/DATA_MIGRATION_REPORT.md) (§2 the 3 backed-up
`events` docs + the `queries` collection; §7 events/announcements rows),
[docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md) (`event_payload`,
`announcement_payload`, `content_item.pinned`, `audience_type`, publish windows),
[docs/DECISION_LOG.md](docs/DECISION_LOG.md) (DL-010 separate announcement table,
DL-032 archive-aware windows), [CURRENT_STATUS.md](CURRENT_STATUS.md),
[KNOWN_ISSUES.md](KNOWN_ISSUES.md) (#3 `/past-events` contract, #5 base64 images,
#16 no edit/delete — all close here).

### Ordered tasks
1. **Events on Postgres** — drive `content_type='event'` through the CMS service
   (create/edit draft → publish/unpublish/archive/restore). The payload + publish
   window (`publish_from`/`publish_until`) + audience are already modeled; reuse
   the generic content-type handler. Replace the V1 Mongo write path
   (`app/api/events`) — keep it gated, or retire it for a CMS-backed route.
2. **Migrate the 3 backed-up events** — idempotent importer (mirror
   `lib/org/import.mjs`): map each Mongo `Event` (title, description, date, image)
   → `content_item` + `event_payload` (+ a `media_asset` inventory row from the
   base64/URL image; the base64 blobs are KNOWN_ISSUES #5 — store as media, not in
   the row). Scope to the current year (2025-26). Publish them.
3. **Announcements** — `content_type='announcement'` with `pinned`, `audience`,
   and the publish window; list pinned-first. Own payload table (DL-010).
4. **Public + admin reads** — events/announcements lists via
   `lib/cms/visibility.mjs` (current year, windowed) and `lib/year/public.mjs`
   (archive). Fix the V1 `/past-events` contract bug (#3); build a data-driven
   events page (and announcements page) like the Session-5 org pages.
5. **`queries` collection** — review the 1 backed-up doc; if a real enquiry, model
   a small `contact_message` module (one `content_type_def` row + payload table);
   if test data, archive in the backup and do not migrate. **Decide here.**
6. **Tests** — static (event/announcement payload handling, window/pin logic) +
   live-DB (publish→visible-in-window, expire, pin ordering, the events importer
   idempotency). Keep the static suite default-green.

### Guard rails (rely on them; don't re-implement)
- The CMS service + `auditedMutation` + `mapDbError` + visibility/window rules are
  done — events/announcements are *callers*. Honor `event_publish_window_chk` /
  `announcement_publish_window_chk` (surface `PUBLISH_WINDOW`). Use `prisma` from
  `lib/prisma.mjs` (audited); `prismaBase` only to bypass (media inventory).
- Neon has high per-query latency + auto-suspends — give live tests generous
  timeouts and re-run once on a cold-compute "Can't reach database server".

### End-of-session (mandatory)
Run the END-OF-SESSION checklist in
[docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md): update CURRENT_STATUS,
NEXT_TASK, TODO, CHANGELOG, DECISION_LOG, KNOWN_ISSUES, Developer Guide,
Token_Usage; prepare one specific commit; output the Session-7 starter prompt.

## Operator-owned (run when convenient)
- **Populate the live current year:** `npm run db:import:org` (idempotent,
  ~15 min on Neon; mirrors how `db:seed` is run). Stands up all 4 councils / 30
  clubs / 6 hostels / 5 messes + people + appointments for 2025-26. (#27)

## Owner-owned (parallel, anytime)
- Rotate/revoke the V1 leaked secrets and clean `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md));
  consider rotating the Neon password (#19).
