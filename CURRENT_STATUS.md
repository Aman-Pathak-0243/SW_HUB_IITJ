# Current Status

**Last updated:** 2026-06-29
**Session:** 6 of 10 — **COMPLETE** (Events + Announcements)
**Next session:** 7 — Resources + Media (Resources PDFs/links via the CMS service; MediaAsset + Cloudinary uploads; Admin Media Migration Tool `/public` → Cloudinary)
**Branch:** `portal-v2`

> New session? Read [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md) first,
> then this file, [NEXT_TASK.md](NEXT_TASK.md), [TODO.md](TODO.md),
> [KNOWN_ISSUES.md](KNOWN_ISSUES.md), [docs/CHANGELOG.md](docs/CHANGELOG.md).

## What is done (Session 6)

- **Events + Announcements on Postgres** ([lib/events/public.mjs](lib/events/public.mjs),
  [lib/events/data.mjs](lib/events/data.mjs), [lib/events/import.mjs](lib/events/import.mjs))
  — both are year-scoped CMS content (`content_type='event'`/`'announcement'`)
  driven entirely through the Session-3 CMS service (no new mutation/audit/
  visibility code; DL-037). The read layer adds the pure `splitEventsByDate`
  (upcoming/past), pinned-first announcements (DL-010), archive readers (DL-032)
  and by-slug readers, and resolves the revision title + cover URL in two batched
  queries (no N+1). Publish windows are honored by the DB CHECKs → `PUBLISH_WINDOW`.
- **3 backed-up Mongo events migrated** — idempotent importer (`npm run db:import:events`)
  stands up `content_item + content_revision + event_payload` for a year, published;
  re-runs create 0; a partial run resumes (a never-archived stranded draft is
  re-published). base64/URL images become `media_asset` inventory rows, never inline
  blobs (DL-039, KNOWN_ISSUES #5); the 3 real events have empty images.
- **V1 Mongo events API replaced** ([app/api/events/route.js](app/api/events/route.js))
  — CMS-backed: public `GET` (published, current-year, in-window, public-audience),
  and a gated `POST` (authenticate → authorize `content.create` scoped to the
  current year → validate → reject inline base64 → `createDraft`+publish, with
  orphan-media cleanup on failure). Mongoose retired from the request path.
- **Public audience gating (DL-040)** — anonymous reads return only
  `audience='public'` via the pure `filterByAudience`; a widened `audiences` set is
  the seam for a future role-aware view (closes a disclosure path the review found).
- **Data-driven pages** — [/events](app/events/page.jsx) (upcoming + past),
  [/past-events](app/past-events/page.js) (**fixes #3**: now a Server Component +
  tested `splitEventsByDate`, not the broken `data.success`/`data.events` client
  fetch), [/announcements](app/announcements/page.js) (pinned-first). New
  `EventsBoard` (reuses `EventCard`, allowlists cover-image hosts so an off-host URL
  can't crash the render) + `AnnouncementCard`; all `force-dynamic`, mobile-first
  responsive, graceful DB-down fallbacks. The V1 `/admin` event form now posts an
  image URL (not base64) + audience and surfaces friendly errors.
- **`queries` collection** — the lone backed-up doc is junk test data with no V1
  consumer → **not migrated** (retained in the backup); no `contact_message` module
  built (DL-038). Closes KNOWN_ISSUES #20.
- **Concurrency / load** — event writes are DB-serialized by the unique/partial
  uniques (simultaneous same-slug creates → exactly one wins, rest get a friendly
  409; concurrent publishes → `ONE_PUBLISHED`); reads are stateless over the pooled
  Neon connection. Proven by a live concurrency test.
- **Tests** — **171 static** (was 152; `events.test.mjs`) + **10 live-DB**
  (`events.db.test.mjs`, self-healing throwaway 2087-88 year): window
  visible/expire/open, `PUBLISH_WINDOW` (event + announcement), past/upcoming split,
  pinned-first, importer idempotency, audience gating, media inventory (URL + base64
  placeholder), partial-run resume, archive-vs-live window + by-slug, and concurrent
  same-slug creation. All prior live suites still green. **No new migration** (Session-2
  schema already modeled events/announcements). `next build` compiles cleanly.
- **Adversarial review** — 64-agent, 8-lens workflow with per-finding 2-verifier
  verification: 23 confirmed → **12 fixed, 1 accepted** (importer can't distinguish a
  deliberately-unpublished draft from an interrupted one).

## What is done (Session 5)

- **Org-unit service** ([lib/org/units.mjs](lib/org/units.mjs)) — create / edit /
  publish / archive year-scoped `org_unit` rows; a NEW `org_unit_lineage` is minted
  only for a genuinely new logical unit (never a bare uuid — DL-007). Honors
  `org_unit_hierarchy_guard` + `lock_guard` (friendly `ORG_HIERARCHY` / `YEAR_LOCKED`);
  keeps `status`↔`archivedAt` consistent; gates on `org_unit.*`; one semantic audit row.
- **Person directory** ([lib/org/people.mjs](lib/org/people.mjs)) — `upsertPerson`
  keyed by cleaned full name (case-insensitive), idempotent; V1 role mailboxes are
  NOT migrated to the UNIQUE `person.email` (DL-034); authorizes at the appointment's
  RBAC scope. **Appointment service** ([lib/org/appointments.mjs](lib/org/appointments.mjs))
  — create / edit / publish / archive; derives year FROM the unit (composite FK),
  leaves `org_unit_type_id` NULL for `appointment_type_guard` to auto-fill + set
  `is_singleton`, honors both cardinality guards (friendly `APPOINTMENT_TYPE` /
  `APPOINTMENT_CARDINALITY` / `APPOINTMENT_DUPLICATE`).
- **V1 dataset + importer** ([lib/org/data/*](lib/org/data/index.mjs),
  [lib/org/import.mjs](lib/org/import.mjs)) — 4 councils, **30 clubs**, 6 hostels,
  5 messes + the 17-member mess committee, with a pure `buildImportPlan()`. The
  idempotent importer (`npm run db:import:org`) stands up units + bound `*_profile`
  content (via the CMS service) + people + appointments for a year; re-runs create 0;
  a partial run is resumable (found-but-draft entities are re-published). V1 images
  become lightweight `media_asset` inventory rows (Cloudinary URLs / `/public` paths
  kept for Session 7). The Academic council lead is now **"Technical Secretary"**.
- **Public org pages** ([lib/org/public.mjs](lib/org/public.mjs),
  [app/components/OrgUnitPage.jsx](app/components/OrgUnitPage.jsx), `app/org/[type]/...`)
  — ONE data-driven `<OrgUnitPage>` renders any council/club/hostel/mess from the
  published unit + profile + roster, **replacing the 4 duplicated V1 Clubs pages**
  (KNOWN_ISSUES #13). Per-unit reads run concurrently; routes are `force-dynamic`.
- **Schema fix** — forward migration `20260628130000_fix_appointment_singleton_guard`
  (`appointment_type_guard` set `is_singleton` to NULL for unlimited positions;
  `COALESCE`-fixed; applied to Neon via `prisma migrate deploy` — DL-027/DL-036).
  Found by the live test; latent since Session 2.
- **Tests** — **152 static** (was 130): `org.test.mjs` (pure helpers + import-plan
  integrity). Plus **4 live-DB** (`org.db.test.mjs`): org-unit + hierarchy guard,
  appointment type/cardinality guards, idempotent importer, public org read. All
  Session-3/4 live tests still green.
- **Adversarial review** — 25-agent, 6-lens workflow with per-finding verification:
  15 confirmed → **13 fixed, 2 accepted** (public phone withheld as PII;
  case-insensitive dedup over a fuzzy merge).

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

- **Run the full live org import** into 2025-26: `npm run db:import:org` (idempotent,
  ~15 min on Neon — an OPERATOR step like `db:seed`, KNOWN_ISSUES #27). The importer
  is tested end-to-end; it just hasn't been run against the real current year here.
- Run the live events migration into 2025-26: `npm run db:import:events` (idempotent,
  ~1 min; an operator step like `db:seed`/`db:import:org`). The 3 events are tested
  end-to-end; they just haven't been imported into the real current year here.
- Resources + Media (Cloudinary) → **Session 7 (next)**; Developer Console → Session 8;
  full RBAC-gated Admin Panel (UI over the CMS/org/events services) → Session 9.
- Cover-image hosts for events: only Cloudinary/Unsplash are allowlisted in
  `next.config.mjs`; the Session-7 media work broadens this for curated covers.
- Owner-owned: rotate/remove the V1 leaked secrets in `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md)).

## Key facts for the next session

- DB is live on Neon with the seeded baseline. `npm test` (static) is always
  green (**171 passing**); `RUN_DB_TESTS=1 dotenv -e .env.local -- npm test` adds the
  live smoke + CMS (8) + year-engine (6) + org (4) + events (10) live tests. The remote Neon
  compute has high per-round-trip latency **and auto-suspends**, so live tests are
  slow (minutes) and occasionally hit a transient "Can't reach database server" on a
  cold compute — re-run once if so (not a logic failure). The org live suite is the
  slowest (the importer makes many sequential audited tx round-trips).
- Import `prisma` from `lib/prisma.mjs` for all app DB access — it is the
  audit-extended client, so mutations are audited automatically. Use `prismaBase`
  only to bypass audit (audit reader, repair scripts, test cleanup / fixtures, the
  importer's media-inventory rows).
- **Mutation entrypoints:** the CMS service (`lib/cms/content.mjs`) for content;
  the year engine (`lib/year/*`) for years/transitions/locks; the **org services
  (`lib/org/{units,people,appointments}.mjs`)** for structure/roster; the
  **importer (`lib/org/import.mjs`)** for the V1 migration. All use the shared
  `auditedMutation`. Route handlers (Session 9) call `requirePermission` then the
  service; org mutations gate on `org_unit.*` / `appointment.*`.
- **Public read paths:** `lib/cms/visibility.mjs` (current-year content),
  `lib/year/public.mjs` (any selectable year's content), **`lib/org/public.mjs`
  (org units + profiles + rosters)**, and **`lib/events/public.mjs`
  (events + announcements: current-year, archive, by-slug; pure `splitEventsByDate`
  + `filterByAudience`)**. `resolveCurrentYear` is canonical in
  `lib/year/context.mjs`. Data-driven pages: `app/org/[type]/...`, `app/events`,
  `app/past-events`, `app/announcements`. Events/announcements are CMS content, so
  their MUTATIONS go through `lib/cms/content.mjs` directly (no separate service);
  `lib/events/import.mjs` is the V1 events migration (`npm run db:import:events`).
- The **Transition Wizard** (`lib/year/transition.mjs#runTransition`) carries the
  Session-5 org units + appointments forward into a new year (reusing lineage,
  idempotent/resumable) — no per-session re-migration needed.
- Raw-SQL objects live in migrations and are invisible to Prisma — never
  `prisma db pull` / `migrate reset`. **Session 5 added ONE forward migration**
  (`20260628130000_fix_appointment_singleton_guard`, a `CREATE OR REPLACE`); add
  future raw-SQL fixes the same way (DL-027/DL-036), never by rewriting the init.

## Next action

See [NEXT_TASK.md](NEXT_TASK.md).
