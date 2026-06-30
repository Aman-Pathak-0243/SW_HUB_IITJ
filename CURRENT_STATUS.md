# Current Status

**Last updated:** 2026-06-30
**Session:** 11 — **M0 COMPLETE** (Member Platform: auth & account lifecycle) **+ the
member-platform PLUGIN control plane**. Sessions 1–10 remain complete (deployable V2).
**Project status:** ✅ Sessions 1–10 shipped; ▶️ Session 11 began the multi-session
member-platform program with **M0 + the plugin**. **Next: M2** (RBAC categories +
per-email overrides + smart search).
**Branch:** `portal-v2`

## What is done (Session 11 — M0 + the PLUGIN)

- **Member platform = a developer-controlled PLUGIN (DL-058).** New `feature_flag`
  table + [lib/platform/flags.mjs](lib/platform/flags.mjs): the whole Session 11+
  program is gated behind the **`member_platform`** flag. A **developer** toggles it
  at **`/admin/plugins`** (off by default); ON activates the M0 features, OFF keeps
  the Sessions 1–10 portal exactly as-is (legacy Google sign-in intact). Reads
  **fail closed** (a DB error ⇒ off; the Google-reject auth check passes `onError:true`
  so it fails toward *deny*). Toggling is developer-only + audited. Seed registers the
  flag (re-seed never resets the operator's `enabled`).
- **M0 auth pivot (DL-059).** Email+password ONLY within the plugin — Google is
  rejected at the `signIn` callback when on (the provider is also conditional on
  `GOOGLE_CLIENT_ID`), kept when off. `app_user.must_change_password` (+ `password_set_at`)
  forces a first-login change: the edge `middleware.js` redirects must-change users to
  `/account/password` via the pure, tested `lib/auth/must-change.mjs`; the JWT carries
  the flag (refreshed on `session.update()`); `changeOwnPassword` clears it.
- **Account lifecycle (DL-061).** [lib/users/admin.mjs](lib/users/admin.mjs) gained
  `createUser` initial-password+must-change, **bulk CSV** (`parseUserCsv`/`importUsersCsv`,
  existing emails skipped), `forcePasswordReset` (generates a temporary password, shown
  ONCE for external delivery), `changeOwnPassword` (self-only, verifies current), and
  `deleteUser` (hard delete; **DL-049 escalation parity** — no self-delete, and only a
  developer may delete OR reset-the-password-of a developer). One password POLICY
  ([lib/auth/password-policy.mjs](lib/auth/password-policy.mjs), client+server); the
  CSPRNG generator is server-only ([lib/auth/password-generator.mjs](lib/auth/password-generator.mjs)).
- **Centralized request queue (DL-060).** New `notification` table +
  [lib/notifications/service.mjs](lib/notifications/service.mjs): public **Request an
  account** + **Forgot password** forms create rows (human ref ids `AR-/PR-NNNNN` from
  a DB sequence; **race-free dedup** via a partial-unique backstop; account existence
  never leaked). Admin/dev **Password Management** tab (`/admin/requests`) — Take
  (assign, audited) → fulfil (`lib/auth/password-reset.mjs` generates + sets + resolves)
  or dismiss. New permissions `notification.{read,assign,resolve}` + `user.delete`.
- **Surfaces.** Public `/login`, `/account/{request,forgot,password}`; gated routes
  `POST /api/account/{request,forgot,password}` (CSRF + plugin gate + rate-limit);
  admin `/admin/plugins` + `/admin/requests`; the admin sign-in + Users tab extended
  (bulk import, delete, reset). Every admin write still posts to the ONE
  `POST /api/admin/action` registry.
- **Schema.** Two forward migrations (`20260630120000_member_platform_m0` +
  `20260630121000_notification_dedup_uq`), applied to Neon; init untouched (DL-027).
  `FeatureFlag`/`Notification` added to `AUTO_AUDIT_SKIP` (semantic audit only).
- **Tests.** **346 static** (was 307; +password-policy/generator, flags+cache+onError,
  CSV parse, must-change helper, email parser, migration) + **8 new live**
  (`m0.db.test.mjs`): plugin toggle (dev-only) + fail-closed, must-change lifecycle,
  changeOwnPassword, forceReset, bulk dedup, delete + reset escalation guards, request
  ref-ids + dedup backstop + read gate, assign→fulfilReset end-to-end. All prior live
  suites still green (cms 8 / year 6 / org 4 / events 10 / resources 4 / media 3 /
  devconsole 10 / users 6 / smoke 8). `next build` + ESLint clean.
- **Adversarial review** — a 6-dimension, per-finding 2-verifier workflow (12 agents):
  **3 confirmed (0 refuted) → all 3 fixed + re-verified live**: (CRITICAL) a non-developer
  super_admin could reset a developer's password and take over the bypass account →
  guarded in `setUserPassword`; (medium) non-atomic request dedup → DB partial-unique
  backstop + catch; (medium) Google-reject failed *open* on a Neon error → `onError:true`.

---

## Original handover note (Sessions 1–10)

A large operator-requested **Session 11+ member-platform program** is in progress
(multi-session): M0 ✅ (this session). Remaining: M2 RBAC categories + per-email
overrides, M1 status modes, M3 club pages + memberships, M4 Wall of Fame, M5 Event
Playground, M6 profiles, M7 notifications/feedback, M8 developer dashboard. **Full
module-by-module prompt in [NEXT_TASK.md](NEXT_TASK.md); durable design in
[docs/MEMBER_PLATFORM_PLAN.md](docs/MEMBER_PLATFORM_PLAN.md).**

> New session? Read [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md) first,
> then this file, [NEXT_TASK.md](NEXT_TASK.md), [TODO.md](TODO.md),
> [KNOWN_ISSUES.md](KNOWN_ISSUES.md), [docs/CHANGELOG.md](docs/CHANGELOG.md).
> **To deploy/operate:** [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md).
> **To use the panel:** [docs/ADMIN_PANEL_GUIDE.md](docs/ADMIN_PANEL_GUIDE.md)
> (login, roles, URLs).

## What is done (Session 10 — FINAL)

- **Full test gate (DL-052)** — **307 static** + the complete live-DB run (**344
  total**: smoke 8 / cms 8 / year 6 / org 4 / events 10 / resources 4 / media 3 /
  devconsole 10 / users 6) green on a warm Neon (no cold-compute retry needed).
  New: `tests/security.test.mjs` (16) + 6 `cloudinaryAutoUrl` cases. **CI**
  (`.github/workflows/ci.yml`): static suite + `npm run lint` (eslint; Next 16
  dropped `next lint`) + build on push/PR; live-DB nightly/manual, secret-gated.
- **Public CWV (DL-053)** — `cloudinaryAutoUrl` injects `f_auto,q_auto` into
  Cloudinary image URLs (org/events read layers; PDFs untouched); `next/image`
  `sizes` on every `fill` image; AVIF/WebP. **Fonts (#12)** consolidated to one
  `next/font` load (CSS variables; the per-component `@import` removed). **Brand
  blue (#11)** unified to `#003f87`.
- **Responsive** — admin mobile sidebar toggle wired (`☰` < 880px, slide-in over a
  tap-to-close backdrop).
- **Deploy hardening (DL-054/055)** — security headers (`next.config.mjs#headers`),
  a same-origin CSRF check + per-process rate limiter (`lib/http/guard.mjs`) on
  `POST /api/admin/action` + `/api/events`, and the NFT #32 decision (accept +
  `outputFileTracingIncludes`). CSP deferred (#33), rate-limit is per-process (#34).
- **Prune + cutover (DL-056)** — removed `app/page1.js` (#10) and the four static
  `app/Clubs/*` (#13); Header council nav cut over to `/org/councils/<slug>`.
  `/public` NOT pruned (#18 operator-pending — see runbook §3.1).
- **Handover** — `docs/OPERATIONS_RUNBOOK.md` (deploy/setup/imports/admins/recover);
  refreshed DEPLOYMENT.md + docs/README.md; this status, NEXT_TASK, TODO, CHANGELOG,
  DECISION_LOG (DL-052–057), KNOWN_ISSUES, Token_Usage all updated.
- **Review** — 5-dimension adversarial workflow (13 agents, 2 verifiers/finding):
  4 findings → 1 confirmed (CI live-db `if`-scope bug, **fixed**) + 3 rejected; 2
  rejected nits (Origin:null, Footer Cormorant weight) tidied anyway. `next build` +
  ESLint clean; **no new migration**.

## What is done (Session 9)

- **Users & Roles — the ONE net-new backend (DL-049)** — [lib/users/admin.mjs](lib/users/admin.mjs):
  create/invite/update/suspend users + set passwords (argon2id), role CRUD, and
  grant/revoke role assignments. Authorizes FIRST (`user.*` / `role.*`), writes one
  semantic `audit_log` row per op via the shared `auditedMutation` (`grant_role` /
  `revoke_role` actions), returns JSON-safe shaped rows (never the raw row /
  `passwordHash`), and honors the DB uniques via friendly mapped errors. **Four
  privilege-escalation guards:** only a developer can create/set `is_developer` OR
  grant a `grants_all`/system role (the review found the latter as a CRITICAL — the
  flag was guarded, the equivalent role-grant was not); new roles can't be
  `grants_all`; system roles are modification-protected except `description`; no
  self-lockout.
- **One registry-driven, audited mutation endpoint (DL-050)** — every admin write
  posts `{ action, args }` to [app/api/admin/action](app/api/admin/action/route.js),
  which `requireUser()`s then delegates via
  [lib/admin/handlers.mjs](lib/admin/handlers.mjs)`#dispatchAdminAction` (a per-action
  registry: `permission` → institute-wide gate; `scoped` → content/org ops authorized
  at the item's year/lineage scope BY the service; `console` → `authorizeConsole`).
  Runs inside `withAuditContext` (attributed rows; IP via `net.isIP`). NO new
  mutation/audit/visibility pipeline — it calls the Session 3–8 services.
- **The RBAC-gated admin UI (DL-051)** — Next 16 Server Components gated by
  [lib/admin/server.mjs](lib/admin/server.mjs) over a permission-filtered nav
  ([lib/admin/nav.mjs](lib/admin/nav.mjs)). Shell + dashboard + modules: **Content**
  (full CMS lifecycle + version diff, generic over every `content_type`),
  **Organization** (units/people/appointments), **Academic Years** (years + lock +
  Transition Wizard + set-current), **Media** (library + migration status), **Users &
  Roles** (the new service: grant/revoke + permission-matrix role editor), **Developer
  Console** (renders the Session-8 readers: status, reports, audit viewer with
  filters/pagination/drill-down, backup ledger + media-rollback dry-run). Reads are
  server-side; mutations refetch via `router.refresh()`.
- **Pure, client-safe helpers** — `lib/admin/{nav,view-models,forms}.mjs` are
  prisma-free (client-importable + DB-free unit tests); `{server,reads}.mjs` are
  server-only. Form validators mirror the service validators.
  `lib/cms/content-types.mjs` gained `getContentTypeFieldSpec` (the registry-driven
  editor). V1 `app/admin/page.js` + dead `page2.js` removed (superseded).
- **Tests** — **285 static** (was 258; `admin.test.mjs`, 27) + **6 new live-DB**
  (`users.db.test.mjs`): user CRUD + dup-email, status + self-lockout, role CRUD +
  system-role protection + unknown-perm 422, grant idempotency + revoke + re-grant +
  a `grant_role` audit row, the 401/403 gate, and the DL-049 developer-only guards
  (flag + both grant paths). `next build` + ESLint clean; **no new migration**. All
  prior live suites unaffected (this session added no service changes to them).
- **Adversarial review** — a 7-lens, per-finding 2-verifier workflow (45 agents);
  **19 findings → 12 confirmed-both + 1 single-vote → all 13 addressed** (incl. the
  CRITICAL grant-escalation, the empty-required-payload create, the missing
  role-revoke UI, the `createUser` hash-leak, the role-audit shape + `role.read`
  coupling, `humanBytes(null)`, stricter IP validation, UI nits), 6 rejected as
  intentional designs.

## What is done (Session 8)

- **Developer Console — a read-mostly caller layer (DL-046)** over the Session 2–7
  plumbing, in `lib/devconsole/`. It adds NO new audit writer / mutation / rollback
  pipeline; it consumes `audit_log`, `transition_run`, `backup_record` and the
  existing services. Gated by `authorizeConsole(actor, keys)` — an **any-of**
  permission gate (additive-union RBAC, developer/`grants_all` short-circuit,
  `{system:true}` bypass) mirroring `lib/media/migrate.mjs`.
- **Audit-log viewer (DL-047)** — [lib/devconsole/audit.mjs](lib/devconsole/audit.mjs):
  `listAuditLog` (filter by actor / entity / action / year / time-range; newest-first
  **keyset pagination** via the monotonic BIGSERIAL `id`), `getAuditEntry` (full
  before/after), `getEntityTimeline`, `getAuditStats` (counts by action + entity via
  `groupBy`). Pure helpers (`normalizeAuditFilters` / `buildAuditWhere` /
  `shapeAuditEntry` / `compareByCountThenKey`) carry the logic. Gated on the
  **dedicated `audit.read`** (not the broad `dev.console`); bulk list/timeline rows
  **data-minimize PII** (ip / user-agent + before/after only in the single-entry
  view). A date-only `?to=` is treated as the inclusive end-of-day.
- **Monitoring + status (DL-048)** — [lib/devconsole/status.mjs](lib/devconsole/status.mjs):
  `checkDatabase` (latency probe + Neon-state label; NEVER throws — a cold/suspended
  compute is a reported STATE, raw `P1001` host:port redacted), `getMigrationStatus`
  (a `prisma migrate status`-shaped `diffMigrations` of on-disk migrations vs the
  `_prisma_migrations` ledger; a ledger-read failure returns a distinct
  `ledger-unreadable` shape, never "all pending"), `getTransitionStatus` (reuses
  `listTransitionRuns`), and `getMediaMigrationStatus` (the `/public`→Cloudinary
  plan as a **pure read** reusing `selectMigrationCandidates` — never routes through
  the gated mutator). `getSystemStatus` is the one gated aggregator (`dev.console`),
  degrading each sub-check to `{error}`.
- **Testing reports + cost (DL-048)** — [lib/devconsole/reports.mjs](lib/devconsole/reports.mjs):
  a test-suite catalog, `parseTokenUsage`/`summarizeTokenUsage` over
  `docs/Token_Usage.md`, `estimateBuildCost` (indicative LLM output-token cost) and
  `estimateInfraCost` (Neon/Cloudinary free-tier headroom) over live `getInfraUsage`
  (DB size + media inventory). The infra read is isolated so a cold Neon degrades it
  to `{error}` instead of sinking the status route.
- **Backups / restore / rollback (DL-046)** — [lib/devconsole/backups.mjs](lib/devconsole/backups.mjs):
  the `backup_record` ledger (`recordBackup` / `markBackupVerified` / `listBackups`)
  through the shared `auditedMutation` (one semantic audit row each; `bytes` validated
  to a friendly 422; returns the JSON-safe shaped row), plus **recovery delegates** —
  `rollbackMediaMigration` → `lib/media/migrate.mjs#rollbackMigration` (DL-043) and
  `forceTransitionResync` → `lib/year/transition.mjs#runTransition({force:true})`
  (DL-031) — gated on `backup.restore`/`dev.console` FIRST, then the underlying
  service's own gate (defense-in-depth). No new rollback logic.
- **Surfaces** — gated routes [app/api/dev/status](app/api/dev/status/route.js)
  (`dev.console`; `Promise.allSettled` so a partial failure still returns the health
  payload) and [app/api/dev/audit](app/api/dev/audit/route.js) (`audit.read`), plus a
  read-only CLI [scripts/devconsole.mjs](scripts/devconsole.mjs)
  (`npm run db:console [-- --audit ...]`). The rich console UI is the Session-9 panel.
- **Tests** — **258 static** (was 219; `devconsole.test.mjs`, 39: filter/where/shape/
  comparator/`getAuditStats` ordering via an injected client/migration-diff/transition-
  summary/token-parse/cost) + **10 new live-DB** (`devconsole.db.test.mjs`): audit
  reader filters + keyset pagination (full-walk non-overlap) + stats ordering +
  timeline + entry, the 401/403 console gate, DB/migration/system status, infra/reports
  + buildCost, the media-plan pure read (no `media.migrate`), the recovery-delegate
  gate, and the audited backup ledger (+ a `bytes` 422). All prior live suites still
  green (cms 8 / year 6 / org 4 / events 10 / resources 4 / media 3); **org re-confirmed
  4/4** this session (Session-7 changes inert). `next build` clean; ESLint clean.
  **No new migration** (the schema modeled `audit_log`/`transition_run`/`backup_record`
  in Session 2).
- **Adversarial review** — a 7-lens, per-finding 2-verifier workflow (43 agents);
  18 raw findings → **6 confirmed-by-both + 8 single-vote → all legitimate ones
  addressed**, 4 verifier-rejected as intentional designs. Fixes: status-route
  cold-Neon resilience (guarded infra read + `allSettled`), `getAuditStats` ordering
  coverage + shared comparator (killed the dead `summarizeByKey` duplication),
  end-of-day `?to=`, friendly `bytes` 422, JSON-safe mutator returns, ledger-unreadable
  shape, error-message redaction, audit PII minimization + `audit.read` gating,
  pagination full-walk assertion, recovery-delegate + media-plan gate tests.

## What is done (Session 7)

- **Resources on Postgres via the CMS service (DL-041)** — per-org-unit PDFs/Drive
  links are `content_type='resource'` (org-bound) CMS content driven through the
  Session-3 service (no new pipeline, like events). [lib/resources/public.mjs](lib/resources/public.mjs)
  shapes the public records (`listResourcesForUnit`, `listPublicResourcesByUnit`);
  [lib/org/public.mjs](lib/org/public.mjs)`#getPublicOrgUnit` now returns a
  `resources` array. **Each resource mints its OWN content lineage** (reusing the
  unit's would trip `content_item`'s `UNIQUE(content_type, year, lineage_key)` and
  cap a unit at one resource — caught by the live test).
- **V1 resources dataset + idempotent importer (DL-041)** —
  [lib/resources/data.mjs](lib/resources/data.mjs) (3 student-life councils share
  the Student Club Activities PDF; campus-wide Hostel/Mess PDFs bind to the first
  unit of their kind, DL-035) + [lib/resources/import.mjs](lib/resources/import.mjs)
  (`npm run db:import:resources`): idempotent by `(content_type='resource', year,
  slug)`, resumable (DL-031), SKIPS a resource whose unit is absent (`missingUnit`)
  — **run `db:import:org` first**.
- **Data-driven resources view** — new client
  [ResourcesSection](app/components/ResourcesSection.jsx) renders a `pdf` resource
  via `PdfSlideshow` (real pages + a Drive button) and a link/drive resource as a
  card+button (label by actual destination); rendered by the single `<OrgUnitPage>`.
- **Media service (DL-042)** — [lib/media/service.mjs](lib/media/service.mjs):
  curated `media_asset` CRUD (`createMediaAsset`/`updateMediaAsset`/`archiveMediaAsset`)
  via the shared `auditedMutation` (one semantic audit row; authorize FIRST), reads
  + `shapeAsset`, and the **one** bulk audit-bypassing `findOrCreateInventoryAsset`
  — the org + events importers were refactored onto it (two drifted copies removed;
  a base64 dedup bug in the org copy fixed, DL-039).
  [lib/media/cloudinary.mjs](lib/media/cloudinary.mjs): pure `cloudinaryUrl` /
  `publicIdFromPath` / `signUploadParams` / `resolveDeliveryUrl` (single delivery-URL
  resolver — a transformed PDF carries `.pdf`) + the injectable `uploadFileToCloudinary`.
- **Admin Media Migration Tool (DL-043)** — [lib/media/migrate.mjs](lib/media/migrate.mjs)
  (`npm run db:migrate:media`): **idempotent + reversible + dry-run-first** `/public`
  → Cloudinary. `migratePublicAssets` (dry-run default; `--apply`) repoints rows
  (`cloudinary_public_id`/`url`/`migrated_at`), excludes already-migrated rows (re-run
  → 0); `rollbackMigration` (`--rollback`) restores `local` + `url ← original_path`.
  Reconciles the Session-6 base64 placeholders (DL-039; `base64Pending`, or via an
  optional resolver). Bulk via `prismaBase`; one summary audit row; injectable
  uploader (fake in tests).
- **Config follow-ups** — pdfjs pinned to exact `6.0.227` + legacy lib/worker build
  (#4, DL-044); image hosts narrowed to `res.cloudinary.com` in `next.config.mjs` +
  `EventsBoard` (#17, DL-045); `env.example` documents `CLOUDINARY_*`.
- **Tests** — **219 static** (was 171; `media.test.mjs` + `resources.test.mjs`) +
  **7 new live-DB** (`media.db.test.mjs` ×3, `resources.db.test.mjs` ×4). `media.db`:
  migrate idempotent + reversible + base64 reconcile; curated CRUD one-audit-row +
  RBAC 403 + migration-owned-field restriction. `resources.db`: publish→visible +
  org view + unpublish/archive hides; importer idempotent + `missingUnit`;
  partial-run resume; shared-file media dedup. All prior live suites still green
  (cms 8 / year 6 / org 4 / events 10); `next build` clean. **No new migration**
  (Session-2 schema already modeled `resource_payload`/`media_asset`).
- **Adversarial review** — a 10-lens, per-finding 2-verifier workflow; **14 confirmed
  → all addressed** (PDF transformed-URL format, importer dedup unification + base64
  fix, `base64Pending` count, media auth-before-disclosure, `listPublicResourcesByUnit`
  unit gate, `ResourceCard` label, dead ternary, + resume/dedup/curated-service/
  `shapeAsset` tests and scoped test audit cleanup).

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

## What is NOT done (all DEVELOPMENT is complete — these are OPERATOR / OWNER / Session-11 items)

**Operator steps (run at/after deploy — all idempotent, tested end-to-end):**
- `npm run db:import:org` (~15 min) → `db:import:events` → `db:import:resources` to
  populate the live 2025-26 year (#27). Until org runs, `/org/*` pages show an empty
  state (expected). Full procedure: **OPERATIONS_RUNBOOK.md §3**.
- Media migration `/public` → Cloudinary: `npm run db:migrate:media` (dry-run) →
  `-- --apply`, then the safe `/public` prune (#18; runbook §3.1).

**Owner steps (out-of-band):**
- Rotate/remove the V1 leaked secrets in the root `README.md` and purge history
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md)); then
  drop the `.gitleaks.toml` by-SHA allowlist (#1/#19).

**Session 11+ (NEW features the operator requested — DL-057, a multi-session program):**
- M0 email+password-only admin-provisioned accounts (bulk CSV, external mail,
  must-change, admin-mediated forgot/reset) — REMOVES Google OAuth; M1 active/
  inactive/revoked status + admin/dev dashboards; M2 RBAC categories + per-email
  grant/deny overrides + email-format smart search; M3 expanded club pages +
  memberships; M4 Wall of Fame; M5 advanced central Event Playground
  (rounds/scores/ranking/registration/attendance/closure-report); M6 member
  profiles; M7 centralized notifications/feedback/announcements; M8 developer
  dashboard (action+usage tracking, per-table backup/thresholds, nodemailer).
- **Full module-by-module prompt in [NEXT_TASK.md](NEXT_TASK.md).**

## Key facts for the next session

- DB is live on Neon with the seeded baseline. `npm test` (static) is always
  green (**285 passing**); `RUN_DB_TESTS=1 dotenv -e .env.local -- npm test` adds the
  live smoke + CMS (8) + year-engine (6) + org (4) + events (10) + resources (4) +
  media (3) + developer console (10) + **users/roles (6)** live tests. The remote Neon compute has high per-round-trip latency
  **and auto-suspends**, so live tests are slow (minutes) and occasionally hit a
  transient "Can't reach database server" on a cold compute — re-run once if so (not
  a logic failure). The org live suite is the slowest (the importer makes many
  sequential audited tx round-trips).
- Import `prisma` from `lib/prisma.mjs` for all app DB access — it is the
  audit-extended client, so mutations are audited automatically. Use `prismaBase`
  only to bypass audit (audit reader, repair scripts, test cleanup / fixtures, the
  bulk media-inventory rows). **Media:** curated `media_asset` writes go through
  `lib/media/service.mjs` (audited); bulk inventory through its
  `findOrCreateInventoryAsset` (the ONE writer the org/events/resources importers
  share); delivery URLs resolve through `lib/media/cloudinary.mjs#resolveDeliveryUrl`.
- **Mutation entrypoints:** the CMS service (`lib/cms/content.mjs`) for content;
  the year engine (`lib/year/*`) for years/transitions/locks; the **org services
  (`lib/org/{units,people,appointments}.mjs`)** for structure/roster; the
  **importer (`lib/org/import.mjs`)** for the V1 migration. All use the shared
  `auditedMutation`. Route handlers (Session 9) call `requirePermission` then the
  service; org mutations gate on `org_unit.*` / `appointment.*`.
- **Public read paths:** `lib/cms/visibility.mjs` (current-year content),
  `lib/year/public.mjs` (any selectable year's content), **`lib/org/public.mjs`
  (org units + profiles + rosters + `resources`)**, **`lib/events/public.mjs`
  (events + announcements: current-year, archive, by-slug; pure `splitEventsByDate`
  + `filterByAudience`)**, and **`lib/resources/public.mjs` (`listResourcesForUnit`
  per unit)**. `resolveCurrentYear` is canonical in `lib/year/context.mjs`.
  Data-driven pages: `app/org/[type]/...` (now incl. a Resources section),
  `app/events`, `app/past-events`, `app/announcements`. Events/announcements AND
  resources are CMS content, so their MUTATIONS go through `lib/cms/content.mjs`
  directly (no separate service); `lib/events/import.mjs` /
  `lib/resources/import.mjs` are the V1 migrations
  (`npm run db:import:events` / `db:import:resources`).
- The **Transition Wizard** (`lib/year/transition.mjs#runTransition`) carries the
  Session-5 org units + appointments forward into a new year (reusing lineage,
  idempotent/resumable) — no per-session re-migration needed.
- **Developer Console (`lib/devconsole/*`, Session 8)** is the ops READ layer the
  Session-9 admin panel renders: `audit.mjs` (audit-log viewer — gate `audit.read`),
  `status.mjs#getSystemStatus` + `reports.mjs#getDevConsoleReports` (gate
  `dev.console`), `backups.mjs` (ledger + `rollbackMediaMigration`/
  `forceTransitionResync` recovery delegates — gate `backup.*`). All authorize via
  `authorizeConsole(actor, keys)` (any-of). Routes: `GET /api/dev/status`,
  `GET /api/dev/audit`. CLI: `npm run db:console [-- --audit]`. It adds NO writer —
  recovery goes through the EXISTING media-migration / transition services.
- **Admin Panel (`/admin`, Session 9)** is the authenticated UI over ALL of the
  above. Every mutation posts to the ONE gated route `POST /api/admin/action`
  (`lib/admin/handlers.mjs` registry → existing services, wrapped in
  `withAuditContext`); reads are gated Server Components (`lib/admin/server.mjs` +
  `lib/admin/reads.mjs`) refreshed via `router.refresh()`. The ONLY net-new backend
  is `lib/users/admin.mjs` (users/roles/grants — gated `user.*`/`role.*`, audited,
  with the DL-049 escalation guards). Pure client-safe helpers:
  `lib/admin/{nav,view-models,forms}.mjs`. Login/roles/URLs:
  [docs/ADMIN_PANEL_GUIDE.md](docs/ADMIN_PANEL_GUIDE.md).
- Raw-SQL objects live in migrations and are invisible to Prisma — never
  `prisma db pull` / `migrate reset`. **Session 5 added ONE forward migration**
  (`20260628130000_fix_appointment_singleton_guard`, a `CREATE OR REPLACE`);
  Sessions 6, 7, 8 and 9 added **none** (the schema already modeled
  events/announcements, `resource_payload`/`media_asset`, and
  `audit_log`/`transition_run`/`backup_record` in Session 2). Add future raw-SQL
  fixes the same way (DL-027/DL-036), never by rewriting the init.

## Next action

See [NEXT_TASK.md](NEXT_TASK.md).
