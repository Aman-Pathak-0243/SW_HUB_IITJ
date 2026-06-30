# Changelog

All notable changes to this project are recorded here. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/). Dates are YYYY-MM-DD.

A new entry is added after **every completed milestone** (per the documentation
update protocol in [README.md](README.md)).

---

## [Unreleased]

### Added
- `/docs` documentation set describing the **as-is** system (architecture, data
  inventory, API, database, auth, components, styling, security, deployment) and
  the **proposed V2** design (PRD, target architecture, migration, backup,
  testing, performance, responsive), plus guides and an ADR log.
- Root tracking files: `CURRENT_STATUS.md`, `NEXT_TASK.md`, `TODO.md`,
  `KNOWN_ISSUES.md`, `PROGRESS.md`.
- `docs/MILESTONE_PLAN.md` — the V2.0 roadmap.

### Notes
- **No production code was changed** in the analysis phase (analysis + docs only).
- Critical finding logged: secrets are committed in `README.md` and must be
  rotated/removed (see `docs/SECURITY.md`).

### Added/Changed — Session 11: Member Platform M0 (auth & account lifecycle) + the PLUGIN · 2026-06-30
- **Member-platform PLUGIN (DL-058)** — `feature_flag` table + `lib/platform/flags.mjs`.
  The whole Session 11+ program is gated behind the developer-toggled `member_platform`
  flag (`/admin/plugins`; off by default). `isFeatureEnabled` is an ungated, cached,
  fail-closed read with an `onError` knob (allow/deny callers fail toward deny);
  `setFeatureFlag` is developer-only + audited. Seeded via `PLUGIN_DEFS` (re-seed
  preserves `enabled`).
- **Auth pivot (DL-059)** — email+password only within the plugin (Google rejected at
  the `signIn` callback when on, kept when off; provider conditional on
  `GOOGLE_CLIENT_ID`). `app_user.must_change_password` (+ `password_set_at`) + the edge
  `middleware.js` + the pure `lib/auth/must-change.mjs` force a first-login change; the
  JWT carries the flag (refreshed on `session.update()`).
- **Account lifecycle (DL-061)** — `lib/users/admin.mjs`: `createUser` (initial password
  ⇒ must-change), `parseUserCsv`/`importUsersCsv` (bulk CSV, skip-existing),
  `forcePasswordReset` (temp password shown once), `changeOwnPassword` (self, verifies
  current), `deleteUser` (hard delete) — all with DL-049 escalation parity (no
  self-delete; only a developer may delete/reset a developer). One client+server
  password policy (`lib/auth/password-policy.mjs`); server-only CSPRNG generator
  (`lib/auth/password-generator.mjs`); new `user.delete` permission.
- **Request queue (DL-060)** — `notification` table + `lib/notifications/service.mjs`:
  public account-creation + forgot-password forms (human ref ids from a DB sequence,
  race-free dedup via a partial-unique backstop, no account-existence leak); admin/dev
  Password Management (`/admin/requests`) take/assign (audited) + fulfil
  (`lib/auth/password-reset.mjs`) / dismiss; `notification.{read,assign,resolve}`.
- **Surfaces** — `/login`, `/account/{request,forgot,password}`, gated
  `POST /api/account/{request,forgot,password}` (CSRF + plugin + rate-limit via the
  reused `lib/http/guard.mjs`), `/admin/plugins`, `/admin/requests`, the credentials
  admin sign-in, and the extended Users tab (bulk import / delete / reset).
- **Migrations** — `20260630120000_member_platform_m0` (columns + 2 tables + sequence +
  status CHECK) and `20260630121000_notification_dedup_uq` (partial unique), both
  applied; init untouched (DL-027). `FeatureFlag`/`Notification` added to
  `AUTO_AUDIT_SKIP` (semantic audit only).
- **Tests** — 346 static (+ M0 pure suites) + 8 live (`m0.db.test.mjs`); all prior live
  suites green; `next build` + ESLint clean.
- **Adversarial review** — 6-dimension, 2-verifier workflow (12 agents): 3 confirmed
  (0 refuted) → all fixed + re-verified (CRITICAL developer-password-reset takeover;
  notification dedup race; Google-reject fail-open).

### Added — Milestone 0.5 (Security scanning) · 2026-06-28
- `.github/workflows/secret-scan.yml` — gitleaks CI on push/PR (full-history scan).
- `.gitleaks.toml` — gitleaks config (default ruleset + tight allowlist).
- `docs/runbooks/git-history-purge.md` — secret rotation + history-purge runbook.
- **Note:** removing the leaked secrets from `README.md` and rotating the keys is
  owned by the project owner (per decision); `README.md` was left untouched.

### Added — Milestone 1 (Pre-migration backup) · 2026-06-28
- `scripts/backup.sh` — reusable, verifying backup tool (public bytes +
  source content + manifests + checksums → zip → re-extract & verify).
- `scripts/export-events.mjs` — read-only MongoDB `events` export (needs
  `MONGODB_URI`) feeding the backup.
- `backups/.gitignore` — keeps backup artifacts out of git.
- Produced and **verified** the first backup
  (`backups/backup-<ts>-1c88312.zip`, 105 public files / ~77 MB, VERIFY: PASS).
- `scripts/backup-mongo.mjs` — full read-only Mongo dump (Extended JSON). Captured
  the live `test.events` (3 docs) **and** a previously-undocumented `test.queries`
  (1 doc) collection; folded both into a fresh DB-inclusive verified backup.
- **M1 complete.**

### Added/Changed — Session 1 close: Database pivot + Architecture · 2026-06-28
- **Database pivot:** V2 moves from MongoDB/Mongoose to **PostgreSQL (Neon) +
  Prisma**. Neon `DATABASE_URL` stored in git-ignored `.env.local`; `env.example`
  updated with `DATABASE_URL`/`DIRECT_URL` placeholders.
- **Verified schema design** (multi-agent workflow: 3 designs → synthesize → 4
  adversarial reviewers → finalize): `docs/SCHEMA_DESIGN.md` — 33 normalized
  tables, 15 enums, ER diagram, feature-coverage matrix for all 9 capabilities,
  and Prisma/Neon implementation notes. **No Prisma migrations yet** (Session 2).
- `docs/DATA_MIGRATION_REPORT.md` — V1→V2 item map (CMS-managed / DB-managed /
  static / retired).
- `docs/DECISION_LOG.md` — detailed decision log (16 records).
- `docs/SESSION_PROTOCOL.md` — 10-session model + start/end-of-session checklists.
- `docs/MILESTONE_PLAN.md` restructured around the 10 sessions (living doc).
- Updated TARGET_ARCHITECTURE, DATABASE_DESIGN, MIGRATION_PLAN,
  AUTHENTICATION_AND_RBAC, PROJECT_OVERVIEW, DEVELOPER_GUIDE, README,
  ARCHITECTURAL_DECISIONS (ADR-0006 Postgres/Prisma, ADR-0007 session model).

### Added/Changed — Session 2: Database + Prisma + RBAC + Authentication · 2026-06-28

- **Prisma + Postgres stood up.** Added `prisma@6`, `@prisma/client`,
  `@next-auth/prisma-adapter`, `@node-rs/argon2`; dev deps `vitest`, `dotenv-cli`.
  `.env.local` gains `DIRECT_URL` (unpooled) and `pgbouncer=true` on the pooled
  `DATABASE_URL`; `env.example` updated. `package.json` gains `test` + `db:*`
  scripts and the Prisma `seed` config.
- **`prisma/schema.prisma`** — all 33 tables + 14 Prisma enums from
  `SCHEMA_DESIGN.md`: snake_case `@@map`, `gen_random_uuid()` defaults, citext/
  inet/time/jsonb types, the composite FK `appointment(org_unit_id,
  academic_year_id) → org_unit(id, academic_year_id)`, plain-scalar revision
  pointers (no circular FK), and the full enumerated back-relation graph.
  NextAuth canonical `User`/`Account`/`VerificationToken` models mapped to
  `app_user`/`auth_account`/`verification_token`.
- **First migration applied to Neon** — one hand-assembled init migration:
  Prisma base DDL + a raw-SQL tail (CREATE EXTENSION citext; partial/expression/
  `NULLS NOT DISTINCT` unique indexes; GIN/BRIN; CHECK constraints; and **6
  trigger functions** — lock_guard, org_unit_hierarchy_guard,
  appointment_type_guard, appointment_cardinality_guard (deferred),
  content_item_pointer_guard, person_email_link_guard). `migrate status` clean.
- **Seed** (`prisma/seed.mjs`, idempotent) — current `academic_year` 2025-26;
  40-permission catalog; 5 roles (developer `grants_all`, super_admin, +3
  operational) + role_permission; 6 org_unit_types + 6 allowed-child edges; 16
  positions; 10 content_type_def rows; bootstrap developer + the two former V1
  admin emails as super_admins.
- **Authentication** — NextAuth v4 + PrismaAdapter; Google OAuth +
  email/password (argon2id); one account per email (account linking); JWT
  sessions; suspended/disabled accounts blocked at sign-in and at protected
  routes. The **V1 hardcoded `ADMIN_EMAILS` allowlist is removed**.
- **RBAC** — one server-side authorization utility (`lib/rbac/authorize.mjs` +
  `lib/auth/session.mjs`): permission union + grants_all/is_developer
  short-circuit, year/org-lineage scope, live (per-request) revocation.
  `POST /api/events` is now permission-gated.
- **Tests** — 50 passing across 6 Vitest files (password/argon2, credentials
  authorize, RBAC resolution + catalog, content-type registry, schema+migration
  structure, and a live Neon DB smoke incl. behavioral trigger tests).
- **Adversarial review** — a 16-agent review workflow checked schema fidelity,
  raw-SQL, auth, RBAC, seed, and task completeness; all confirmed critical/major
  findings were fixed (singleton partial unique + `is_singleton`, org-hierarchy
  guard, OAuth status gate, Google `name` coalesce, events-API gating, seed
  robustness) and re-verified.
- **Docs** — `DECISION_LOG.md` DL-017..DL-027; `SCHEMA_DESIGN.md` Session-2
  implementation addenda; `DEVELOPER_GUIDE.md` DB/test workflow; `Token_Usage.md`
  Session-2 row; `KNOWN_ISSUES.md` (#2/#8 closed, new items noted).
- **KNOWN_ISSUES closed:** #8 (hardcoded email allowlist) and #2 (unauthenticated
  `POST /api/events`).

### Added/Changed — Session 3: CMS Foundation · 2026-06-28

- **Central audit-write choke point** (DL-012/DL-025/DL-028) — `lib/cms/audit.mjs`
  + `lib/cms/audit-context.mjs`, mounted in `lib/prisma.mjs` via `prisma =
  base.$extends(buildAuditExtension(base))`. Two paths: an **auto** query
  extension that audits every mutating op on audited models (recursion-safe via
  the un-extended `base` client; best-effort, never blocks the mutation), and a
  **semantic** path the CMS service uses (one `audit_log` row per business action
  — create/publish/unpublish/archive/restore — written after commit, with
  auto-audit suppressed inside the transaction via an `AsyncLocalStorage` actor
  context). `prismaBase` exported for the rare audit-bypass caller. KNOWN_ISSUES
  #21 closed.
- **Content lifecycle service** — `lib/cms/content.mjs`: `createDraft`,
  `editDraft` (edits the open draft in place, or auto-opens one from the
  published/latest revision), `publish` (supersedes prior published → marks
  draft published → repoints `published_revision_id`), `unpublish`, `archive`
  (soft-delete), and `restore` (overwrites the open draft in place, recording
  `is_restore_of_revision_id`; honors the one-open-draft partial unique). Every
  mutating op reuses the Session-2 RBAC util (`assertPermission`) against the
  item's (year, org-lineage) scope and authorizes before any state check.
- **Version history** — `listRevisions`, `getRevision` (spine + typed payload),
  `diffRevisions` / pure exported `diffRevisionViews` (field-level diff; lists &
  JSONB compared by value, Dates by ISO). Monotonic `revision_no`.
- **Generic schema-driven editing layer** — `lib/cms/content-types.mjs` extended
  with data-driven payload handlers (`writePayload`/`readPayload`/`copyPayload`,
  scalar fields + normalized list children + required-field validation) routed by
  `content_type`. The "every content_type_def has a handler" guarantee is kept.
- **Public visibility rule** — `lib/cms/visibility.mjs`: `published AND
  current-year AND not-archived AND has-published-revision`, plus event/
  announcement `publish_from`/`publish_until` windows; `listPublicContent` /
  `getPublicItemBySlug` / pure `isPubliclyVisible` + `isWithinPublishWindow`.
- **Friendly DB-guard errors** — `lib/cms/errors.mjs`: `CmsError` family +
  `mapDbError` translating trigger/partial-unique/CHECK/Prisma violations
  (`YEAR_LOCKED`, `ONE_DRAFT`/`ONE_PUBLISHED`, `SLUG_TAKEN`, `PUBLISH_WINDOW`, …)
  into HTTP-shaped errors. App code honors the DB guards, never re-implements them
  (DL-029).
- **Tests** — 101 static (was 50): new `cms-errors`, `cms-audit`,
  `cms-content-types`, `cms-visibility`, `cms-diff` (DB-free, default-green) +
  `cms.db.test.mjs` (8 live-DB tests, `RUN_DB_TESTS=1`): full lifecycle, one-draft/
  one-published enforcement, restore (+ provenance + audit), audit-coverage,
  public visibility/windows, friendly errors, unpublish→republish ordering, and a
  locked-year test that provokes the real `lock_guard` trigger → `YEAR_LOCKED`.
- **Adversarial review** — a 30-agent, 5-lens review workflow (correctness,
  db-fidelity, audit/RBAC, tests, simplify) with per-finding verification; 24
  confirmed findings (1 major + minor/nit) all addressed: the required-field 500
  bug, diff JSONB reference-equality, authorize-before-state-disclosure ordering,
  unmapped CHECK violations, upsert-as-create derivation, and the cited
  coverage/clarity gaps.
- **Docs** — `DECISION_LOG.md` DL-028..DL-030; `KNOWN_ISSUES.md` #21 closed,
  #24/#25 added; `DEVELOPER_GUIDE.md` CMS section; `Token_Usage.md` Session-3 row.

### Added/Changed — Session 4: Academic Year Engine · 2026-06-28

- **Year context** (`lib/year/context.mjs`) — the canonical home for current-year
  resolution (`resolveCurrentYear` / `getCurrentYearId` / `requireCurrentYear`;
  `lib/cms/visibility.mjs` now re-exports it). Plus `listYears` (optional per-year
  counts), `getYear` / `getYearByLabel`, `createYear`, and `setCurrentYear`
  (demote-then-promote in ONE transaction so the `academic_year_one_current_uq`
  partial unique never sees two current years). Mutations gate on `year.*` via
  `assertActorPermission` and write exactly one semantic `audit_log` row.
- **Cross-year history** (`lib/year/history.mjs`) — `listContentForYear` /
  `listOrgUnitsForYear` / `listAppointmentsForYear` (filter by `academic_year_id`)
  and `followLineage` / `getUnitHistory` (track a logical unit across years via the
  real `org_unit_lineage` FK). Read-only; locked past years stay browsable.
- **Transition Wizard** (`lib/year/transition.mjs`) — `runTransition` copies a
  source year's STRUCTURE forward as new `org_unit` rows **reusing their
  `org_unit_lineage`** (DL-007), remapping `parent_id` within the target year;
  options `copy_appointments` / `copy_content` (clone the latest revision as a
  target-year **draft**) / `copy_role_assignments` (defaults per DL-026). Records a
  `transition_run` (status + per-entity `counts`), honors the `source<>target`
  CHECK and the one-completed-per-pair partial unique, and is **idempotent /
  resumable**: each phase skips rows already in the target, a partial/crashed run
  self-heals on resume (parent reconciliation over all units; per-content-item
  `$transaction`), a plain re-run is a no-op, and `{force:true}` re-syncs into the
  SAME completed run (never a second 'completed'; prior provenance restored on
  failure). Performed as idempotent statements with auto-audit SUPPRESSED, then one
  `action='transition'` row (DL-031).
- **Lock / unlock** (`lib/year/lock.mjs`) — `lockYear` / `unlockYear` flip
  `academic_year.status`; the current year cannot be locked; blocked writes surface
  the friendly `YEAR_LOCKED` error (real `lock_guard` trigger, DL-029).
- **Public year selector** (`lib/year/public.mjs`) — `listSelectableYears`,
  `listPublicContentForYear`, `getPublicItemBySlugForYear`, `getPublicYearArchive`:
  a chosen past year's published content under the visibility rule, with the live
  publish window enforced only for the current year (archive shows all; DL-032).
- **Shared helpers** — `auditedMutation` + the Neon-safe `TX_OPTS` promoted to
  `lib/cms/audited-mutation.mjs` (used by both the CMS service and the year engine;
  DL-033); the public fetch-then-window loop shared via
  `loadPublicItems`/`loadPublicItem` in `lib/cms/visibility.mjs`.
- **Friendly errors** — `lib/cms/errors.mjs#mapDbError` extended with the
  year/transition guard signatures (`CURRENT_YEAR_CONFLICT`, `TRANSITION_EXISTS`,
  `TRANSITION_SELF`, `ONE_UNIT_PER_YEAR`, `INVALID_YEAR_LABEL`/`DATES`/`PROVENANCE`,
  `YEAR_LABEL_TAKEN`); `YEAR_LOCKED` already present.
- **Tests** — **130 static** (was 101): `year.test.mjs` (lock precondition,
  snapshot, the new mapDbError signatures) + `year-transition.test.mjs` (pure
  planning helpers: partition/lineage-index/parent-remap/revision-pick). Plus
  **6 live-DB** (`year.db.test.mjs`, `RUN_DB_TESTS=1`): current-year resolution +
  set-current, history + lineage follow, structure-only transition (lineage reuse,
  parent remap, **auto-audit-suppression asserted**), structure+appointments+content,
  full + role-assignment copy with idempotent re-run AND forced re-sync, and
  lock/unlock (real trigger → `YEAR_LOCKED`). All 8 Session-3 CMS live tests remain
  green after the shared-helper refactor. **No new migration** (Session-2 schema as-is).
- **Adversarial review** — a 24-agent, 6-lens workflow (correctness, db-fidelity,
  audit/RBAC, transition-idempotence, tests, simplify) with per-finding
  verification; 18 confirmed findings → **16 fixed** (resumable parent wiring,
  atomic per-item content clone, singleton-slot pre-skip, force-failure provenance,
  shared-helper extraction, audit-leak-free test cleanup, suppression + force-resync
  + role-copy test coverage) and **2 nits accepted** (defensive not-found branch;
  copy-phase map asymmetry).
- **Docs** — `DECISION_LOG.md` DL-031..DL-033; `KNOWN_ISSUES.md` #26 added;
  `DEVELOPER_GUIDE.md` year-engine section; `Token_Usage.md` Session-4 row.

---

### Added/Changed — Session 5: Organization Model · 2026-06-28

- **Org-unit service** (`lib/org/units.mjs`) — `createOrgUnit` / `editOrgUnit` /
  `publishOrgUnit` / `archiveOrgUnit` over the year-scoped, self-referential
  `org_unit`. Creating a unit mints a NEW `org_unit_lineage` only for a genuinely
  new logical unit (never a bare uuid — DL-007); pass an existing `lineageKey` to
  add a per-year instance. Honors (never re-implements) `org_unit_hierarchy_guard`
  (same-year parent + allowed child type) and `lock_guard`; rejections surface as
  friendly `ORG_HIERARCHY` / `YEAR_LOCKED`. `editOrgUnit` keeps `status`↔`archivedAt`
  consistent. Gates on `org_unit.*`, one semantic audit row per op.
- **Person directory** (`lib/org/people.mjs`) — `upsertPerson` keyed by cleaned
  full name, **case-insensitively**; idempotent; `personType` set once. V1 role
  mailboxes are NOT migrated to the UNIQUE `person.email` (DL-034) and any email
  that would collide with another person is dropped. Authorizes at the **same RBAC
  scope** as the appointment it serves (so a unit/year-scoped manager is not
  locked out). `person_email_link_guard` honored trivially (no app_user links).
- **Appointment (roster) service** (`lib/org/appointments.mjs`) — `createAppointment`
  / `editAppointment` / `publishAppointment` / `archiveAppointment`. Derives
  `academic_year_id` FROM the unit (composite-FK agreement), leaves
  `org_unit_type_id` NULL for `appointment_type_guard` to auto-fill + set
  `is_singleton`, and honors both cardinality guards (singleton partial unique +
  deferred count trigger) → friendly `APPOINTMENT_TYPE` / `APPOINTMENT_CARDINALITY`
  / `APPOINTMENT_DUPLICATE`.
- **V1 dataset** (`lib/org/data/*`) — the 4 councils, **30 clubs** (6+5+8+11),
  6 hostels, 5 messes + the 17-member campus mess committee, extracted verbatim
  from the four V1 Clubs pages + `hostels`/`messes` pages, plus a PURE
  `buildImportPlan()` (slugs, seeded position keys, parsed mission lists / meal
  timings / capacities). The Academic council student lead is titled **"Technical
  Secretary"** (intended V2 rename). `lib/org/normalize.mjs` holds the pure
  helpers (slugify, clock/range/capacity parsing, `@db.Time` conversion,
  honorific-aware person typing, dedup keys).
- **Idempotent importer** (`lib/org/import.mjs`, run via `npm run db:import:org`)
  — stands up every unit + bound `*_profile` content_item (through the CMS
  service) + people + appointments for a year (current by default). Idempotent by
  natural key (unit by year+slug, content by type+year+unit, appointment by
  year+unit+position+person, person by name, media by url/path); re-runs create 0
  and a partial run is **resumable** (a found-but-draft unit/profile/appointment is
  re-published). V1 image refs become lightweight `media_asset` inventory rows
  (external Cloudinary URLs / `/public` paths kept for the Session-7 migration),
  written on the audit-bypassing base client.
- **Public org pages** (`lib/org/public.mjs` + `app/components/OrgUnitPage.jsx` +
  `app/org/[type]/[slug]` + `app/org/[type]`) — ONE data-driven `<OrgUnitPage>`
  renders any council/club/hostel/mess from the published unit + its bound profile
  + roster, replacing the four near-identical V1 Clubs pages (**KNOWN_ISSUES #13**).
  The public rule (status=published AND current/selected year AND not-archived)
  applies to BOTH the unit and its profile content; per-unit reads run concurrently
  (Neon latency). Routes are `force-dynamic` and degrade gracefully when the DB is
  unavailable.
- **Schema fix (forward migration)** — `20260628130000_fix_appointment_singleton_guard`:
  `appointment_type_guard` set `is_singleton := (max_holders = 1)`, which is **NULL**
  for unlimited positions → violated the NOT NULL column. Latent until Session 5
  created the first multi-holder appointment (the live test caught it). Fixed with
  `COALESCE(max_holders = 1, false)` (`CREATE OR REPLACE`, idempotent; trigger
  untouched). Applied to Neon via `prisma migrate deploy` (DL-027).
- **Tests** — **152 static** (was 130): `org.test.mjs` (normalize helpers + the
  import-plan integrity: 30 clubs, unique slugs, seeded positions, parsed timings,
  Technical-Secretary rename, one singleton mess secretary). Plus **4 live-DB**
  (`org.db.test.mjs`, `RUN_DB_TESTS=1`): org-unit create + hierarchy-guard
  rejection, appointment type + cardinality guards (singleton vs multi-holder), an
  idempotent importer (a tiny plan; second run creates 0), and a public org read
  (profile + roster + child clubs + mess meal-timings round-trip). Friendly-error
  matchers added: `SLUG_TAKEN` (org_unit) + `APPOINTMENT_DUPLICATE`.
- **Adversarial review** — a 25-agent, 6-lens workflow (guard-honoring,
  idempotency/migration, RBAC/audit, data fidelity, public pages, correctness) with
  per-finding verification; 19 findings → 15 confirmed, **13 fixed** (resumable
  profile re-publish, scoped person auth, two same-person name canonicalizations,
  org-unit slug + duplicate-appointment error mapping, status/archivedAt sync,
  concurrent public reads, DB-down vs not-published page state, cached-media count,
  Sports-secretary photo) and **2 accepted** (public phone numbers withheld as PII;
  case-insensitive dedup chosen over a fuzzy/middle-name merge).
- **Docs** — `DECISION_LOG.md` DL-034..DL-036; `KNOWN_ISSUES.md` #13 resolved + #27
  (full live import is an operator step); `DEVELOPER_GUIDE.md` org section;
  `Token_Usage.md` Session-5 row.

---

### Added/Changed — Session 6: Events + Announcements · 2026-06-29

- **Events + Announcements on Postgres via the CMS service (DL-037)** — both are
  year-scoped CMS content (`content_type='event'` / `'announcement'`) driven
  entirely through the Session-3 service (`lib/cms/content.mjs`) — no new
  mutation/audit/visibility pipeline. A thin domain layer
  (`lib/events/public.mjs`) shapes the public records and adds the pure
  `splitEventsByDate` (upcoming/past) and pinned-first announcement reads
  (DL-010), plus current-year, archive (`listEventsForYear`/`listAnnouncementsForYear`,
  DL-032) and by-slug readers. `publish_from`/`publish_until` windows are honored
  by the existing `event_publish_window_chk` / `announcement_publish_window_chk`
  CHECKs → friendly `PUBLISH_WINDOW` (never re-implemented; DL-029).
- **Idempotent events importer** (`lib/events/import.mjs`, `npm run db:import:events`)
  — migrates the 3 backed-up Mongo `events` docs (`lib/events/data.mjs`, verbatim)
  into `content_item + content_revision + event_payload` for a year (current by
  default), published. Idempotent by `(content_type='event', year, slug)`; re-runs
  create 0; a partial run resumes (a never-archived stranded draft is re-published).
  Mirrors `lib/org/import.mjs`.
- **base64 images → media placeholders, never inline blobs (DL-039, KNOWN_ISSUES #5)**
  — `classifyMedia` now detects `data:` URLs and records a short
  `BASE64_PLACEHOLDER_URL` `media_asset` row (the blob stays in the Session-1
  backup, reconciled by the Session-7 Cloudinary tool). URL/`/public` covers become
  external/local inventory rows. All 3 V1 events have empty images → zero media in
  practice.
- **V1 Mongo events API replaced (DL-037)** — `app/api/events/route.js` is now
  CMS-backed: `GET` reads published, current-year, in-window, public-audience
  events from Postgres (self-describing `{ events }`); `POST` authenticates,
  authorizes `content.create` scoped to the current year, validates input (title,
  audience enum), **rejects inline base64** (422 `UNSUPPORTED_IMAGE`), creates a
  cover `media_asset` via `prismaBase`, then calls `createDraft` (+publish),
  cleaning up an orphaned media row if the CMS write fails. Mongoose is retired
  from the request path. Closes #2/#9/#16 at the API.
- **Public audience gating (DL-040)** — anonymous reads are gated to
  `audience='public'` via the pure, tested `filterByAudience` (default
  `PUBLIC_AUDIENCES`); a widened `audiences` set is the seam for a future
  role-aware view. Fixes an information-disclosure path the review found.
- **Data-driven public pages** — `/events` (upcoming + past), `/past-events`
  (**fixes #3**: the V1 page read `data.success`/`data.events` off a bare array and
  was always empty — now a Server Component + tested `splitEventsByDate`), and
  `/announcements` (pinned-first). New `EventsBoard` (reuses `EventCard`,
  allowlists cover hosts so an off-host URL can't crash the render) +
  `AnnouncementCard`; `EventCard` hardened against undated events. All
  `force-dynamic`, mobile-first responsive, with graceful DB-down fallbacks.
- **V1 admin event form** (`app/admin/page.js`) — base64 file upload replaced by
  an image-URL field + audience selector; surfaces the route's friendly error.
  (Full RBAC-gated admin panel remains Session 9.)
- **`queries` collection disposition (DL-038)** — the lone backed-up doc is junk
  test data with no V1 consumer → **not migrated** (retained in the backup); no
  `contact_message` module built (it would be a standalone table, not CMS content;
  speculative without a real form). Closes #20.
- **Concurrency / load** — event writes are DB-serialized (the
  `content_item_slug_uq` / one-published partial uniques), so simultaneous
  creates/publishes can't corrupt; reads are stateless Server Components over the
  pooled Neon connection. A live test fires 5 concurrent same-slug creates and
  asserts exactly one wins (the rest get a friendly 409).
- **Tests** — **171 static** (was 152): `events.test.mjs` (import plan, the
  `splitEventsByDate` split, base64 classifier, audience gating, event/announcement
  handlers + windowed registry). Plus **10 live-DB** (`events.db.test.mjs`,
  `RUN_DB_TESTS=1`, self-healing throwaway 2087-88 year): publish→visible-in-window
  / expire / future-open, `PUBLISH_WINDOW` (event + announcement), past/upcoming
  split, pinned-first, importer idempotency, audience gating, media inventory
  (URL + base64 placeholder), partial-run resume, archive vs live window (DL-032) +
  by-slug, and concurrent same-slug creation. All prior live suites still green.
  **No new migration** (the schema already modeled events/announcements in Session 2).
- **Adversarial review** — a 64-agent, 8-lens workflow (CMS fidelity, visibility/
  window, importer, API route, pages/UI, tests, RBAC/audit, correctness) with
  per-finding 2-verifier adversarial verification; 28 findings → **23 confirmed →
  12 fixed, 1 accepted** (audience disclosure, orphan-media-on-failure, RBAC empty
  scope, off-host image render-crash, base64-bypass, audience validation, media
  audit attribution, importer archived-resume guard, broken admin form, GET
  logging, archive/by-slug coverage; accepted: importer can't distinguish a
  deliberately-unpublished draft from an interrupted one). The two "undated 1970
  badge" findings were rejected (already guarded).
- **Production build** — `next build` compiles cleanly; `/events`, `/past-events`,
  `/announcements`, `/api/events` are correctly server-rendered-on-demand.
- **Docs** — `DECISION_LOG.md` DL-037..DL-040; `KNOWN_ISSUES.md` #3/#5/#16/#20
  resolved + a new accepted importer-resume edge; `DEVELOPER_GUIDE.md` events
  section; `Token_Usage.md` Session-6 row.

### Added/Changed — Session 7: Resources + Media · 2026-06-29

- **Resources on Postgres via the CMS service (DL-041)** — per-org-unit PDFs / Drive
  links are `content_type='resource'` (org-bound) CMS content driven through the
  Session-3 service (no new pipeline, like events). `lib/resources/public.mjs`
  shapes the public records (`listResourcesForUnit`, `listPublicResourcesByUnit`);
  `lib/org/public.mjs#getPublicOrgUnit` now returns a `resources` array. Each
  resource mints its **own** content lineage (reusing the unit's would trip
  `content_item`'s `UNIQUE(content_type, year, lineage_key)` and cap a unit at one
  resource — caught by the live test).
- **V1 resources dataset + idempotent importer (DL-041)** — `lib/resources/data.mjs`
  lifts the V1 infra PDFs/Drive links (the 3 student-life councils share the Student
  Club Activities PDF; campus-wide Hostel/Mess PDFs bind to the first unit of their
  kind, DL-035). `lib/resources/import.mjs` (`npm run db:import:resources`) is
  idempotent by `(content_type='resource', year, slug)`, resumable (DL-031), and
  SKIPS a resource whose unit is absent (`missingUnit`) — run `db:import:org` first.
- **Data-driven resources view** — new client `ResourcesSection` renders a `pdf`
  resource via `PdfSlideshow` (real pages + Drive "View in Detail") and a link/drive
  resource as a card+button (label driven by the actual destination); rendered by
  the single `<OrgUnitPage>`.
- **Media service (DL-042)** — `lib/media/service.mjs`: curated `media_asset` CRUD
  (`createMediaAsset`/`updateMediaAsset`/`archiveMediaAsset`) through the shared
  `auditedMutation` (one semantic audit row; authorize `media.upload`/`update`/`delete`
  FIRST — before any existence read), reads (`listMediaAssets`/`getMediaAsset` +
  `shapeAsset`), and the bulk audit-bypassing `findOrCreateInventoryAsset` (now the
  ONE inventory writer — the org + events importers were refactored onto it,
  removing two drifted copies; a base64 dedup bug in the org copy is fixed in passing,
  DL-039). `lib/media/cloudinary.mjs`: pure `cloudinaryUrl` / `publicIdFromPath` /
  `signUploadParams` / `resolveDeliveryUrl` (the single delivery-URL resolver — a
  transformed PDF now carries `.pdf` so Cloudinary returns the file) + the one impure,
  injectable `uploadFileToCloudinary`.
- **Admin Media Migration Tool (DL-043)** — `lib/media/migrate.mjs`
  (`npm run db:migrate:media`): idempotent, reversible `/public` → Cloudinary.
  `migratePublicAssets` (DRY-RUN default; `--apply`) uploads `/public` inventory rows
  and repoints them (`cloudinary_public_id`/`url`/`migrated_at`), excluding
  already-migrated rows (re-run → 0). `rollbackMigration` (`--rollback`) restores
  `local` + `url ← original_path` (idempotent). Reconciles the Session-6 base64
  placeholders (DL-039) — reported `base64Pending`, or uploaded via an optional
  `base64Resolver`. Bulk writes use `prismaBase`; one summary audit row per run; a
  `filter` scopes a subset; the Cloudinary uploader is injected (fake in tests).
- **pdfjs version mismatch fixed (#4, DL-044)** — `pdfjs-dist` pinned to exact
  `6.0.227`; `PdfSlideshow` imports the library + worker from the same **legacy**
  build (`pdfjs-dist/legacy/build/pdf.mjs` + `…/pdf.worker.min.mjs`); stale 3.x
  comment rewritten.
- **Image hosts narrowed (#17, DL-045)** — `next.config.mjs` `remotePatterns` and
  `EventsBoard`'s cover allowlist reduced to `res.cloudinary.com` only (the unused
  unsplash hosts removed).
- **Cloudinary env** — `env.example` documents `CLOUDINARY_CLOUD_NAME` /
  `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` / `CLOUDINARY_UPLOAD_FOLDER`.
- **Tests** — **219 static** (was 171): `media.test.mjs` (URL/public-id/signature/
  delivery resolution incl. the PDF-format case, migration-plan classification,
  `shapeAsset`) + `resources.test.mjs` (import-plan integrity, namespaced slugs,
  bindings-match-real-units, public shaping). Plus **6 live-DB** (`RUN_DB_TESTS=1`,
  self-healing throwaway years / marker-scoped rows): `media.db.test.mjs` (migrate
  idempotent + reversible + base64 reconcile; curated CRUD one-audit-row + RBAC 403 +
  migration-owned-field restriction; `media.migrate` 403) and `resources.db.test.mjs`
  (publish→visible + org-view + unpublish/archive hides; importer idempotent +
  `missingUnit`; partial-run resume; shared-file media dedup). All prior live suites
  still green; `next build` clean. **No new migration** (Session-2 schema already
  modeled `resource_payload` / `media_asset`).
- **Adversarial review** — a 10-lens workflow (correctness, idempotency/
  reversibility, RBAC/audit, data-model/guards, public-visibility, Cloudinary/URL,
  Next.js/SSR, test-coverage, reuse, docs-consistency) with per-finding 2-verifier
  adversarial verification; **14 confirmed → all addressed** (PDF transformed-URL
  `.pdf` format, org/events importer dedup unification + base64 fix, `base64Pending`
  count, media auth-before-disclosure, `listPublicResourcesByUnit` unit-visibility
  gate, `ResourceCard` label, resolveDeliveryUrl dead-ternary, + new resume / media-
  dedup / curated-service / `shapeAsset` tests and scoped test audit cleanup).
- **Docs** — `DECISION_LOG.md` DL-041..DL-045; `KNOWN_ISSUES.md` #4/#17 resolved,
  #18 reduced to an operator prune-after-migration; `DEVELOPER_GUIDE.md` Resources &
  Media section; `Token_Usage.md` Session-7 row.

### Added/Changed — Session 8: Developer Console · 2026-06-29

- **Developer Console — a read-mostly caller layer (DL-046)** in `lib/devconsole/`
  over the Session 2–7 plumbing. It adds NO new audit writer / mutation / rollback
  pipeline — it consumes `audit_log`, `transition_run`, `backup_record` and the
  existing services. Authorization is `authorizeConsole(actor, keys)`: an **any-of**
  permission gate (additive-union RBAC, developer/`grants_all` short-circuit,
  `{system:true}` bypass), mirroring `lib/media/migrate.mjs#authorizeMigrate`.
- **Audit-log viewer (DL-047)** — `lib/devconsole/audit.mjs`: `listAuditLog` (filter
  by actor / entity / action / year / time-range; newest-first **keyset pagination**
  via the monotonic BIGSERIAL `id`, DL-018), `getAuditEntry` (full before/after),
  `getEntityTimeline`, `getAuditStats` (counts by action + entity via `groupBy`). Pure,
  unit-tested helpers (`normalizeAuditFilters`, `buildAuditWhere`, `shapeAuditEntry`,
  `compareByCountThenKey`, `summarizeByKey`) carry the logic. Gated on the **dedicated
  `audit.read`** (not the broad `dev.console`); bulk list/timeline rows **data-minimize
  PII** — `ip_address` / `user_agent` + the before/after JSONB are emitted only in the
  single-entry detail view; a date-only `?to=` is the inclusive end-of-day.
- **Monitoring + status (DL-048)** — `lib/devconsole/status.mjs`: `checkDatabase`
  (latency probe + Neon-state label; NEVER throws — a cold/suspended compute is a
  reported STATE, raw `P1001` host:port redacted + logged server-side),
  `getMigrationStatus` (a `prisma migrate status`-shaped `diffMigrations` of on-disk
  migrations vs the `_prisma_migrations` ledger; a ledger-read failure returns a
  distinct `ledger-unreadable` shape, never "all pending"), `getTransitionStatus`
  (reuses `lib/year/transition.mjs#listTransitionRuns`), `getMediaMigrationStatus`
  (the `/public`→Cloudinary plan as a **pure read** reusing `selectMigrationCandidates`
  — never invokes the gated mutator). `getSystemStatus` is the gated aggregator
  (`dev.console`), wrapping each sub-check in `safe()`→`{error}`.
- **Testing reports + cost (DL-048)** — `lib/devconsole/reports.mjs`: a test-suite
  catalog, `parseTokenUsage`/`summarizeTokenUsage` over `docs/Token_Usage.md`,
  `estimateBuildCost` (indicative LLM output-token cost) and `estimateInfraCost`
  (Neon/Cloudinary free-tier headroom) over `getInfraUsage` (DB size +
  media inventory). The infra read is isolated so a cold Neon degrades it to
  `{error}` instead of sinking the status route.
- **Backups / restore / rollback (DL-046)** — `lib/devconsole/backups.mjs`: the
  `backup_record` ledger (`recordBackup` / `markBackupVerified` / `listBackups`)
  through the shared `auditedMutation` (one semantic audit row each; `bytes` validated
  to a friendly 422; returns the JSON-safe shaped row), plus **recovery delegates** —
  `rollbackMediaMigration` → `lib/media/migrate.mjs#rollbackMigration` (DL-043) and
  `forceTransitionResync` → `lib/year/transition.mjs#runTransition({force:true})`
  (DL-031) — gated on `backup.restore`/`dev.console` FIRST, then the underlying
  service's own gate (defense-in-depth). No new rollback logic.
- **Surfaces** — gated routes `GET /api/dev/status` (`dev.console`; `Promise.allSettled`
  so a partial failure still returns the health payload) and `GET /api/dev/audit`
  (`audit.read`), plus a read-only CLI `scripts/devconsole.mjs`
  (`npm run db:console [-- --audit --action=… --take=…]`). The rich console UI is the
  Session-9 admin panel.
- **Tests** — **258 static** (was 219): `devconsole.test.mjs` (39) — filter
  normalization / where-building (incl. end-of-day & cursor), `shapeAuditEntry`
  PII-minimization, the shared comparator + `getAuditStats` ordering via an injected
  fake client, `diffMigrations`, `summarizeTransitionRuns`, `classifyLatency`,
  `parseTokenUsage`, `estimateBuildCost`/`estimateInfraCost`, `shapeBackup`. Plus
  **10 live-DB** (`devconsole.db.test.mjs`, throwaway 2093-94 year + direct-inserted
  audit rows): reader filters + keyset pagination (full-walk non-overlap) + stats
  ordering + timeline + entry, the 401/403 console gate, DB/migration/system status,
  infra/reports + build-cost, the media-plan pure read (no `media.migrate`), the
  recovery-delegate gate, and the audited backup ledger (+ a `bytes` 422). All prior
  live suites still green; **org re-confirmed 4/4** (Session-7 changes inert).
  `next build` + ESLint clean. **No new migration** (Session-2 schema already modeled
  `audit_log` / `transition_run` / `backup_record`).
- **Adversarial review** — a 7-lens workflow (correctness, security/authz, reuse/
  consistency, read-only/no-new-pipeline, routes/API, tests, edge-cases/Neon) with
  per-finding 2-verifier adversarial verification (43 agents); **18 raw findings → 6
  confirmed-by-both + 8 single-vote → all legitimate ones addressed**, 4 rejected as
  intentional designs. Fixes: status-route cold-Neon resilience (guarded infra read +
  `Promise.allSettled`), `getAuditStats` ordering coverage + shared comparator (killed
  the dead `summarizeByKey` duplication), end-of-day `?to=`, friendly `bytes` 422,
  JSON-safe mutator returns, `ledger-unreadable` shape, error-message redaction, audit
  PII minimization + `audit.read` gating, pagination full-walk assertion, recovery-
  delegate + media-plan gate tests.
- **Docs** — `DECISION_LOG.md` DL-046..DL-048; `DEVELOPER_GUIDE.md` Developer Console
  section + `db:console` command; `Token_Usage.md` Session-8 row.

### Added/Changed — Session 10: Testing + Deployment + Optimization + Handover · 2026-06-29

The final build session — harden, prove, and ship (no new features). The product is
feature-complete across Sessions 1–9.

**Test gate (DL-052)**
- Full suite green on a warm Neon: **307 static** (was 285) + the complete live-DB
  run (**344 total**: + smoke 8 / cms 8 / year 6 / org 4 / events 10 / resources 4 /
  media 3 / devconsole 10 / users 6). New static tests: `tests/security.test.mjs`
  (16, the CSRF/rate-limit decision functions) + 6 `cloudinaryAutoUrl` cases.
- **CI** — `.github/workflows/ci.yml`: `static-tests` (npm ci → prisma generate →
  `npm test` → `npm run lint` → `npm run build`) on every push/PR; `live-db-tests`
  nightly / manual, secret-gated (secrets hoisted to job-level `env` so the
  step `if` is in scope — review-fixed). Added `npm run lint` (`eslint .`, since
  Next 16 removed `next lint`) and `backups/**` to the ESLint ignores.

**Performance / CWV on public pages (DL-053)**
- `lib/media/cloudinary.mjs#cloudinaryAutoUrl` — pure, idempotent injection of
  `f_auto,q_auto` into Cloudinary delivery URLs; applied in `lib/org/public.mjs`
  (image assets only) + `lib/events/public.mjs` covers. `next/image` `sizes` on every
  `fill` image (EventCard / OrgUnitPage hero + photos); `images.formats` AVIF/WebP.
- **Fonts (#12)** — all fonts now load once via `next/font/google` in `app/layout.js`
  (Geist, Geist Mono, Cormorant Garamond 400/600/700, Outfit) as CSS variables; the
  render-blocking per-component `@import url(fonts.googleapis…)` in Header/EventCard
  removed; Header/EventCard/admin.css/Footer consume `var(--font-*)`.
- **Brand blue (#11)** — `#003f87` is now the single canonical value (the stray
  `#003087` in EventCard/Header/`--adm-blue` aligned).

**Responsive (DL-051 follow-up)**
- Admin mobile sidebar toggle wired (`AdminShell.jsx` + `admin.css`): the `☰` button
  shows below 880px, slides the sidebar in over a tap-to-close backdrop.

**Deploy hardening (DL-054 / DL-055)**
- Security headers in `next.config.mjs#headers()` (nosniff, X-Frame-Options
  SAMEORIGIN, Referrer-Policy, Permissions-Policy, HSTS). CSP deferred (needs a
  nonce pipeline) — documented.
- `lib/http/guard.mjs` (NEW) — a same-origin (CSRF) check + a best-effort
  per-process rate limiter, wired into `POST /api/admin/action` (60/min/account) and
  `POST /api/events` (20/min) with friendly 403/429 + `Retry-After`.
- NFT over-tracing (#32) — accepted as benign; `outputFileTracingIncludes` bundles
  the dev-console fs reads (`prisma/migrations/**`, `docs/Token_Usage.md`).

**Prune + route cutover (DL-056)**
- Removed dead `app/page1.js` (#10) and the four static `app/Clubs/*` (#13); cut the
  Header council nav over to the data-driven `/org/councils/<slug>` pages and removed
  the dead `councilConfig`/`isCouncilPage` logic. `/public` NOT pruned (#18 stays
  operator-pending — migration not run + hardcoded hero refs remain; runbook §3.1).

**Handover**
- `docs/OPERATIONS_RUNBOOK.md` (NEW) — the operator entry point (env checklist,
  setup, imports, media migration, deploy, admins, observe/recover, troubleshooting).
- Refreshed `docs/DEPLOYMENT.md` (V2 reality + hardening summary) and `docs/README.md`
  (status → all 10 sessions complete; runbook + admin-guide links).

**Deferred to Session 11+ (DL-057)**
- A late operator request — which grew into a large **member-platform program** —
  is deferred to a new multi-session series **Session 11+** (Session 10 is
  harden-only). Modules: **M0** email+password-only admin-provisioned accounts
  (removes Google OAuth; bulk CSV, external-mail delivery, must-change, admin-mediated
  forgot/reset, account requests, user deletion); **M1** active/inactive/revoked
  status + admin/dev dashboards; **M2** RBAC categories + per-email grant/deny
  overrides + email-format smart search; **M3** expanded club pages + memberships;
  **M4** Wall of Fame; **M5** advanced central Event Playground (rounds/scores/
  ranking/registration/attendance/closure report); **M6** member profiles; **M7**
  centralized notifications/feedback/announcements; **M8** developer dashboard
  (action+usage tracking, per-table backup/thresholds, nodemailer). Durable design:
  [docs/MEMBER_PLATFORM_PLAN.md](MEMBER_PLATFORM_PLAN.md); authoritative prompt:
  `NEXT_TASK.md`.

**Review** — a 5-dimension adversarial workflow (13 agents, per-finding 2 verifiers):
4 raw findings → **1 confirmed-both** (the CI live-db `if`-scope bug — fixed) + 3
rejected; 2 of the rejected (the `Origin: null` defense-in-depth gap and the Footer
Cormorant weight-400 gap) were tidied anyway as cheap, correct improvements.

---

### Added/Changed — Session 9: Admin Panel · 2026-06-29

- **Users & Roles — the ONE net-new backend (DL-049)** — `lib/users/admin.mjs`:
  create/invite/update/suspend users, set passwords (argon2id), role CRUD, and
  grant/revoke role assignments. Authorizes FIRST (`user.*` / `role.*`), one
  semantic `audit_log` row per op via the shared `auditedMutation` (using the
  `grant_role` / `revoke_role` actions), JSON-safe shaped returns (never the raw
  row / `passwordHash`), and DB uniques honored via friendly mapped errors.
  **Privilege-escalation guards:** only a developer can create/set `is_developer`
  OR grant a `grants_all`/system role (developer/super_admin); new roles can't be
  `grants_all`; system roles are modification-protected except their description;
  no self-lockout. (`lib/cms/errors.mjs` gained `ROLE_ASSIGNMENT_DUPLICATE` /
  `ROLE_KEY_TAKEN` / `EMAIL_TAKEN` matchers.)
- **One registry-driven, audited mutation endpoint (DL-050)** — every admin write
  posts `{ action, args }` to `POST /api/admin/action`, which `requireUser()`s then
  delegates via `lib/admin/handlers.mjs#dispatchAdminAction` (a per-action registry:
  `permission` → institute-wide gate at the boundary; `scoped` → content/org ops
  authorized at the item's true year/lineage scope by the service; `console` →
  `authorizeConsole`). Every run executes inside `withAuditContext` so rows are
  attributed; the client IP is validated with `net.isIP` before the `inet` column;
  errors map through `mapDbError`. NO new mutation/audit/visibility pipeline — it
  calls the Session 3–8 services.
- **The RBAC-gated admin UI (DL-051)** — Next 16 Server Components gated by
  `lib/admin/server.mjs` (`loadAdminContext`/`loadModuleContext`, never throw) over
  a permission-filtered nav (`lib/admin/nav.mjs#buildAdminNav` — the viewer sees only
  modules they can touch). An admin shell (`app/admin/layout.jsx` + `AdminShell` +
  sign-in/denied states + `admin.css` design system) and a dashboard, plus module
  screens for **Content** (list / create / edit-draft / publish / unpublish / archive
  / restore + version history & a client-side revision DIFF, generic over every
  `content_type` via the DL-011 registry — incl. collecting a type's required payload
  fields on create), **Organization** (units + people + appointments, honoring the
  hierarchy/type/cardinality guards), **Academic Years** (years + set-current +
  lock/unlock + the Transition Wizard), **Media** (browse/register/edit-metadata/
  archive + migration-status banner), **Users & Roles** (the new service: users tab
  with grant/revoke, roles tab with a permission-matrix editor), and the **Developer
  Console** (renders the Session-8 readers: status, reports, the audit viewer with
  filters + keyset pagination + entry drill-down, backup ledger + a safe media
  rollback dry-run). Reads are server-side; mutations refetch via `router.refresh()`.
- **Pure, client-safe helpers** — `lib/admin/{nav,view-models,forms}.mjs` are
  prisma-free (so they import into Client Components AND unit-test without a DB);
  `lib/admin/{server,reads}.mjs` are server-only. Form validators MIRROR the service
  validators. `lib/cms/content-types.mjs` gained `getContentTypeFieldSpec` (the
  registry-driven editor's field source). The V1 `app/admin/page.js` (events form)
  and the dead `app/admin/page2.js` were removed (superseded by the panel).
- **Login & access guide** — `docs/ADMIN_PANEL_GUIDE.md`: where to go (`/admin`),
  how to sign in (Google / credentials), the seeded roles and what each can see/do,
  bootstrap accounts, and how to grant access.
- **Tests** — **285 static** (was 258; `admin.test.mjs`, 27: nav model / view-models
  incl. `diffViews` / form validators / users-service pure helpers / the action-
  registry integrity) + **6 new live-DB** (`users.db.test.mjs`): create/list/dup-email,
  update + status + self-lockout, role CRUD + system-role protection + unknown-perm
  422, grant idempotency + revoke + re-grant + a `grant_role` audit row, the 401/403
  RBAC gate, and the DL-049 developer-only guards (flag + both grant paths). `next
  build` clean (all `/admin/*` server-rendered on demand); ESLint clean. **No new
  migration** (Session-2 schema already modeled user/role/role_assignment).
- **Adversarial review** — a 7-lens workflow (RBAC/authz, users-service correctness,
  client-server boundary, reads/views/forms, reuse/no-new-pipeline, UI edge-cases,
  security/disclosure) with per-finding 2-verifier verification (45 agents); **19
  findings → 12 confirmed-by-both + 1 single-vote → all 13 addressed**, 6 rejected as
  intentional. Fixes incl. a **CRITICAL** privilege-escalation (grantRole could assign
  the `grants_all` developer/system role with only `role.assign` — now developer-only),
  the empty-required-payload create failure, the missing role-revoke UI, the
  `createUser` hash-leak (caught by the live test), the role-audit before/after shape +
  the `role.read` coupling in create/update (the `roleView` refactor), `humanBytes(null)`,
  stricter IP validation, and several UI nits.
- **Docs** — `DECISION_LOG.md` DL-049..DL-051; `ADMIN_PANEL_GUIDE.md` (new);
  `DEVELOPER_GUIDE.md` Admin Panel section; `Token_Usage.md` Session-9 row;
  `KNOWN_ISSUES.md` #10 partially closed (dead admin pages removed).

---

## Milestone history

*(Each completed milestone adds a dated, versioned entry here describing what
shipped, tests added, and docs updated.)*
