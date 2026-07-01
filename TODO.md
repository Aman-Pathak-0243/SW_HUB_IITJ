# TODO

Backlog grouped by the **10 sessions** (see [docs/MILESTONE_PLAN.md](docs/MILESTONE_PLAN.md)
and [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md)). Updated at the end of
every session. `[ ]` pending · `[~]` in progress · `[x]` done.

## Session 1 — Analysis + Documentation + Architecture ✅
- [x] Full repo analysis
- [x] `/docs` (as-is + target) + tracking files
- [x] Security scanning (gitleaks CI + runbook)
- [x] Verified backup incl. Mongo dump (events 3 + queries 1)
- [x] Database pivot → PostgreSQL (Neon) + Prisma; secret in `.env.local`
- [x] Verified schema design (SCHEMA_DESIGN.md, 33 tables, ER + reasoning)
- [x] DATA_MIGRATION_REPORT, DECISION_LOG, SESSION_PROTOCOL; MILESTONE_PLAN as living doc

## Session 2 — Database + Prisma + RBAC + Authentication ✅
- [x] Install deps; add Prisma + adapter (+ @node-rs/argon2); set `DIRECT_URL` (+ `pgbouncer=true` on pooled)
- [x] `prisma/schema.prisma` from SCHEMA_DESIGN.md (33 tables, 14 Prisma enums)
- [x] Raw-SQL migration objects (partial/NULLS-NOT-DISTINCT uniques, composite FK, 6 triggers, GIN/BRIN, CHECKs)
- [x] `prisma migrate` applied on Neon (single hand-assembled init; `migrate status` clean)
- [x] Seed (year 2025-26, 40 perms, 5 roles+role_permission, 6 org types + 6 edges, 16 positions, 10 content types, bootstrap dev/admins)
- [x] NextAuth + Prisma adapter; Google + credentials (argon2id); one account per email; JWT
- [x] Server-side RBAC util; replaced hardcoded email allowlist (KNOWN_ISSUES #8); gated `POST /api/events` (#2)
- [x] Tests: auth/password, credentials authorize, RBAC, content-type registry, schema+migration, live DB smoke (50 passing)
- [x] Adversarial review workflow (16 agents); confirmed findings fixed + re-verified

## Session 3 — CMS Foundation ✅
- [x] Draft/publish lifecycle + restore + version history (content_item/content_revision/*_payload) — `lib/cms/content.mjs`
- [x] Central audit-log writer — one Prisma client `$extends` + semantic service path (DL-012/DL-025/DL-028); attached to lib/prisma.mjs
- [x] Generic schema-driven editing layer + content_type registry handlers (lib/cms/content-types.mjs)
- [x] Public visibility rule (published AND current year + event/announcement windows) — `lib/cms/visibility.mjs`
- [x] Friendly DB-guard error mapping (`lib/cms/errors.mjs`, DL-029); honors triggers/uniques, no app re-implementation
- [x] Tests: 101 static (cms-errors/audit/content-types/visibility/diff) + 8 live-DB (lifecycle/restore/version/audit/visibility/republish/lock_guard)
- [x] Adversarial review workflow (30 agents, 5 lenses); 24 confirmed findings fixed + re-verified

## Session 4 — Academic Year Engine ✅
- [x] Year context (`lib/year/context.mjs`): current-year resolve/set-current, list/create years; gated on `year.*`, audited
- [x] History queries (`lib/year/history.mjs`): cross-year content/org/roster reads + `org_unit_lineage` follow; lock_guard respected (read-only past years)
- [x] Transition Wizard (`lib/year/transition.mjs`): copy structure forward reusing lineage (DL-007); copy_appointments/content/role_assignments options (DL-026); `transition_run` status+counts; idempotent/resumable + force re-sync; audited `transition`
- [x] Lock/unlock (`lib/year/lock.mjs`): can't lock current year; `YEAR_LOCKED` surfaced
- [x] Public year selector (`lib/year/public.mjs`): chosen-year published content, archive-aware windows (DL-032)
- [x] Shared `auditedMutation`+`TX_OPTS` (`lib/cms/audited-mutation.mjs`, DL-033); shared public read loop; `mapDbError` year/transition signatures
- [x] Tests: 130 static (year + year-transition) + 6 live-DB (resolution/history/transition×3/lock); 8 CMS live still green
- [x] Adversarial review (24 agents, 6 lenses); 18 findings → 16 fixed, 2 nits accepted

## Session 5 — Organization Model (Clubs, Councils, Hostels, Mess) ✅
- [x] Org-unit + lineage service (`lib/org/units.mjs`); honors hierarchy + lock guards; lineage minted only for new logical units (DL-007)
- [x] Person directory (`lib/org/people.mjs`, dedup-by-name case-insensitive, DL-034) + appointment service (`lib/org/appointments.mjs`); honors composite FK + type guard + both cardinality guards
- [x] V1 dataset (`lib/org/data/*`: 4 councils/30 clubs/6 hostels/5 messes/17 committee; "Technical Secretary") + idempotent importer (`lib/org/import.mjs`, `npm run db:import:org`)
- [x] Data-driven public pages: one `<OrgUnitPage>` + `app/org/[type]/...` replaces the 4 Clubs pages (#13); `lib/org/public.mjs` read layer
- [x] Forward migration `20260628130000_fix_appointment_singleton_guard` (is_singleton NULL bug; DL-036), applied to Neon
- [x] Tests: 152 static (`org.test.mjs`) + 4 live-DB (`org.db.test.mjs`: hierarchy/type/cardinality guards, idempotent importer, public read)
- [x] Adversarial review (25 agents, 6 lenses); 15 confirmed → 13 fixed, 2 accepted
- [ ] **Operator:** run `npm run db:import:org` to populate the live 2025-26 year (#27)

## Session 6 — Events + Announcements ✅
- [x] Events + Announcements as CMS `content_type` callers (`lib/events/*`) — no new pipeline (DL-037); publish windows via the DB CHECKs → `PUBLISH_WINDOW`
- [x] Idempotent events importer (`lib/events/import.mjs`, `npm run db:import:events`) — 3 backed-up Mongo events → `content_item`+`event_payload` (+ media inventory, never base64 blobs — #5/DL-039); re-runs create 0; partial run resumes
- [x] V1 Mongo events API replaced by a CMS-backed `app/api/events` (Mongoose retired from the request path); gated POST → `createDraft`; rejects base64 (closes #2/#9/#16 at the API)
- [x] Announcements (pinned-first, audience, window; DL-010); public **audience gating** to `audience='public'` (DL-040)
- [x] Data-driven `/events`, `/past-events` (fixes #3), `/announcements` Server Components + `EventsBoard`/`AnnouncementCard`; responsive; V1 `/admin` form now URL-based (not base64)
- [x] `queries` doc disposition: junk test data → not migrated; no `contact_message` module (DL-038, closes #20)
- [x] Tests: 171 static (`events.test.mjs`) + 10 live-DB (`events.db.test.mjs`: window/expire/open, PUBLISH_WINDOW event+announcement, split, pinned-first, idempotency, audience, media inventory, resume, archive/by-slug, concurrency). `next build` clean. No new migration
- [x] Adversarial review (64 agents, 8 lenses); 23 confirmed → 12 fixed, 1 accepted
- [ ] **Operator:** run `npm run db:import:events` (and `db:import:org`) to populate the live 2025-26 year (#27)

## Session 7 — Resources + Media ✅
- [x] Resources (`content_type='resource'`, org-bound) via the CMS service (DL-041); each resource gets its own content lineage; `lib/resources/{data,public,import}.mjs` + idempotent `npm run db:import:resources`
- [x] Data-driven resources view: `ResourcesSection` (PDF via `PdfSlideshow` + link cards) rendered in `<OrgUnitPage>`; `getPublicOrgUnit` returns `resources`
- [x] Media service (DL-042): `lib/media/service.mjs` curated `media_asset` CRUD (audited) + the one shared `findOrCreateInventoryAsset`; `lib/media/cloudinary.mjs` pure URL/signature/`resolveDeliveryUrl` + injectable uploader
- [x] Admin Media Migration Tool (DL-043): `lib/media/migrate.mjs` idempotent + reversible + dry-run `/public`→Cloudinary, reconciling base64 placeholders (DL-039); `npm run db:migrate:media` (`--apply`/`--rollback`)
- [x] Config: pdfjs pinned + legacy build (#4/DL-044); image hosts → `res.cloudinary.com` only (#17/DL-045); `CLOUDINARY_*` in `env.example`
- [x] Tests: 219 static (`media.test.mjs` + `resources.test.mjs`) + 7 live-DB (`media.db` ×3, `resources.db` ×4); `next build` clean; no new migration
- [x] Adversarial review (10 lenses, per-finding 2-verifier); 14 confirmed → all addressed
- [ ] **Operator:** run `npm run db:import:resources` (after `db:import:org`) and the media migration `npm run db:migrate:media -- --apply` against 2025-26 (#27/#18)

## Session 8 — Developer Console ✅
- [x] Read-mostly caller layer `lib/devconsole/*` over Sessions 2–7 plumbing; no new audit writer / mutation / rollback pipeline (DL-046); `authorizeConsole` any-of gate (system bypass, developer short-circuit)
- [x] Audit-log viewer (`lib/devconsole/audit.mjs`): filter by actor/entity/action/year/time-range, keyset pagination, stats, timeline, entry drill-down; gated on dedicated `audit.read`; PII data-minimized on list rows; date-only `?to=` = inclusive end-of-day (DL-047)
- [x] Monitoring + status (`lib/devconsole/status.mjs`): DB latency probe (never-throws), `prisma migrate status`-shaped ledger diff, transition history, media-migration plan as a pure read (reuses `selectMigrationCandidates`); resilient `getSystemStatus` aggregator (DL-048)
- [x] Testing + cost reports (`lib/devconsole/reports.mjs`): suite catalog, `Token_Usage.md` parser, build-cost + Neon/Cloudinary free-tier estimate over live infra usage (isolated read)
- [x] Backups/restore/rollback (`lib/devconsole/backups.mjs`): `backup_record` ledger via `auditedMutation` (bytes→422; JSON-safe returns) + recovery delegates to media rollback (DL-043) and transition force re-sync (DL-031), gated `backup.*`
- [x] Gated routes `GET /api/dev/status` (`dev.console`, `Promise.allSettled`) + `GET /api/dev/audit` (`audit.read`); CLI `scripts/devconsole.mjs` (`npm run db:console`)
- [x] Tests: 258 static (`devconsole.test.mjs`, 39) + 10 live-DB (`devconsole.db.test.mjs`); org re-confirmed 4/4; `next build` + ESLint clean; no new migration
- [x] Adversarial review (7 lenses, per-finding 2-verifier, 43 agents); 18 → 6 confirmed-both + 8 single-vote → all legitimate addressed, 4 rejected

## Session 9 — Admin Panel ✅
- [x] NEW users-&-roles service (`lib/users/admin.mjs`, DL-049): create/invite/update/suspend users + set passwords, role CRUD, grant/revoke assignments; audited (`grant_role`/`revoke_role`); gated `user.*`/`role.*`; escalation guards (developer-only flag AND grant; system-role protection; no self-lockout)
- [x] One registry-driven, audited mutation endpoint (DL-050): `POST /api/admin/action` → `lib/admin/handlers.mjs` (per-action `permission`/`scoped`/`console` gate) → existing services inside `withAuditContext`; `net.isIP` IP validation; `mapDbError`
- [x] RBAC-gated admin shell + per-permission nav (DL-051): `lib/admin/server.mjs`/`nav.mjs`, `app/admin/layout.jsx` + shell + sign-in/denied + `admin.css`; dashboard
- [x] Module UIs: Content (full CMS lifecycle + version diff, generic over content types), Organization (units/people/appointments), Academic Years (years/lock/wizard/set-current), Media (library + migration status), Users & Roles (grant/revoke + permission-matrix editor), Developer Console (status/reports/audit viewer/backup ledger/recovery)
- [x] Pure client-safe helpers `lib/admin/{nav,view-models,forms}.mjs` (DB-free, unit-tested); `getContentTypeFieldSpec` for the registry-driven editor; removed V1 `app/admin/page.js` + dead `page2.js`
- [x] Login & access guide `docs/ADMIN_PANEL_GUIDE.md` (URLs / sign-in / roles / bootstrap)
- [x] Tests: 285 static (`admin.test.mjs`, 27) + 6 live-DB (`users.db.test.mjs`); `next build` + ESLint clean; no new migration
- [x] Adversarial review (7 lenses, per-finding 2-verifier, 45 agents); 19 → 12 confirmed-both + 1 single-vote → all 13 addressed (incl. CRITICAL grant-escalation), 6 rejected

## Session 10 — Testing + Deployment + Optimization + Handover ✅ (FINAL of the original plan)
- [x] Full test gate: **307 static** + **344 with live** (smoke 8 / cms 8 / year 6 / org 4 / events 10 / resources 4 / media 3 / devconsole 10 / users 6) green on warm Neon
- [x] CI workflow (`.github/workflows/ci.yml`): static suite + `npm run lint` + build on push/PR; live-DB nightly/manual + secret-gated (DL-052); added `npm run lint` (Next 16 dropped `next lint`) + `backups/**` ignore
- [x] Public CWV (DL-053): Cloudinary `f_auto,q_auto` (`cloudinaryAutoUrl`) + `next/image` `sizes` + AVIF/WebP; font consolidation to one `next/font` load (#12); brand-blue unified to `#003f87` (#11)
- [x] Responsive: admin mobile sidebar toggle wired (`AdminShell` + `admin.css`)
- [x] Deploy hardening (DL-054/055): security headers; CSRF same-origin + per-process rate limiter (`lib/http/guard.mjs`) on `POST /api/admin/action` + `/api/events`; NFT #32 decided (accept + `outputFileTracingIncludes`)
- [x] Prune V1 leftovers (DL-056): removed `app/page1.js` (#10) + the four `app/Clubs/*` (#13) with Header nav cutover to `/org/councils/<slug>`; `/public` left for the operator (#18, runbook §3.1)
- [x] Handover: `docs/OPERATIONS_RUNBOOK.md` + refreshed DEPLOYMENT.md/docs/README.md + final docs sweep
- [x] Adversarial review (5 dimensions, 13 agents, 2 verifiers/finding): 1 confirmed (CI `if`-scope bug, fixed) + 3 rejected (2 tidied anyway); `next build` + ESLint clean; no new migration
- [x] New static tests: `tests/security.test.mjs` (16) + `cloudinaryAutoUrl` (6)

## Session 11+ — Member platform (NEW features, multi-session PROGRAM — DL-057, expanded)
A large operator-requested program; **one module per session**, built on the spine.
Suggested order M0 → M2 → M1 → M7/M8 → M3 → M4 → M5 → M6. Full prompt:
[NEXT_TASK.md](NEXT_TASK.md).
- [x] **Plugin control plane** (Session 11) — `feature_flag` table + `lib/platform/flags.mjs`; the whole member platform is gated behind the developer-toggled `member_platform` flag (fail-closed read; `/admin/plugins` UI; DL-058)
- [x] **M0 Auth & accounts** (Session 11) — email+password ONLY *within the plugin* (Google rejected when on, kept when off — DL-059); admin-provisioned (single + **bulk CSV**, external mail); `must_change_password` + forced first-login change (edge `middleware.js` + pure helper); admin-mediated forgot/reset (public form → `notification` queue → "Fix"=assign → generate → resolve, DL-060); account-request flow; **delete users** + escalation parity (DL-061). 344 static + 8 live (`m0.db.test.mjs`); migration `20260630120000_member_platform_m0`
- [x] **M1 User status** (Session 11) — `UserStatus` forward-migrated to active/inactive/revoked via a CREATE-style enum swap + backfill (suspended/invited→inactive, disabled→revoked; migration `20260630160000_member_platform_m1`, applied), enforced LIVE (DL-065): login admits inactive / rejects revoked (`authorizeCredentials` + `signIn`), `requireMember()` (member view, admits inactive) vs active-only `requireUser()` (back office), reusable active-only `assertCanParticipate()` (M5 seam), `requireScopedPermission()`. Pure client-safe `lib/auth/access.mjs` is the single source of truth. Three surfaces + scoped route RBAC reuse the resolver's scope matching (DL-066; minimal `app/member` view + `loadMemberContext`). Per-account `allow_normal_view` toggle (DL-067). Plus the pending `role_assignment(user_id,revoked_at)` index migration (`20260630150000_…`). **392 static** (+`access.test.mjs` 13) + **6 live** (`m1.db.test.mjs`); full live 80; adversarial review (6 dimensions × 2 verifiers)
- [x] **M2 RBAC categories + overrides** (Session 11) — 6 seeded "category" roles (normal_user/co_coordinator/coordinator/secretary/staff/admin) + a new `user_permission_override` (grant/deny, optional scope) extending `resolveEffectivePermissions` (additive role union THEN overrides, **deny wins** — revises DL-026 #8; keeps the developer/grants_all short-circuit + a new grant escalation guard, DL-062/063); email-format smart search (pure `lib/users/search.mjs` reusing `parseInstituteEmail` + a debounced admin filter by year/level/branch/category/status, DL-064). Migration `20260630140000_member_platform_m2` (applied); +33 static (379) + 7 live (`m2.db.test.mjs`); 12-agent review (0 confirmed, 1 single-vote drift fixed)
- [x] **M3 Club pages + memberships** (Session 11) — ONE tabbed club/council renderer (`OrgUnitTabs` over `getClubPageView`: Overview/Announcements/Upcoming/Past-events/**Achievements-stub**/Resources/Documents; custom roles via `appointment.title_override`; DL-079). NEW standalone **`club_membership`** M-M (`app_user`↔`org_unit_lineage`, durable, `UNIQUE(user,lineage)`; `lib/memberships/{service,forms}.mjs`) gated by a NEW scoped **`membership.manage`** (DL-066/075) + an idempotent bulk **CSV importer** (reports missing accounts). NEW **`club_doc`** content type reusing `page_block_payload` for **markdown docs** (DL-076) with a PURE escape-first **`renderMarkdown`** (DL-077); **club announcements/events** via `content_item.orgUnitId` + opt-in **`announcement_payload.sync_to_central`** to the central board (DL-078). "My clubs" on `/member`; the M8 **usage beacon** wired (closes #41). Migration `20260701120000_member_platform_m3` (additive); +1 perm (**51**). **448 static** + written live `m3.db` (run after operator `db:migrate`+`db:seed`, #42); 14-agent review (4 findings → all fixed)
- [x] **M4 Wall of Fame** (Session 11) — NEW `content_type='achievement'` (year-scoped, NOT org-bound) via the CMS spine with its OWN `achievement_payload` = typed scalars + a `blocks` **JSONB** of HYBRID ordered blocks (markdown/markdown+image/banner/link/gallery, DL-016/080); pure client-safe `lib/achievements/forms.mjs` validates+normalizes via a NEW generic-handler `coercePayload` hook; markdown via escape-first `renderMarkdown` (DL-077), media via `cloudinaryAutoUrl` (DL-053). NEW standalone **`achievement_credit`** (member **OR** club, exactly-one-target CHECK + two per-target uniques, DL-081); `setAchievementCredits` replace-all (audited, authorize `content.update` at the YEAR scope — central curation, DL-082; reuses `content.*`, **NO new perm — 51**). Public **`/wall-of-fame`** (Server Component, plugin-gated, PII-minimized) + the M3 club **Achievements tab** via `getClubPageView`; `AchievementCard` + Header nav. Migration `20260701130000_member_platform_m4` (additive, applied). **466 static** + `tests/m4.db.test.mjs` **6/6 green** (m3.db re-ran 10/10 after the DL-083 fix); 8-agent review (1 confirmed PII leak → fixed + regression-locked). **Fixed a latent M3 bug (DL-083):** the generic `writePayload` now `UPDATE`s (not `upsert`s) on a partial edit → **#42 cleared**
- [x] **M5 Event Playground** (Session 11) — the event stays a versioned `content_type='event'` content_item enriched with a markdown **problem statement** + **eligibility** + **category** + a `blocks` **JSONB** of HYBRID ordered blocks (M4 block model reused via a NEW `coercePayload` hook, DL-084) + a standalone operational subsystem keyed on the durable event: **`event_organizer`** (organizer/collaborator tagging, one-target over {club-lineage, custom `event_entity`, member}, DL-085), **`event_settings`** (capacity/window), **`event_round`**, **`event_registration`** (partial-unique dedup + capacity→WAITLIST via a DEFERRED cardinality guard + auto-promote, DL-087), **`event_score`** + **`event_attendance`** (round + overall replace-set sheets → read-layer ranking via the pure `rankEntries`), **`event_closure_report`** (optional markdown; organizer submits → central review + corrected budget, DL-088). NEW **`event.manage`** perm (**52**) + the **`assertEventManage`** seam (GLOBAL or scoped-to-organizing-lineage, DL-086); LOGIN-ONLY member participation via `POST /api/events/participate` (`requireMember` + `assertCanParticipate`); CSV downloads via `GET /api/events/export`; a curated **"Events Organized"** `content_type='events_organized'` doc (**13** content types) with an audited **change-history M8 dev-dashboard tab** (DL-089). Surfaces `/events` (login-only playground / public-when-off), `/events/[slug]`, `/events/organized`, `/admin/events`. Migration `20260701140000_member_platform_m5` (additive, applied). **497 static** (+`events-playground.test.mjs` 23) + `tests/m5.db.test.mjs` **10/10 green**; 6-dimension × 2-verifier review
- [x] **M6 Profiles** (Session 11) — a READ-ONLY aggregation module over the durable M4/M5 ids (DL-090/091/092/093): a member **profile** (`lib/member/profile.mjs#getMemberProfile` — identity via `parseInstituteEmail`, roles/category from `role_assignment`, affiliations from `club_membership` + a DERIVED currently-empty **syndicate** facet, **category-mapped events** = registrations ∪ scores ∪ attendance with the member's OVERALL **rank** via the pure `rankEntries` = M5 `getOverallRanking` semantics, and credited **achievements** via a NEW `listMemberAchievements`). Per-stakeholder **institute contribution** across a year for a member/club/entity (`lib/member/contribution.mjs` — organized/participated/achievements/roles/members/**participants-reached** as a PII-minimized distinct COUNT), reusing `listClub/MemberAchievements` + `getMembershipCountForUnit`. Pure client-safe `lib/member/summary.mjs`. Surfaces: **`/member/profile`** (self, own data), **`/admin/users/[userId]`** (admin, `user.read`), **`/admin/contribution`** explorer (NEW `contribution` nav module, `user.read`) — all shared **Server Components** (PII stays server-side). **NO new table/permission/migration; permissions stay 52, content types 13.** **516 static** (+`member-profile.test.mjs` 19) + `tests/m6.db.test.mjs` **8/8 green** (m5 10/10, m4 6/6, m3 10/10 re-verified); 14-agent review (0 confirmed-both, 2 single-vote → both fixed: a profile double-read → `getMemberProfileView`; a weak rank test → an overall-score-row fixture). **This completes the M0–M8 program.**
- [x] **M7 Notifications/feedback/announcements** (Session 11) — `notification` generalized (label + keyset `listNotificationsPage` + generic deduped `createNotification`; DL-069); NEW standalone `feedback` table (FB-NNNNN ref id + CHECK status workflow, public `POST /api/feedback`, audited assign/resolve, `lib/feedback/{forms,service}.mjs`; DL-070) + public `/feedback` form + admin Feedback module; pure `groupByWindow` past/current/upcoming primitive (DL-074). [club-announcement sync lands with M3]
- [x] **M8 Dev dashboard** (Session 11) — Action Log JSON/CSV export (`exportAuditLog`, PII-minimized; DL-068); hidden usage analytics (`page_visit` + best-effort `recordPageVisit` + `/api/usage` beacon + `getUsageAnalytics`; DL-071); per-table size thresholds + flagged report + `exportTable`→backup_record + allowlisted/confirm-gated `truncateTable` (`lib/devconsole/storage.mjs`; DL-072); bulk rate-limited mail with progress + authorized-sender allowlist + lazy/injectable nodemailer (`lib/mail/*`; DL-073); admin Mail + Developer Dashboard modules. +5 perms (50 total). Migration `20260630170000_member_platform_m7m8`; **415 static + 7 live (m7.db 4 + m8.db 3)**; 20-agent review (3 confirmed-both + 2 single-vote → all fixed). [Neon/Cloudinary resource monitoring reuses the existing `getInfraUsage`]
- [x] Cross-cutting: audit every cross-stakeholder action; structure data + services for a future AI agent layer (M8 audit export + the Session-12 full-site audit confirm every mutation is attributed)

## Session 12 — Consolidation / deploy-hardening (no new module) ✅
Full-site hardening treating the app as if hosted; details in [docs/CONSOLIDATION_BUGLOG.md](docs/CONSOLIDATION_BUGLOG.md) + DL-094/095.
- [x] Full test gate: **517 static** + `npm run lint` + `next build` clean; every live suite re-run PER-FILE single-fork on warm Neon (Sessions 1–10 + m0–m8) — green
- [x] DB confirmed migrated (11 migrations up to date) + seeded (52 perms / 11 roles / 13 content types; `member_platform` ON)
- [x] CI (DL-094): nightly/secret-gated live job warms Neon (`migrate deploy`) + runs `--pool=forks --poolOptions.forks.singleFork` (m0–m8 + Sessions 1–10; the #39 remedy)
- [x] Route-render smoke: `scripts/route-smoke.mjs` + `npm run test:routes` (fails on any 5xx; resolves real dynamic params)
- [x] Testing SOP: `docs/WEBSITE_TESTING_SOP.md` (four-layer, per-mode, 11-role × 3-status matrix + feature checklist + bug-log loop)
- [x] Member nav: `MemberNav` + client `SignOutButton` on `/member` + `/member/profile` (NEXT_TASK #3)
- [x] Full-site per-role audit → **21 confirmed defects → 11 fixed** (B1–B11) + **10 documented-as-accepted** (KNOWN_ISSUES #45–#47 + minor): the inactive+must-change lockout (new `requireLoggedInAccount`), the `/events/[slug]` revoked/view-disabled gate, the unstyled sign-in card, capacity-raise waitlist promotion, the non-destructive membership importer, a shared CSV formula-injection guard (`lib/csv/cell.mjs`), the export empty-roundId 500, reopen-clears-note, fail-closed export auditing, the credited-club link, member sign-out
- [x] New static (CSV-injection) + m3/m5/m7 live regression assertions; adversarial diff-review found **0 regressions**; no schema change
- [x] OPTIONAL (future): scoped-coordinator admin surface reusing `assertEventManage` (KNOWN_ISSUES #43) — **done in Session 13 (DL-096)**

## Session 13 — Scoped-coordinator surface + delivery docs ✅ (DL-096)
The one remaining OPTIONAL dev item, plus the client-facing hand-over documentation.
- [x] Standalone **`/coordinator`** surface (own `loadCoordinatorContext`, NOT under the global `/admin` gate; plugin-independent + active-only): landing (my units), events list → per-event manage (settings/rounds/registrations/scores/attendance/closure-submit + CSV), members (roster + add/status/remove + non-destructive CSV import), contribution (M6 club slice via `ContributionSummary`)
- [x] **`lib/rbac/grants.mjs`** — inverse-of-the-resolver scoped-grant discovery (`scopedLineagesFor` reuses `resolveEffectivePermissions` for exact parity; `listManageableLineages` resolves to current-year unit display) + a behaviour-preserving extraction `loadUserRbacInputs` in `lib/rbac/authorize.mjs`
- [x] **`lib/events/manage.mjs`** — `listEventsForManager(lineageKeys)` + `getManagedEvent(eventItemId, actor)` (gated by `assertEventManage`, composes the existing gated sub-reads → live data)
- [x] Central-only actions (organizer tagging, custom entities, closure **review**) stay `requireGlobal` and are absent from the surface; every action re-authorizes via the existing seams. **No new permission/table/migration/mutation** (52 perms, 13 content types)
- [x] `coordinates` flag on `loadMemberContext` + a `/member` link
- [x] Tests: **530 static** (+`coordinator.test.mjs` 13) + `coordinator.db.test.mjs` **5/5 green**; m5/m1 re-run green; route-smoke + `/coordinator` routes; `lint` + `build` clean; 5-dimension × 2-verifier review
- [x] Delivery docs (repo root): `Notebook.md`, `USER_MANUAL.md`, `RESOURCES.md`, `INVESTOR_EMAIL.md`, `ANNOUNCEMENT_EMAIL.md`, `DELIVERABLES_INDEX.md`, `CLIENT_INSTRUCTIONS.md`

## Session 14 — Quick-wins bundle + VM hosting spec ✅ (2026-07-02)
- [x] `systemRequirements.md` — single-VM hosting spec (Docker Postgres 16, TLS/proxy, PM2, backups, Tier-A/B sizing; self-hosted SSE + Redis chosen for live quizzes)
- [x] Per-event allowed registrant roles — migration + `EventSettings.allowedRegistrantRoles` + `registerForEvent` gate + checkbox UIs + pure helpers/tests (DL-097)
- [x] Scheduled go-live + live countdown register button + "Go live now" (DL-098)
- [x] Multi-club event listing — `listClubEvents` unions orgUnitId + `event_organizer` lineage (DL-099)
- [x] Resource cards render all data types + responsive 4-col grid (DL-100); confirmed the 4 Cloudinary PDFs are importer-ready
- [x] Wall-of-Fame credits admin UI wiring `achievement.credits.set` (DL-101)
- [x] Bulk grant/deny permission-override checkbox grid + `setUserOverrides` (DL-102)
- [x] Validate: prisma generate + 536 static tests + lint + build; 4-lens adversarial review → 1 confirmed bug fixed (admin settings preload)
- [ ] **Apply the migration in each environment:** `npm run db:migrate` (adds `event_settings.allowed_registrant_roles`)
- [ ] Add live-DB coverage for the multi-club listing + eligibility gate + bulk overrides (RUN_DB_TESTS=1) — pure helpers are covered; the DB paths are not yet
- [ ] **Deferred dev work (next):** inline edit-on-public-page; live quizzes + leaderboards (SSE + Redis, Tier B) — see NEXT_TASK.md

## Operator-owned (out-of-band — see OPERATIONS_RUNBOOK.md)
- [ ] Run `db:import:org` → `db:import:events` → `db:import:resources` against 2025-26 (#27) — `db:import:resources` publishes the 4 infrastructure PDFs onto the resources page
- [ ] Run the media migration (`db:migrate:media -- --apply`) + safe `/public` prune (#18)

## Owner-owned (out-of-band)
- [ ] Rotate/remove V1 leaked secrets in `README.md` (KNOWN_ISSUES #1); then drop the `.gitleaks.toml` by-SHA allowlist
- [ ] Consider rotating Neon password if the sharing channel isn't private (#19)
