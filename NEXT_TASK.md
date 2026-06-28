# Next Task

**As of:** 2026-06-28 · **Session 2 complete → Session 3 is next.**

## Session 3 — CMS Foundation

Build the draft/publish content lifecycle, version history, the generic
schema-driven editing layer, and wire in centralized audit logging — all on the
Session-2 Prisma schema. **Read first:** [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md),
[docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md) (authoritative spec, esp. content
spine + capabilities 6/7/8/9), [docs/DECISION_LOG.md](docs/DECISION_LOG.md)
(DL-004/005/006/011/012 + Session-2 DL-017..DL-027),
[docs/DATA_MIGRATION_REPORT.md](docs/DATA_MIGRATION_REPORT.md).

### Ordered tasks
1. **Content service** over `content_item` + `content_revision` + per-type
   `*_payload`: create draft, edit draft, publish (supersede prior published,
   repoint `published_revision_id`), unpublish, archive, and **restore** (overwrite
   the open draft in place; honor the at-most-one-draft / one-published partial
   uniques + the `content_item_pointer_guard` trigger).
2. **Version history** — list/diff revisions; `is_restore_of_revision_id`
   provenance; monotonic `revision_no`.
3. **Generic editing layer** — route by `content_type` via the in-code handler
   map ([lib/cms/content-types.mjs](lib/cms/content-types.mjs)); keep the startup
   test that every `content_type_def` has a handler.
4. **Central audit-write extension** (DL-012 / DL-025) — ONE Prisma Client
   `$extends` (or audited-mutation service) capturing before/after and writing
   `audit_log` on every create/update/delete/publish/transition/grant. Attach it
   to [lib/prisma.mjs](lib/prisma.mjs). Add coverage tests.
5. **Public visibility rule** in the data-access layer: `status='published' AND
   academic_year_id = current year` (+ event/announcement publish windows).
6. **Tests** — content lifecycle, restore, version history, audit coverage,
   publish-visibility; extend the live DB smoke as useful.

### Guard rails (already enforced by the DB — rely on them)
- `lock_guard` (locked-year read-only; revision INSERT allowed for errata),
  pointer same-item/status, partial uniques for one-draft/one-published. Don't
  re-implement in app code; surface friendly errors on violation.

### End-of-session (mandatory)
Run the END-OF-SESSION checklist in
[docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md): update CURRENT_STATUS,
NEXT_TASK, TODO, CHANGELOG, DECISION_LOG, KNOWN_ISSUES, Developer Guide,
Token_Usage; prepare one specific commit; output the Session-4 starter prompt.

## Owner-owned (parallel, anytime)
- Rotate/revoke the V1 leaked secrets and clean `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md)).
- Consider rotating the Neon password if the sharing channel isn't private
  (KNOWN_ISSUES #19).
