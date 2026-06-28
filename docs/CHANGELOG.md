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

## Milestone history

*(Each completed milestone adds a dated, versioned entry here describing what
shipped, tests added, and docs updated.)*
