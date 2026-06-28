# Current Status

**Last updated:** 2026-06-28
**Session:** 4 of 10 — **COMPLETE** (Academic Year Engine)
**Next session:** 5 — Organization Model (clubs/councils/hostels/mess as org units + appointments; migrate hardcoded V1 data)
**Branch:** `portal-v2`

> New session? Read [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md) first,
> then this file, [NEXT_TASK.md](NEXT_TASK.md), [TODO.md](TODO.md),
> [KNOWN_ISSUES.md](KNOWN_ISSUES.md), [docs/CHANGELOG.md](docs/CHANGELOG.md).

## What is done (Session 4)

- **Year context** ([lib/year/context.mjs](lib/year/context.mjs)) — `resolveCurrentYear` /
  `getCurrentYearId` / `requireCurrentYear` (the `is_current` partial unique
  guarantees exactly one), `listYears` (optional per-year counts), `getYear` /
  `getYearByLabel`, `createYear`, and `setCurrentYear` (demote-then-promote in ONE
  transaction so the one-current unique never sees two). Mutations gate on
  `year.*` via `assertActorPermission` and write one semantic audit row.
- **History queries** ([lib/year/history.mjs](lib/year/history.mjs)) — read any
  year's content / org units / roster by `academic_year_id`, and follow a logical
  unit across years via `org_unit_lineage` (`followLineage` / `getUnitHistory`).
  Reads only; past (locked) years are write-protected by `lock_guard`, browsable freely.
- **Transition Wizard** ([lib/year/transition.mjs](lib/year/transition.mjs)) —
  `runTransition` copies a source year's STRUCTURE forward as new `org_unit` rows
  **reusing their `org_unit_lineage`** (DL-007), with `copy_appointments` /
  `copy_content` (clone latest revision as a target-year **draft**) /
  `copy_role_assignments` (defaults per DL-026). Records `transition_run`
  status + per-entity counts; honors the `source<>target` CHECK and the
  one-completed-per-pair unique; **idempotent / resumable** (skips rows already in
  the target; self-heals partial runs; `force` re-syncs into the same completed
  run). Audited as `action='transition'` — exactly one row, auto-audit suppressed
  during the copy (DL-031).
- **Lock / unlock** ([lib/year/lock.mjs](lib/year/lock.mjs)) — `lockYear` /
  `unlockYear` flip `academic_year.status`; the current year cannot be locked;
  blocked writes surface the friendly `YEAR_LOCKED` error.
- **Public year selector** ([lib/year/public.mjs](lib/year/public.mjs)) —
  `listSelectableYears`, `listPublicContentForYear`, `getPublicItemBySlugForYear`,
  `getPublicYearArchive`: a chosen past year's published content under the
  visibility rule, with archive-aware publish windows (DL-032).
- **Shared helpers** — `auditedMutation` + `TX_OPTS` promoted to
  [lib/cms/audited-mutation.mjs](lib/cms/audited-mutation.mjs) (used by the CMS
  service AND the year engine; DL-033); the public fetch-then-window loop shared
  via `loadPublicItems`/`loadPublicItem` in `lib/cms/visibility.mjs`;
  `resolveCurrentYear` now canonical in `lib/year/context.mjs` (visibility re-exports).
- **Error mapping** — `lib/cms/errors.mjs#mapDbError` extended with the
  year/transition guard signatures (`YEAR_LOCKED`, `CURRENT_YEAR_CONFLICT`,
  `TRANSITION_EXISTS`, `TRANSITION_SELF`, `ONE_UNIT_PER_YEAR`,
  `INVALID_YEAR_LABEL`/`DATES`/`PROVENANCE`, `YEAR_LABEL_TAKEN`).
- **Tests** — **130 static** (was 101): new `year.test.mjs` (16) +
  `year-transition.test.mjs` (13, pure planning helpers); plus **6 live-DB**
  (`year.db.test.mjs`, `RUN_DB_TESTS=1`): current-year resolution + set-current,
  history + lineage follow, structure-only transition (lineage reuse, parent
  remap, auto-audit suppression asserted), structure+appointments+content,
  full + role-assignment copy with idempotent re-run **and forced re-sync**, and
  lock/unlock (real `lock_guard` → `YEAR_LOCKED`). All 8 Session-3 CMS live tests
  still green after the shared-helper refactor.
- **Adversarial review workflow** (24 agents, 6 lenses, per-finding verification):
  18 confirmed findings — **16 fixed, 2 nits accepted** (documented).

## What was done (Session 3)

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

- Organization model (clubs/councils/hostels/mess as org units + appointments) →
  **Session 5 (next)**; migrate hardcoded V1 org content. The year engine, lineage,
  and `runTransition` from this session are the substrate it builds on.
- Events/announcements rebuilt on Postgres (uses the CMS service) → Session 6.
- Resources + Media (Cloudinary) → Session 7; Developer Console → Session 8;
  full RBAC-gated Admin Panel (UI over the CMS service) → Session 9.
- Owner-owned: rotate/remove the V1 leaked secrets in `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md)).

## Key facts for the next session

- DB is live on Neon with the seeded baseline. `npm test` (static) is always
  green (130 passing); `RUN_DB_TESTS=1 dotenv -e .env.local -- npm test` adds the
  live smoke + CMS (8) + year-engine (6) live tests. The remote Neon compute has
  high per-round-trip latency **and auto-suspends**, so live tests are slow
  (minutes) and occasionally hit a transient "Can't reach database server" on a
  cold compute — re-run once if so (not a logic failure).
- Import `prisma` from `lib/prisma.mjs` for all app DB access — it is the
  audit-extended client, so mutations are audited automatically. Use `prismaBase`
  only to bypass audit (audit reader, repair scripts, test cleanup / fixtures).
- **Mutation entrypoints:** the CMS service (`lib/cms/content.mjs`) for content;
  the year engine (`lib/year/*`) for years/transitions/locks. Both use the shared
  `auditedMutation` (`lib/cms/audited-mutation.mjs`). Route handlers (Session 9)
  call `requirePermission` then the service; year mutations gate on `year.*`.
- **Public read paths:** `lib/cms/visibility.mjs` (current year) and
  `lib/year/public.mjs` (any selectable year). `resolveCurrentYear` is canonical
  in `lib/year/context.mjs`.
- The **Transition Wizard** (`lib/year/transition.mjs#runTransition`) is the
  forward-copy primitive Session 5 will lean on once real org units exist; it
  reuses `org_unit_lineage` and is idempotent/resumable.
- Raw-SQL objects live in the init migration's tail and are invisible to Prisma —
  never `prisma db pull` / `migrate reset`. **No new migration was needed this
  session** (the year engine uses the Session-2 schema as-is).

## Next action

See [NEXT_TASK.md](NEXT_TASK.md).
