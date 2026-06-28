# Current Status

**Last updated:** 2026-06-28
**Session:** 3 of 10 — **COMPLETE** (CMS Foundation)
**Next session:** 4 — Academic Year Engine (year context, history queries, Transition Wizard)
**Branch:** `portal-v2`

> New session? Read [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md) first,
> then this file, [NEXT_TASK.md](NEXT_TASK.md), [TODO.md](TODO.md),
> [KNOWN_ISSUES.md](KNOWN_ISSUES.md), [docs/CHANGELOG.md](docs/CHANGELOG.md).

## What is done (Session 3)

- **Central audit-write choke point** (DL-012/DL-025/DL-028) — `lib/cms/audit.mjs`
  + `lib/cms/audit-context.mjs`, mounted in `lib/prisma.mjs`
  (`prisma = base.$extends(buildAuditExtension(base))`; `prismaBase` exported for
  bypass). Auto path audits every mutating op on audited models (recursion-safe
  via `base`, best-effort); the CMS service uses the semantic path — exactly one
  `audit_log` row per business action (create/publish/unpublish/archive/restore),
  written after commit with auto-audit suppressed in-transaction via an
  `AsyncLocalStorage` actor context. KNOWN_ISSUES #21 closed.
- **Content lifecycle service** — [lib/cms/content.mjs](lib/cms/content.mjs):
  `createDraft`, `editDraft` (in-place or auto-open a draft from published),
  `publish` (supersede → publish → repoint), `unpublish`, `archive`, `restore`
  (overwrite the open draft in place; `is_restore_of_revision_id` recorded).
  Honors the one-draft/one-published partial uniques + `content_item_pointer_guard`;
  reuses `assertPermission` on every mutating op, authorizing before any state check.
- **Version history** — `listRevisions`, `getRevision`, `diffRevisions` (+ pure
  `diffRevisionViews`); monotonic `revision_no`.
- **Generic editing layer** — [lib/cms/content-types.mjs](lib/cms/content-types.mjs)
  data-driven handlers (write/read/copy payloads + normalized list children +
  required-field validation) routed by `content_type`; the "every
  content_type_def has a handler" startup test is kept.
- **Public visibility** — [lib/cms/visibility.mjs](lib/cms/visibility.mjs):
  published AND current-year AND not-archived AND has-published-revision, plus
  event/announcement publish windows.
- **Friendly DB-guard errors** — [lib/cms/errors.mjs](lib/cms/errors.mjs):
  `mapDbError` translates trigger/unique/CHECK/Prisma violations into HTTP-shaped
  `CmsError`s; DB guards honored, never re-implemented (DL-029).
- **Tests** — **101 static passing** (was 50) across 11 files, default-green
  without a DB; plus **8 live-DB tests** (`RUN_DB_TESTS=1`) covering lifecycle,
  one-draft/one-published, restore + provenance + audit, audit coverage,
  visibility/windows, unpublish→republish, and a real-`lock_guard` YEAR_LOCKED test.
- **Adversarial review workflow** (30 agents, 5 lenses, per-finding verification):
  24 confirmed findings (1 major + minor/nit) all addressed and re-verified.

## What is NOT done yet (next sessions)

- Academic Year Engine: current-year context, history queries, **Transition
  Wizard** (copy structure forward) → Session 4.
- Organization model (clubs/councils/hostels/mess as org units + appointments) →
  Session 5; migrate hardcoded V1 org content.
- Events/announcements rebuilt on Postgres (uses the CMS service) → Session 6.
- Resources + Media (Cloudinary) → Session 7; Developer Console → Session 8;
  full RBAC-gated Admin Panel (UI over the CMS service) → Session 9.
- Owner-owned: rotate/remove the V1 leaked secrets in `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md)).

## Key facts for the next session

- DB is live on Neon with the seeded baseline. `npm test` (static) is always
  green; `RUN_DB_TESTS=1 dotenv -e .env.local -- npm test` adds the live smoke +
  CMS live tests. The remote Neon compute has high per-round-trip latency, so the
  live CMS tests are slow (minutes) and use generous per-test/tx timeouts.
- Import `prisma` from `lib/prisma.mjs` for all app DB access — it is the
  audit-extended client, so mutations are audited automatically. Use `prismaBase`
  only to bypass audit (audit reader, repair scripts, test cleanup).
- The CMS service (`lib/cms/content.mjs`) is the mutation entrypoint; route
  handlers (Session 9) call `requirePermission` then the service. The public read
  path is `lib/cms/visibility.mjs`.
- Raw-SQL objects live in the init migration's tail and are invisible to Prisma —
  never `prisma db pull` / `migrate reset`. No new migration was needed this
  session (the CMS layer uses the Session-2 schema as-is).

## Next action

See [NEXT_TASK.md](NEXT_TASK.md).
