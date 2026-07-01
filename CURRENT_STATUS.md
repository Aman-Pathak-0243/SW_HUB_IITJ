# Current Status

**Last updated:** 2026-07-01
**Session:** 12 — **CONSOLIDATION / DEPLOY-HARDENING COMPLETE** (no new module): the full
four-layer test gate (static → live per-file/single-fork → route-render smoke → per-mode
functional audit), a repeatable `docs/WEBSITE_TESTING_SOP.md`, a single-fork nightly CI live
job, a small logged-in-member nav, and **11 bug fixes** from a full-site per-role audit
(the rest documented-as-accepted). Built on the complete **M0–M8** member-platform program.
**Project status:** ✅ Sessions 1–10 shipped; ✅ Session 11 program M0–M8 complete;
✅ Session 12 consolidation/hardening complete. **Next: operator/owner backlog** (live-data
imports + media migration + V1 secret rotation) — see NEXT_TASK.md.
**Branch:** `portal-v2`

## What is done (Session 12 — consolidation / deploy-hardening)

- **Full test gate.** 517 static tests + `npm run lint` + `next build` clean. Every live suite
  re-run PER-FILE, single-fork, on a warm Neon (`cms/year/org/events/resources/media/devconsole/
  users/smoke` + `m0.db…m8.db`) — green. DB confirmed migrated (11 migrations, up to date) +
  seeded (52 permissions / 11 roles / 13 content types; `member_platform` flag ON).
- **CI (DL-094).** The nightly/secret-gated live job now warms Neon (`prisma migrate deploy`) and
  runs `--pool=forks --poolOptions.forks.singleFork` — the whole live suite (m0–m8 + Sessions 1–10)
  serialized, the documented KNOWN_ISSUES #39 remedy.
- **Route-render smoke (DL-094).** `scripts/route-smoke.mjs` + `npm run test:routes` — hits every
  route anonymously and fails on any 5xx; the reusable "is the hosted site up?" check.
- **Testing SOP (DL-094).** `docs/WEBSITE_TESTING_SOP.md` — the repeatable per-mode full-site
  procedure (11-role × 3-status matrix, feature-by-feature allow/deny checklist, plugin ON/OFF,
  bug-log→fix→re-verify loop).
- **Member nav (DL-094).** `MemberNav` + `SignOutButton` on `/member` + `/member/profile`.
- **Full-site bug audit → 11 fixes (DL-095; `docs/CONSOLIDATION_BUGLOG.md`).** A per-feature ×
  per-role adversarial audit found 21 confirmed defects → 11 fixed (B1 inactive+must-change lockout
  via the new `requireLoggedInAccount` boundary; B2 the `/events/[slug]` revoked/view-disabled gate;
  B3 the unstyled sign-in card; B4 capacity-raise waitlist promotion; B5 the non-destructive
  membership re-import; B6 a shared CSV formula-injection guard `lib/csv/cell.mjs`; B7 the export
  empty-roundId 500; B8 reopen-clears-note; B9 fail-closed export auditing; B10 the credited-club
  link; B11 member sign-out) + 10 documented-as-accepted (KNOWN_ISSUES #45–#47 + minor items).
  New static + m3/m5/m7 live regression assertions; the adversarial diff-review workflow found
  **0 regressions**. No schema change (permissions stay 52, content types 13).

## What is done (Session 11 — M6: Member profiles & performance)

- **M6 is a READ-ONLY aggregation module — NO new table / permission / mutation (DL-090).**
  It reads the DURABLE ids M4/M5 already persist (`achievement_credit.userId|orgUnitLineageKey`,
  `event_organizer`'s three targets, `event_registration`/`event_score`/`event_attendance.userId`,
  `club_membership`, `role_assignment`), so there is **no new migration and no new `content_type`**;
  the self profile is gated by the M1 member boundary (own data), and every admin surface by the
  **existing `user.read`** (permissions stay at **52**, content types at **13**). "Syndicate (if
  any)" is a DERIVED, currently-empty facet (the org model has no syndicate unit type — a syndicate
  is an `event_entity`, DL-085); M6 does not invent a member↔syndicate table.
- **Profile read layer (DL-091).** [lib/member/profile.mjs](lib/member/profile.mjs) — `getMemberProfile`
  aggregates identity (`parseInstituteEmail` facets), roles/category (active `role_assignment` +
  resolved scope-unit names), affiliations (`club_membership` → current-year unit names + the derived
  syndicate), full EVENT INVOLVEMENT, and the member's credited ACHIEVEMENTS (a NEW
  [lib/achievements/public.mjs](lib/achievements/public.mjs)#`listMemberAchievements`, mirroring the
  club slice). Event history is ONE batched aggregation of registrations ∪ own-scores ∪ attendance;
  the member's OVERALL RANK per event is computed in-memory from a single all-scores fetch via the
  pure `rankEntries` — the SAME sum-across-(round + overall) semantic as M5 `getOverallRanking`, so the
  profile number equals the event-page number. Events are all-time (durable); achievements follow M4
  current-year visibility. `getMemberProfileView` composes profile+contribution for the pages.
- **Institute contribution (DL-092).** [lib/member/contribution.mjs](lib/member/contribution.mjs) —
  `getMemberContribution` / `getClubContribution` / `getEntityContribution` (+ a `getStakeholderContribution`
  dispatcher, + `listContributionStakeholders` for the picker) aggregate a stakeholder's year
  contribution by durable id: events organized, participated, achievements credited, roles, members,
  and distinct **participants reached** (a COUNT, never a roster — PII-minimized). Reuses `listClub/
  MemberAchievements` + `getMembershipCountForUnit`; batched (bounded per stakeholder, one in-year
  resolve + one distinct-count). A pure `contributionTotals` yields the headline "touchpoints".
- **Pure client-safe helpers (DL-093/051).** [lib/member/summary.mjs](lib/member/summary.mjs) —
  `splitMemberEvents` / `categoryBreakdown` / `participationSummary` / `formatIdentity` /
  `contributionTotals` / `pickSyndicate` — one authority for split/category-mapping/totals/identity,
  imported by BOTH the Server-Component reads AND the presentation, unit-tested without a DB.
- **Surfaces (DL-093).** Self **`/member/profile`** (gated by `loadMemberContext` — own data; linked
  from `/member`), admin **`/admin/users/[userId]`** (gated `loadModuleContext('users')` + explicit
  `user.read`; linked per-row from the Users list), and a **`/admin/contribution`** explorer (member/
  club/entity, driven by query params — Server-Component GETs, no API route) behind a NEW
  **`contribution`** nav module (`anyOf:['user.read']`). Rendering is TWO shared **Server Components**
  ([MemberProfile](app/components/MemberProfile.jsx) / [ContributionSummary](app/components/ContributionSummary.jsx))
  so member PII stays server-side (only HTML ships); the one client component (the picker) gets only
  public club/entity names.
- **Tests.** **516 static** (was 497; +`tests/member-profile.test.mjs` 19 — the pure split/category/
  summary/identity/totals helpers + the `contribution` nav registration + the no-new-permission
  invariant) + a NEW live suite `tests/m6.db.test.mjs` (**8/8 green** on warm Neon, isolated per #39):
  profile aggregation (identity/roles/affiliations/events with SUM-based rank/achievements + a PII
  no-uuid/email assertion on credited members), member contribution counts + year-scoping-to-zero,
  club + entity contribution, the dispatcher (member-by-email/club/entity + unknown→null),
  `listMemberAchievements`, and empty-account safety (valid empty shape vs unknown-id→null). The
  M5/M4/M3 live suites were re-run green on a warm Neon (m5 10/10, m4 6/6, m3 10/10). `npm run lint`
  + `next build` clean.
- **Adversarial review** — a 6-dimension finder → per-finding 2-verifier workflow (14 agents).
  **4 raw → 0 confirmed-by-both + 2 single-vote (2 refuted) → both single-votes fixed + both refuted
  nits hardened anyway:** (medium, perf) the two profile surfaces re-ran the heaviest read
  (`listMemberAchievements`) + the current-year lookup TWICE per render → a ONE `getMemberProfileView`
  composite now hydrates the achievements + year ONCE and injects them into both aggregators (a
  `_achievements` seam); (medium, test) the rank assertion used a single-round/single-score fixture
  that could not distinguish the sum-across-rounds semantic → the fixture now adds an OVERALL score
  row so memberA (40 round + 60 overall = 100) outranks memberB (90) ONLY when the rows are summed.
  Hardened the two refuted nits anyway (a credited-member PII no-uuid/email assertion; empty-account
  `roles`/`syndicate` assertions). All re-verified: 516 static + m6.db 8/8 green, lint + build clean.

## What is done (Session 11 — M5: Centralized Event Playground)

- **Event = content_item + a relational subsystem (DL-084).** The event stays a versioned
  `content_type='event'` (DL-037); its CONTENT gains `problem_statement` + `eligibility` (markdown),
  `category` (an M6 facet), and a `blocks` **JSONB** of HYBRID ordered blocks — the M4 block model
  reused via a NEW `coercePayload` hook on the `event_payload` handler (the pure client-safe
  [lib/events/forms.mjs](lib/events/forms.mjs)#`normalizeEventPayload` reuses `normalizeBlocks`,
  DL-051). OPERATIONAL data lives in standalone tables keyed on the DURABLE event item; registration
  CONFIG (capacity / window / a `registration_closed` switch) is a 1:1 `event_settings` — NOT the
  versioned payload (so the waitlist guard reads one stable number).
- **Organizer/collaborator tagging + custom entities (DL-085).** [event_organizer](prisma/schema.prisma)
  credits an event to EXACTLY ONE of {a club `org_unit_lineage`, a custom `event_entity`, a member
  `app_user`} (a raw-SQL one-target CHECK + three per-target uniques) with a `kind`
  (organizer|collaborator) + role tag; `setEventOrganizers` REPLACES the set (one audit row).
  Tagging is CENTRAL (`requireGlobal` event.manage) and a tagged organizing CLUB lineage is the
  scope at which that club's coordinator gains management access. Custom entities (a syndicate /
  external partner) are admin/dev-defined, durable, and feed M6 by durable id.
- **The `event.manage` seam (DL-086).** ONE new permission (→ **52**) + [lib/events/authz.mjs](lib/events/authz.mjs)#`assertEventManage`:
  GLOBAL (staff/admin/dev — an unscoped grant) OR SCOPED to any organizing club lineage (a
  coordinator runs their own event); the RBAC resolver's `inScope()` keeps a club-scoped grant from
  passing the global check (DL-082 parity), verified live. Member participation is LOGIN-ONLY via the
  gated `POST /api/events/participate` (plugin + CSRF + rate-limit + `requireMember`) → the M1
  `assertCanParticipate()` active-only seam (inactive browses but cannot register, verified live).
- **Registration + waitlist + rounds + scoring + attendance (DL-087).** [event_registration](lib/events/registration.mjs)
  dedups active registrations (partial-unique WHERE status<>'cancelled'); capacity → WAITLIST is a
  service decision (`registrationOutcome`) backstopped by a DEFERRED cardinality trigger reading
  `event_settings.capacity` (DL-009/021 reuse) with a race-retry; cancelling a confirmed spot
  auto-promotes the earliest waitlisted (verified live). `event_round` (stages); `event_score` +
  `event_attendance` are per-round (round_id) or overall (round_id NULL, a partial unique) submitted
  as replace-set SHEETS (one summary audit row, missing emails reported). RANKING is computed in the
  read layer — per-round (by points) + overall (sum) — via the PURE `rankEntries` (standard
  competition rank), batched (the detail builds all rankings from ONE score fetch).
- **CSV downloads + closure + Events Organized (DL-087/088/089).** [exportEventCsv](lib/events/downloads.mjs)
  (participants / scores / attendance / ranking, round + overall) via `GET /api/events/export`, gated
  by `assertEventManage`. An OPTIONAL markdown `event_closure_report` per (event, submitter): role +
  contribution + self-reported budget (submitted by an organizer), reviewed CENTRALLY (comment +
  corrected budget; a scoped coordinator cannot review — verified live); data-issue feedback reuses
  M7. The "Events Organized" curated doc is a NEW `content_type='events_organized'` (page_block
  markdown, → **13** content types) edited through the CMS — so every add/update is audited
  (before/after) + version-diffable — with a data-driven organized-events index; its change history
  is visible + downloadable from a NAMED **M8 developer-dashboard tab** ([getEventsOrganizedChangeHistory](lib/events/organized.mjs)
  / `exportEventsOrganizedHistory`, gated `audit.read`).
- **Surfaces.** Login-only playground at **`/events`** (plugin ON; the public Sessions-1–10 board
  when OFF) + event detail **`/events/[slug]`** (hybrid content, rounds, live rankings, register/
  waitlist) + **`/events/organized`**; admin **`/admin/events`** management module; the M8 dev-dash
  change-history tab. Every management mutation posts to the ONE `POST /api/admin/action` registry
  (16 scoped M5 actions; each service re-authorizes via `assertEventManage`).
- **Schema.** One additive forward migration `20260701140000_member_platform_m5` (8 tables + the 4
  `event_payload` columns + FKs/uniques/CHECKs + the deferred capacity trigger), applied to Neon via
  `migrate deploy`; init untouched (DL-027). 8 new models registered in `TABLE_BY_MODEL` +
  `AUTO_AUDIT_SKIP`. `event.manage` + `events_organized` are seed DATA. **Permissions → 52; content
  types → 13.**
- **Tests.** **497 static** (was 466; +`tests/events-playground.test.mjs` 23 — payload/organizer/
  round/capacity/registration/scoring/budget validators, `rankEntries`, CSV quoting; +the M5
  migration block; +the `event.manage` RBAC assertion) + a NEW live suite `tests/m5.db.test.mjs`
  (**10/10 green** on warm Neon, isolated per #39): hybrid-content playground read, organizer tagging
  (one-target + central-vs-scoped), the `assertEventManage` seam, registration + capacity→waitlist +
  auto-promote + dedup + inactive-blocked, scores→ranking, attendance, closure submit-vs-central-
  review, CSV downloads, roster PII gating, and the Events-Organized change history + export gate.
  The static suite caught + fixed a real `trimOrNull` normalizer bug (it didn't trim). `npm run lint`
  + `next build` clean.
- **Adversarial review** — a 6-dimension finder → per-finding 2-verifier workflow (30 agents).
  **12 raw → 4 confirmed-by-both + 5 single-vote (3 refuted) → all 9 legitimate ones fixed:**
  (medium) an organizer cancel/remove of a CONFIRMED registration did NOT auto-promote the waitlist
  (a freed seat was stranded — only a member self-cancel promoted) → `promoteEarliestWaitlisted` now
  runs from EVERY seat-vacating path (self-cancel + organizer cancel/remove/downgrade) + a live
  assertion; (medium) `promoteEarliestWaitlisted` used a non-locking select, so two concurrent
  confirmed-cancellations could promote the SAME earliest row and leave a seat empty → the earliest
  waitlisted row is now `SELECT … FOR UPDATE SKIP LOCKED` so concurrent promotions pick DISTINCT rows;
  (medium) editing a round via the admin form silently wiped its start/end dates (blank inputs sent as
  "clear") → the edit form sends ONLY the fields the user filled (blank = leave unchanged); (low)
  `/events/organized` rendered member content for revoked / view-disabled accounts (only
  `unauthenticated` was blocked) → now mirrors `/events` and holds them out; (single-vote, PII) the
  playground / scoring / organizer PUBLIC shapes serialized the internal `app_user` uuid → stripped to
  display-NAME-only (DL-082 parity) + a live no-uuid assertion; (single-vote) a re-submitted closure
  report kept a stale reviewer/comment/corrected-budget → cleared on re-submit. The 3 refuted were
  design-intent nits. All fixes re-verified: 497 static + m5.db **10/10** green, lint + build clean.

## What is done (Session 11 — M4: Wall of Fame / student achievements)

- **Achievement content (DL-080).** A NEW **`content_type='achievement'`** — year-scoped,
  **NOT org-bound** — driven through the ordinary CMS service (create/edit/publish via the
  `content.*` admin actions; no parallel pipeline). Its OWN payload table
  **`achievement_payload`** (1:1 with `content_revision`) holds typed scalars (`category`,
  `achievement_date`, `hero_media_id`) + a **`blocks` JSONB** of HYBRID ordered blocks
  (markdown / markdown+image / banner / link / gallery, DL-016). The pure client-safe
  [lib/achievements/forms.mjs](lib/achievements/forms.mjs) (`normalizeBlocks`/
  `normalizeAchievementPayload`/`creditTargetKind`) validates + normalizes blocks and runs
  server-side via a NEW generic-handler **`coercePayload`** hook (throws 422 on a bad block).
  Markdown is stored RAW and rendered by the escape-first [renderMarkdown](lib/markdown/render.mjs)
  (DL-077); link urls reuse `isSafeHref`. Media reuse `resolveDeliveryUrl` + `cloudinaryAutoUrl` (DL-053).
- **Contribution mapping (DL-081).** A NEW standalone **`achievement_credit`** table crediting
  one achievement to a **MEMBER (`app_user`)** *or* a **CLUB (`org_unit_lineage`)** — each row
  EXACTLY ONE target (a raw-SQL CHECK) + two per-target uniques; durable ids so a member's and a
  club's contributions are trackable across a year (feeds M6). [lib/achievements/credits.mjs](lib/achievements/credits.mjs)#`setAchievementCredits`
  REPLACES the credit set idempotently (authorize `content.update` at the achievement's YEAR
  scope FIRST; ONE semantic audit summary row; missing emails REPORTED not created).
  `AchievementCredit` ∈ `AUTO_AUDIT_SKIP`. Registry action `achievement.credits.set` (scoped).
- **Central curation + public surfaces (DL-082).** Achievements are institute-level; they reuse
  the **`content.*`** permission set (**NO new permission — still 51**) and credit management
  authorizes at the YEAR scope, so a unit-scoped coordinator is 403 (verified live). Public
  reads ([lib/achievements/public.mjs](lib/achievements/public.mjs)): `listWallOfFame` /
  `getAchievementBySlug` / `listClubAchievements` — Server-Component, BATCHED (no N+1),
  PII-minimized (credited members appear by display **NAME only** — the app_user uuid is never
  serialized to the client). Public **`/wall-of-fame`** (plugin-gated, fail-closed) + the M3 club
  page's **Achievements tab** filled by `getClubPageView` → `view.achievements` (keyed on the
  club's DURABLE lineage). Shared renderer [AchievementCard](app/components/AchievementCard.jsx)
  (+ a `Wall of Fame` header nav link).
- **Shared-handler fix (DL-083).** The generic `writePayload` now uses **`UPDATE`** (not `upsert`)
  on a partial edit (`isCreate:false`) — the payload row always pre-exists on edit, and Prisma
  STATICALLY requires the `upsert.create` branch to carry NOT-NULL columns (e.g. `announcement.body`).
  This was a **latent M3 bug** the FIRST live run of `tests/m3.db.test.mjs` surfaced (the
  club-announcement sync test edits `{syncToCentral:true}` alone) — now fixed; **KNOWN_ISSUES #42
  cleared** (the M3 live suite is green).
- **Schema.** One additive forward migration `20260701130000_member_platform_m4`
  (`achievement_payload` + `achievement_credit` + FKs/uniques + the exactly-one-target CHECK),
  applied to Neon via `migrate deploy`; init untouched (DL-027). `AchievementPayload` +
  `AchievementCredit` registered in `TABLE_BY_MODEL`; `AchievementCredit` added to `AUTO_AUDIT_SKIP`.
  The `achievement` content_type is seed DATA. **Permissions unchanged (51); content types → 12.**
- **Tests.** **466 static** (was 448; +`tests/achievements.test.mjs` — block/credit validators,
  ordering, block resolution; +the M4 migration block; +the content-type allowlist) + a NEW live
  suite `tests/m4.db.test.mjs` (**6/6 green** on warm Neon, isolated per #39): create (hybrid
  blocks) → publish → wall + blocks round-trip + unpublish-hides, block-validation 422 (+ unsafe
  link), credits member+club + one-target rule + missing-email + idempotent replace, central-scope
  403 (coordinator) / 401, the club slice + `getClubPageView` Achievements tab (+ the PII no-`userId`
  assertion), non-achievement guard. The **M3 live suite re-ran 10/10 green** after the DL-083 fix.
  `npm run lint` + `next build` clean.
- **Adversarial review** — a 6-dimension finder → per-finding 2-verifier workflow (8 agents):
  **1 raw → 1 confirmed-by-both (0 single-vote) → fixed:** (low) the public achievement shape
  serialized each credited member's internal `app_user` uuid to anonymous browsers via the client
  `OrgUnitTabs` (contradicting the display-NAME-only invariant) → the `userId` is dropped from the
  public members shape + a live regression assertion added.

## What is done (Session 11 — M3: club/council pages + memberships)

- **Club memberships (DL-075).** A NEW standalone **`club_membership`** many-to-many
  (`app_user` ↔ `org_unit_lineage`) — durable across academic years (lineage-keyed, not
  per-year), `UNIQUE(user, lineage)`, `status` CHECK (active|inactive). [lib/memberships/service.mjs](lib/memberships/service.mjs)
  (add/remove/setStatus + `listMembershipsForUnit` [gated PII roster] + `getMembershipCountForUnit`
  [public aggregate] + `listUserMemberships` [self "my clubs"]) + the pure client-safe
  [lib/memberships/forms.mjs](lib/memberships/forms.mjs). A NEW **`membership.manage`** permission
  (coordinator/secretary/admin) gates every mutation SCOPED to the unit's lineage
  (`requireScopedPermission`, DL-066) BEFORE any disclosure; one semantic audit row each
  (`ClubMembership` ∈ `AUTO_AUDIT_SKIP`). An **idempotent bulk CSV importer**
  (`importClubMemberships`) syncs a coordinator-submitted email list — idempotent by
  `(user, lineage)`, reports missing accounts (never auto-creates them), ONE summary audit row (DL-031).
- **Club sub-content (DL-076).** A NEW `content_type='club_doc'` (year-scoped, org-bound) REUSES
  `page_block_payload` (markdown docs; no new payload table, DL-006), each doc its OWN lineage
  (DL-041). Club-specific **announcements** & **events** bind to the club via `content_item.orgUnitId`;
  all CRUD flows through the CMS service scoped to the club's lineage (content.* + DL-066). Public
  reads: [lib/org/docs.mjs](lib/org/docs.mjs)#`listClubDocs`, [lib/events/public.mjs](lib/events/public.mjs)#`listClubEvents`/`listClubAnnouncements`.
- **Safe markdown (DL-077).** [lib/markdown/render.mjs](lib/markdown/render.mjs): a PURE,
  dependency-free, **escape-FIRST** `renderMarkdown` (HTML escaped before any markup → injection is
  structurally impossible) + scheme-validated links (`isSafeHref` blocks `javascript:`/`data:` incl.
  control-char bypass) + `markdownPreview`. Reused by M4.
- **Announcement sync-to-central (DL-078).** Additive `announcement_payload.sync_to_central`: a club
  announcement is club-only by default and OPTS IN to also appear on the central board. The central
  read (`listPublicAnnouncements`) filters via the pure `isCentralAnnouncement` (central-or-synced);
  club listings group past/current/upcoming via `groupByWindow` (DL-074 reuse).
- **Tabbed club/council page + beacon (DL-079).** ONE data-driven [OrgUnitTabs](app/components/OrgUnitTabs.jsx)
  (Client shell) over one aggregated Server-Component read [lib/org/public.mjs](lib/org/public.mjs)#`getClubPageView`:
  Overview / Announcements / Upcoming / Past events / **Achievements (M4 stub)** / Resources /
  Documents (hostels/messes keep Overview + Resources). Custom team roles render for free via
  `appointment.title_override`. Supersedes `OrgUnitPage`. "My clubs" added to `/member`. The optional
  M8 **usage beacon** is now wired ([UsageBeacon](app/components/UsageBeacon.jsx) in the root layout →
  `POST /api/usage`), closing KNOWN_ISSUES #41.
- **Schema.** One additive forward migration `20260701120000_member_platform_m3` (`club_membership` +
  FKs/unique/CHECK + `announcement_payload.sync_to_central`); init untouched (DL-027). `ClubMembership`
  registered in `TABLE_BY_MODEL` + `AUTO_AUDIT_SKIP`. `club_doc` content_type + `membership.manage`
  permission are seed DATA. **Permissions → 51.** (Operator applies `npm run db:migrate` then
  `db:seed` on pull — both idempotent; the Prisma model now selects `sync_to_central`, so announcement
  reads require the migration applied.)
- **Tests.** **448 static** (was 415; +`tests/markdown.test.mjs` 13, +`tests/memberships.test.mjs` 14,
  +migration/rbac M3 assertions) + a NEW live suite `tests/m3.db.test.mjs` (membership idempotency +
  role-preservation + scoped 403 + PII read-gate deny, importer idempotency/missing, club_doc CRUD +
  scoped, announcement sync-to-central, club events, `getClubPageView`). `npm run lint` clean. The
  **live m3 suite is written but pending the operator's `db:migrate`+`db:seed`** — the build environment
  blocked the agent from applying a live migration (KNOWN_ISSUES #42); run it once on a warm Neon,
  isolated (per #39), after migrating.
- **Adversarial review** — a 6-dimension finder → per-finding 2-verifier workflow (14 agents):
  **4 raw → 3 confirmed-both + 1 single-vote → all 4 fixed (0 refuted):** (medium) `addMembership`
  wiped an existing role on a status-only re-add → role now preserved unless explicitly supplied
  (+ a live assertion); (low) `parseMembershipCsv` reported filtered-index line numbers → true file
  lines (+ a static assertion); (low) the m3.db teardown leaked the coordinator's `grant_role` audit
  row → tracked + cleaned; (low, single-vote) no negative-path test on the PII roster read → 401/403
  deny assertions added.

## What is done (Session 11 — M7 + M8 spine: notifications/feedback + developer dashboard)

- **M7 — notifications generalized (DL-069).** The M0 `notification` queue gains a
  free-text `label`, keyset pagination (`listNotificationsPage`, a createdAt+id composite
  cursor), and a generic deduped `createNotification` for system producers (the M8 storage
  monitor raises `threshold_alert`s through it). No parallel pipeline (extends DL-060).
- **M7 — feedback / support tickets (DL-070).** A NEW standalone `feedback` table (the
  DL-038 rule): public create with a unique `FB-NNNNN` ref id + a CHECK-guarded status
  workflow (open→triaged→in_progress→resolved/dismissed). [lib/feedback/forms.mjs](lib/feedback/forms.mjs)
  (pure client-safe validator, mirrored server-side per DL-051) + [lib/feedback/service.mjs](lib/feedback/service.mjs);
  public `POST /api/feedback` (plugin + CSRF + rate-limit; submitter linked from the
  SESSION, never the body); audited assign/status (gated `feedback.resolve`); keyset reads
  (gated `feedback.read`). Public form `/feedback` + admin `/admin/feedback`.
- **M7 — `groupByWindow` (DL-074).** A pure past/current/upcoming windowing primitive in
  [lib/events/public.mjs](lib/events/public.mjs) the announcement + event listings (and M3) share.
- **M8 — Action Log / Change History export (DL-068).** `exportAuditLog` (JSON/CSV) over the
  Session-8 audit reader, PII-minimized like the list view (DL-047), gated `audit.read`.
- **M8 — hidden usage analytics (DL-071).** A `page_visit` table (BIGSERIAL) + best-effort,
  never-audited `recordPageVisit` + the same-origin/rate-limited `POST /api/usage` beacon;
  `getUsageAnalytics` (top sections/paths) gated `dev.console`. (Client auto-beacon not yet
  wired — KNOWN_ISSUES #41.)
- **M8 — per-table storage monitoring (DL-072).** [lib/devconsole/storage.mjs](lib/devconsole/storage.mjs):
  `getTableSizes` (raw `pg_total_relation_size`), `table_threshold` (dev-only `storage.manage`,
  audited), `getStorageReport` (flags over-threshold tables NON-blocking + a deduped alert),
  `exportTable` (→ a GUARANTEED audit row + a best-effort `backup_record`) + `truncateTable`
  (allowlist `{page_visit}` + `confirm:true` + a validate-against-live-catalog injection guard).
- **M8 — bulk mail (DL-073).** [lib/mail/progress.mjs](lib/mail/progress.mjs) (pure rate-limit/
  progress) + [lib/mail/service.mjs](lib/mail/service.mjs): an `authorized_sender` allowlist
  (`mail.manage`) + rate-limited `sendBulk` (`mail.send`) with progress accounting and a LAZY +
  INJECTABLE nodemailer transport (no hard dep at import; one accounting-only audit row — no
  bodies/recipients logged). Admin `/admin/mail` + `/admin/devdash`. (Operator: `npm install
  nodemailer` + `MAIL_*` to enable real sending — KNOWN_ISSUES #40.)
- **Permissions.** +5 (`feedback.read`/`feedback.resolve`, dev-only `storage.manage`,
  `mail.send`/`mail.manage`) → **50 total**; `staff` gains feedback.read + mail.send; the
  computed `admin` gains feedback.* + mail.* but NOT the dev-only `storage.manage` (verified).
- **Schema.** One forward migration `20260630170000_member_platform_m7m8` (notification.label +
  the 4 new tables + `feedback_ref_seq` + CHECK tail), applied to Neon via `migrate deploy`
  (no drift/reset); the 4 new models registered in `TABLE_BY_MODEL` + `AUTO_AUDIT_SKIP`
  (page_visit NEVER audited). Seed re-run (50 perms, role mappings verified).
- **Tests.** **415 static** (was 393; +`tests/{feedback,mail,devdash,windows}.test.mjs`) +
  **7 new live** (`m7.db` 4 + `m8.db` 3; run isolated per #39): feedback lifecycle + closed/invalid
  guards + reopen-clears + a multi-page keyset WALK, notification dedupe/keyset, usage+storage+
  truncate guards + the export audit-trail, mail allowlist + a two-batch rate-limited send, audit
  export. `next build` + ESLint clean.
- **Adversarial review** — a 6-dimension finder → per-finding 2-verifier workflow (20 agents).
  **7 raw → 3 confirmed-by-both + 2 single-vote → all 5 fixed; 2 refuted:** (medium) `exportTable`
  swallowed its ledger write so a PII table-dump could leave no trail → a **guaranteed independent
  audit row**; (low) reopening a closed ticket kept stale `resolvedAt/By` → cleared; (high, test) the
  keyset cursor was never walked across pages → a real no-overlap walk; (low) `mailProgress` rounded
  up to 100% before the last send → floored; (high, test) the batching/pause path was never exercised
  → a two-batch test. The 2 refuted were extra coverage (threshold-alert + invalid-status) added anyway.

## What is done (Session 11 — M1: user status & access modes)

- **Three access modes (DL-065).** The `UserStatus` enum is forward-migrated from
  `{active, suspended, invited, disabled}` to **`{active, inactive, revoked}`** via a
  CREATE-style type swap + `CASE` data backfill (`suspended`/`invited` → `inactive`,
  `disabled` → `revoked`), **never an init rewrite** (DL-027). **active** = full;
  **inactive** = can log in + browse + see own achievements but **cannot participate in
  events**; **revoked** = cannot log in, sees only the public site. Migration
  `20260630160000_member_platform_m1` applied to Neon via `migrate deploy` (verified: enum
  labels correct, backfill clean, no drift/reset).
- **Live enforcement (DL-065, not in the JWT).** The single source of truth is the pure,
  client-safe [lib/auth/access.mjs](lib/auth/access.mjs) (`USER_STATUSES`/`canLogin`/
  `canParticipate`/`canViewNormal`/`describeAccess`/`resolveSurface`/`scopeMatches`),
  re-exported by `lib/users/admin.mjs` + `lib/admin/forms.mjs` (no divergent copy). Login
  (`authorizeCredentials` + the `signIn` callback) rejects `revoked` and admits `inactive`;
  [lib/auth/session.mjs](lib/auth/session.mjs) adds **`requireMember()`** (member view —
  admits active+inactive, rejects revoked + allow-normal-view-off), **`assertCanParticipate()`**
  (the reusable, active-only capability M5 will gate event participation on), and
  **`requireScopedPermission()`**; `requireUser()` stays active-only (the back office). The
  RBAC resolver already returns no permissions for non-active users (unchanged), so
  inactive/revoked have no back-office access.
- **Three surfaces + scoped route RBAC (DL-066).** A minimal member view ([app/member](app/member/page.jsx))
  behind the non-throwing [lib/member/server.mjs](lib/member/server.mjs)#`loadMemberContext`
  (states `plugin-off`→404, `unauthenticated`, `revoked`, `view-disabled`, `ok`);
  `resolveSurface` routes a logged-in user to member / admin / developer (gated on active
  status). Scoped routes (coordinator→own club, secretary→own council, staff→playground/
  central announcements) **reuse the existing `role_assignment` scope columns + the
  resolver's `inScope` matching** — no new mechanism; `scopeMatches` restates it purely
  for client-safe guards/tests.
- **Per-account "allow normal view" toggle (DL-067).** New
  `app_user.allow_normal_view boolean DEFAULT true`; set through the audited `updateUser`
  path + the `user.setAllowNormalView` registry action + a checkbox in the admin Users
  modal; withholds the member view when off (independent of status).
- **Performance.** The pending `role_assignment (user_id, revoked_at)` index (added to the
  schema with the per-request RBAC `React.cache` memo, but un-migrated) shipped as
  `20260630150000_add_roleassignment_user_index` — the hottest RBAC lookup is no longer a
  seq scan.
- **Admin UI.** The Users tab status control is Activate / Deactivate / Revoke; the status
  filter + create/edit modal use the new vocabulary; `statusTone` maps `inactive`→warn,
  `revoked`→muted.
- **Tests.** **393 static** (was 379; +`tests/access.test.mjs` 13 — the access matrix,
  surface routing, `scopeMatches`↔`inScope` parity, scoped RBAC resolution; +the flipped
  `authorizeCredentials` test, +a `signIn`-callback test, +`statusTone` inactive/revoked)
  + **6 new live** (`tests/m1.db.test.mjs`): login per status, participation, non-active→no
  back-office perms, coordinator→own-lineage-only scoped grant, the allow-normal-view
  round-trip, self-lockout. The full live suite ran **470/472** on warm Neon — the 2
  failures were transient `year.db` P2025s from running all DB suites in parallel against
  one Neon DB (the year suite mutates the shared current-year row); `year.db` re-confirmed
  **6/6 green in isolation** (M1 doesn't touch the year engine — KNOWN_ISSUES #39).
  `next build` + ESLint clean.
- **Adversarial review** — a 6-dimension finder → per-finding 2-verifier workflow (run
  twice: a nested-`parallel` script bug crashed the first Verify phase; fixed + resumed so
  the finders returned cached and only Verify re-ran). **4 raw findings → 1 confirmed-by-both
  (0 refuted) → fixed + 0 single-vote + 3 refuted:** the confirmed one — `loadMemberContext`
  fed the RAW `is_developer` to `resolveSurface`, so an **inactive developer** was routed to
  the developer surface and shown a `/admin` link the active-only admin boundary then denied
  (a dead link; no privilege leak — the boundary fails closed) — fixed by gating the surface
  developer-input on active status. The 3 refuted (test-coverage nits) — 2 addressed anyway
  (`signIn` revoked test + `statusTone` assertions).

## What is done (Session 11 — M2: RBAC categories + per-email overrides + smart search)

- **RBAC "categories" = seeded ROLES (DL-063).** Six new non-system, non-`grants_all`
  roles added to `ROLE_DEFS` (the category IS the role): `normal_user` (no back-office
  perms), `co_coordinator` (draft content), `coordinator` (full content + media =
  editor set), `secretary` (coordinator + org structure), `staff` (central content +
  `notification.read`), `admin` (the full catalog **minus** the developer-only
  `dev.console`/`backup.*`/`media.migrate`, computed so it never drifts). `developer`
  + `super_admin` stay the system bootstrap roles. `CATEGORY_ROLE_KEYS` is the search
  facet's source of truth. Seed now: **45 permissions** (+`permission.override`),
  **11 roles**, 161 role_permissions.
- **Per-email permission OVERRIDES (DL-062) — revises DL-026 #8.** New
  `user_permission_override` table `(user, permission, mode grant|deny, org-unit-lineage?
  /year? scope, reason?)`. `resolveEffectivePermissions(user, assignments, scope,
  overrides)` now does: developer short-circuit → role union → **grants_all
  short-circuit** → apply overrides (grants add, **deny wins**). The unrestricted
  bypass (developer/`grants_all`) is never restricted by an override. Service
  ([lib/users/admin.mjs](lib/users/admin.mjs)#`setUserOverride`/`removeUserOverride`/
  `listUserOverrides`): authorizes the NEW `permission.override` permission FIRST, one
  semantic audit row, upserts by `(user, permission, scope)` (a NULLS-NOT-DISTINCT
  unique = one override per scope), and a NEW escalation guard — a **grant** requires
  the actor to hold that permission (DL-049 parity); a **deny** doesn't.
- **Email-format smart search (DL-064).** New pure, client-safe
  [lib/users/search.mjs](lib/users/search.mjs) (`matchesUserFilter`/`filterUsers`/
  `userFilterFacets`/`instituteEmailPrefix`) reuses the M0 `parseInstituteEmail`
  (`<year><level u|p|r><branch><serial>@iitjammu.ac.in`). ONE predicate backs BOTH a
  **debounced** client filter (Users tab: year/level/branch/category/status + text,
  with per-row identity badges) AND the server `listUsers` (a coarse DB pre-filter —
  email-prefix `startsWith` + category join + status — refined by the same pure
  filter, so no client/server drift). Email stays the unique identifier.
- **Surfaces.** Users tab gains the debounced filter bar + a **Permission overrides**
  modal (grant/deny a catalog permission, shows current overrides); two new registry
  actions `permission.override.{set,remove}` on the ONE `POST /api/admin/action`
  (gated `permission.override`); `validateOverrideForm` mirrors the server.
- **Schema.** One forward migration (`20260630140000_member_platform_m2`: the table +
  5 FKs + a `mode` CHECK + the NULLS-NOT-DISTINCT unique), applied to Neon; init
  untouched (DL-027). `UserPermissionOverride` registered in `TABLE_BY_MODEL`.
- **Tests.** **379 static** (was 346; +rbac override resolution, +`user-search.test.mjs`
  17, +override form/registry/shape) + **7 new live** (`m2.db.test.mjs`): grant adds /
  deny-wins / remove-restores / scoped / escalation guard / idempotent + DB
  NULLS-NOT-DISTINCT backstop / gate / smart-search filter. `users.db` (6) re-confirmed
  green on warm Neon; `next build` + ESLint clean.
- **Adversarial review** — a 6-dimension, per-finding 2-verifier workflow (12 agents):
  **0 confirmed-by-both, 1 single-vote** (a free-text client/server predicate drift) —
  fixed (made `q` per-field email-OR-name to match the DB `where.OR`, and made the pure
  filter the sole authority on the server too) + locked with a no-drift static test.

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
  green (**448 passing**); `RUN_DB_TESTS=1 dotenv -e .env.local -- npm test` adds the
  live smoke + CMS (8) + year-engine (6) + org (4) + events (10) + resources (4) +
  media (3) + developer console (10) + users/roles (6) + M0 (8) + M2 (7) + M1 (6) +
  M7 (4) + M8 (3) + **M3 (`m3.db`, written — run after `db:migrate`+`db:seed`; KNOWN_ISSUES #42)**
  live tests. (The full live suite runs the DB suites in parallel against one Neon DB;
  the stateful `year.db` suite — it mutates the shared current-year row — can show a
  transient P2025 under that contention and is re-confirmed green in isolation. M1 does
  not touch the year engine.)
- **RBAC (M2):** authorization resolves as developer short-circuit → additive role
  union → `grants_all` short-circuit → per-email overrides (**deny wins**, DL-062).
  Manage overrides via `lib/users/admin.mjs#setUserOverride/removeUserOverride` (gated
  `permission.override`); the "categories" are the seeded roles in `ROLE_DEFS`
  (`CATEGORY_ROLE_KEYS`). The smart search/parser is the pure, client-safe
  `lib/users/search.mjs` (reuses `lib/auth/email.mjs#parseInstituteEmail`). The remote Neon compute has high per-round-trip latency
  **and auto-suspends**, so live tests are slow (minutes) and occasionally hit a
  transient "Can't reach database server" on a cold compute — re-run once if so (not
  a logic failure). The org live suite is the slowest (the importer makes many
  sequential audited tx round-trips).
- **Club pages + memberships (M3):** club/council detail pages are ONE tabbed renderer
  (`app/components/OrgUnitTabs.jsx`) over `lib/org/public.mjs#getClubPageView`. **Memberships**
  are `lib/memberships/service.mjs` (a `club_membership` M-M keyed to `org_unit_lineage`), gated by
  the scoped `membership.manage` (coordinator/secretary/admin) — reuse `addMembership`/
  `importClubMemberships` (don't add a parallel roster). **Club markdown docs** are
  `content_type='club_doc'` (reuses `page_block_payload`), rendered SAFELY via
  `lib/markdown/render.mjs#renderMarkdown` (escape-first — reuse it for M4). **Club announcements/events**
  bind to a club via `content_item.orgUnitId`; a club announcement opts into the central board via
  `announcement_payload.sync_to_central` (`isCentralAnnouncement`). Group windowed listings with
  `groupByWindow` (DL-074).
- **M7/M8 spine:** centralized **notifications** (`lib/notifications/service.mjs` —
  `createNotification`/`listNotificationsPage`, labels, dedupe) + standalone **feedback**
  tickets (`lib/feedback/service.mjs`, public `POST /api/feedback`, `FB-NNNNN`) +
  the **developer dashboard** (`/admin/devdash`): `exportAuditLog` (audit.read),
  `lib/devconsole/usage.mjs` (page_visit + `recordPageVisit`/`getUsageAnalytics`),
  `lib/devconsole/storage.mjs` (table sizes + thresholds + export + allowlisted truncate,
  gated dev-only `storage.manage`), and `lib/mail/*` (authorized-sender allowlist +
  rate-limited `sendBulk`, lazy nodemailer). Reuse `createNotification` (don't add a
  parallel queue) and `groupByWindow` (past/current/upcoming) for M3.
- **Access modes (M1):** `app_user.status ∈ {active, inactive, revoked}` is the single
  status field (the pure matrix is `lib/auth/access.mjs`). Gate the BACK OFFICE with
  `requireUser()`/`requirePermission()` (active-only); gate the MEMBER view with
  `requireMember()` (admits inactive); gate EVENT PARTICIPATION (M5) with
  `assertCanParticipate()` (active-only); gate per-unit routes with
  `requireScopedPermission(key, { orgUnitLineageKey, academicYearId })`. Login is in
  `lib/auth/options.mjs` (rejects revoked, admits inactive). `app_user.allow_normal_view`
  withholds the member view independently (DL-067).
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
