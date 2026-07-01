# Next Task

**As of:** 2026-07-01 · Sessions 1–10 complete. **Session 11 shipped the full M0–M8
member-platform program.** **Session 12 completed the consolidation / deploy-hardening.**
**Session 13 built the one remaining OPTIONAL dev item — the standalone `/coordinator`
scoped surface (closes KNOWN_ISSUES #43) — and the full client-facing delivery
documentation set.** **The product is now feature-complete, hardened, and delivery-
documented; the ONLY remaining work is operator/owner-owned** (below). There is NO
pending developer feature work.

> ### ▶️ NEXT — Operator/owner backlog ONLY (no developer work remains)
> 1. **Operator (run when convenient — OPERATIONS_RUNBOOK.md):** populate the live year —
>    `npm run db:import:org` → `db:import:events` → `db:import:resources` (#27); then the media
>    migration `npm run db:migrate:media -- --apply` + the safe `/public` prune (#18, runbook §3.1).
>    Optionally `npm install nodemailer` + set `MAIL_*` to enable bulk mail (#40/#45).
> 2. **Owner (anytime):** rotate/remove the V1 leaked secrets in `README.md` + purge history
>    (#1), then drop the `.gitleaks.toml` by-SHA allowlist; consider rotating the Neon password (#19).
> 3. **Client hand-over:** follow `CLIENT_INSTRUCTIONS.md` (the go-live runbook) and share the
>    delivery docs (`DELIVERABLES_INDEX.md` lists them all).
> **First (any session):** confirm the operator ran `npm run db:migrate` + `npm run db:seed`
> (idempotent), and run the full gate per the SOP (static + lint + build + live per-file/single-fork).
> **If a future session wants to WIDEN the coordinator surface:** the `/coordinator` shell +
> `getManagedEvent` (compose-the-gated-reads) + `listManageableLineages` are the template for a
> scoped Content or Appointments view — reuse `assertActorPermission` at the unit's scope (DL-096).

> ### ✅ Session 13 done — Scoped-coordinator surface + delivery docs (DL-096)
> Closed KNOWN_ISSUES #43 with a STANDALONE **`/coordinator`** back office (its own scope-aware
> `loadCoordinatorContext`, NOT under the global `/admin` gate): a club-scoped coordinator SEES and
> runs their unit's **events** (settings/rounds/registrations/scores/attendance/closure-submit + CSV),
> **members** (roster + non-destructive CSV import), and **contribution** (M6 club slice). Driven by a
> NEW inverse-of-the-resolver **scoped-grant discovery** (`lib/rbac/grants.mjs#listManageableLineages`,
> reusing `resolveEffectivePermissions` for exact parity) + `lib/events/manage.mjs`
> (`listEventsForManager` / `getManagedEvent`, gated by `assertEventManage`). Central-only actions
> (organizer tagging, entities, closure review) stay `requireGlobal` and are absent. **No new
> permission/table/migration/mutation** (permissions 52, content types 13). **530 static
> (+`coordinator.test.mjs` 13) + `coordinator.db.test.mjs` 5/5 green** (m5/m1 re-run green — the RBAC
> extraction is behaviour-preserving); route-smoke extended; 5-dimension × 2-verifier review. Plus the
> client delivery docs: `Notebook.md`, `USER_MANUAL.md`, `RESOURCES.md`, `INVESTOR_EMAIL.md`,
> `ANNOUNCEMENT_EMAIL.md`, `DELIVERABLES_INDEX.md`, `CLIENT_INSTRUCTIONS.md`. **Operator:** no
> migration/seed change (read-only feature); `npm run db:migrate` + `npm run db:seed` stay idempotent.

> ### ✅ Session 12 done — Consolidation / deploy-hardening (no new module)
> Ran the full test gate (517 static + lint + `next build`; every live suite per-file single-fork on
> warm Neon — green). Extended CI to warm Neon + run the live job single-fork (m0–m8 + Sessions 1–10;
> the #39 remedy). Added a reusable route-render smoke (`scripts/route-smoke.mjs`, `npm run test:routes`)
> and a repeatable per-mode full-site procedure (`docs/WEBSITE_TESTING_SOP.md`). Added a small
> logged-in-member nav (`MemberNav` + `SignOutButton`) on `/member` + `/member/profile`. A per-feature ×
> per-role adversarial audit found 21 confirmed defects → **11 fixed, 10 documented-as-accepted**
> (`docs/CONSOLIDATION_BUGLOG.md`; DL-094/095): B1 inactive+must-change lockout (new
> `requireLoggedInAccount` boundary), B2 `/events/[slug]` revoked/view-disabled gate, B3 unstyled
> sign-in card, B4 capacity-raise waitlist promotion, B5 non-destructive membership re-import, B6 a
> shared CSV formula-injection guard, B7 export empty-roundId 500, B8 reopen-clears-note, B9
> fail-closed export auditing, B10 credited-club link, B11 member sign-out. New static + m3/m5/m7 live
> regression assertions; the adversarial diff-review found **0 regressions**. **No schema change**
> (permissions stay 52, content types 13).

> ### ✅ Session 11 done — M6 (Member profiles & performance)
> Built inside the `member_platform` plugin, on the full M0–M5 spine — a **READ-ONLY
> aggregation** module (NO new table / permission / mutation, DL-090). Delivered: a member
> **PROFILE** ([lib/member/profile.mjs](lib/member/profile.mjs)#`getMemberProfile`) — identity
> (`parseInstituteEmail` facets), roles/category (`role_assignment` + resolved scope names),
> affiliations (`club_membership` + a DERIVED, currently-empty **syndicate** facet), full **event
> involvement** (registrations ∪ scores ∪ attendance, category-mapped, with the member's OVERALL
> **rank** computed via the pure `rankEntries` = M5 `getOverallRanking` sum-across-round+overall,
> DL-091), and credited **achievements** (a NEW `listMemberAchievements`). Per-stakeholder
> **INSTITUTE CONTRIBUTION** ([lib/member/contribution.mjs](lib/member/contribution.mjs)) for a
> member / club / custom entity by the DURABLE ids (organized/participated/achievements/roles/
> members/**participants-reached** as a PII-minimized distinct COUNT, DL-092), reusing
> `listClub/MemberAchievements` + `getMembershipCountForUnit`. Pure client-safe
> [lib/member/summary.mjs](lib/member/summary.mjs) (split/category/totals/identity, DL-093/051).
> Surfaces: **`/member/profile`** (self), **`/admin/users/[userId]`** (admin, `user.read`), and a
> **`/admin/contribution`** explorer (a NEW `contribution` nav module, `user.read`) — all shared
> **Server Components** so member PII stays server-side. **NO new permission (52), NO migration,
> content types stay 13.** **516 static + `tests/m6.db.test.mjs` 8/8 green** (m5 10/10, m4 6/6, m3
> 10/10 re-verified on warm Neon); 14-agent review (0 confirmed-both, 2 single-vote → both fixed:
> a profile-page double-read → the `getMemberProfileView` composite; a weak rank test → an
> overall-score-row fixture; 2 refuted nits hardened anyway). **Operator:** no migration/seed
> change is required for M6 (read-only), but running `npm run db:migrate` + `npm run db:seed`
> after pulling stays idempotent.

> ### ✅ Session 11 done — M5 (Centralized Event Playground)
> Built inside the `member_platform` plugin, on the M0–M4 spine. Delivered: the event stays a
> versioned **`content_type='event'`** content_item (DL-037) — now with a markdown **problem
> statement** + **eligibility** + **category** + a **`blocks` JSONB** of HYBRID ordered blocks
> (the M4 block model reused via a NEW `coercePayload` hook, DL-084) — PLUS a standalone
> operational subsystem keyed on the DURABLE event item: **`event_organizer`** (organizer/
> collaborator tagging, one-target over {club-lineage, custom `event_entity`, member}, DL-085)
> + **`event_settings`** (capacity / registration window), **`event_round`** (stages),
> **`event_registration`** (partial-unique dedup + capacity→WAITLIST via a DEFERRED cardinality
> guard + auto-promote, DL-087), **`event_score`** + **`event_attendance`** (round + overall
> replace-set sheets → read-layer ranking via the pure `rankEntries`), and **`event_closure_report`**
> (optional markdown; organizer submits, central admin reviews → corrected budget, DL-088). A NEW
> **`event.manage`** permission (→ **52**) + the **`assertEventManage`** seam (GLOBAL or scoped to
> an organizing club lineage, DL-086); member participation is LOGIN-ONLY via `POST
> /api/events/participate` (`requireMember` + `assertCanParticipate`). CSV downloads (`GET
> /api/events/export`); a curated **"Events Organized"** `content_type='events_organized'` doc
> (→ **13** content types) with an audited **change-history M8 dev-dashboard tab** (DL-089).
> Surfaces: `/events` (login-only playground / public-when-off), `/events/[slug]`,
> `/events/organized`, `/admin/events`. Migration `20260701140000_member_platform_m5` (additive,
> applied). **497 static + `tests/m5.db.test.mjs` 10/10 green** (a real `trimOrNull` bug caught +
> fixed); 6-dimension × 2-verifier review. **Operator:** after pulling, run `npm run db:migrate`
> then `npm run db:seed` (idempotent).

> ### ✅ Session 11 done — M4 (Wall of Fame / student achievements)
> Built inside the `member_platform` plugin, on the M0–M3/M7/M8 spine. Delivered: a NEW
> **`content_type='achievement'`** (year-scoped, **NOT org-bound**) via the CMS spine (DL-037)
> with its OWN **`achievement_payload`** table = typed scalars (`category`/`achievementDate`/
> `heroMediaId`) + a **`blocks` JSONB** of HYBRID ordered blocks (markdown / markdown+image /
> banner / link / gallery, DL-016/080), validated+normalized by the pure client-safe
> `lib/achievements/forms.mjs` via a NEW generic-handler **`coercePayload`** hook; markdown via
> the escape-first `renderMarkdown` (DL-077), media via `cloudinaryAutoUrl` (DL-053). A NEW
> standalone **`achievement_credit`** table (member **OR** club, exactly-one-target CHECK + two
> per-target uniques, DL-081) with `setAchievementCredits` (replace-all, audited, authorize
> `content.update` at the YEAR scope — central curation, DL-082). Public **`/wall-of-fame`**
> (Server Component, plugin-gated, PII-minimized) + the M3 club page's **Achievements tab**
> filled via `getClubPageView`. Reuses `content.*` — **NO new permission (still 51)**; migration
> `20260701130000_member_platform_m4` (additive, applied). **466 static + `tests/m4.db.test.mjs`
> 6/6 green** (m3.db re-ran 10/10 green after a shared-handler fix); 8-agent review (1 confirmed →
> a public-shape `userId` PII leak → fixed + regression-locked). **Fixed a latent M3 bug (DL-083):**
> the generic `writePayload` now `UPDATE`s (not `upsert`s) on a partial edit — **KNOWN_ISSUES #42
> cleared**. **Operator:** after pulling, `npm run db:migrate` then `npm run db:seed` (idempotent;
> adds the `achievement` content type — no new permission).

> ### ✅ Session 11 done — M3 (club/council pages + memberships)
> Built inside the `member_platform` plugin, on the M0–M2/M1/M7/M8 spine. Delivered: a NEW
> standalone **`club_membership`** many-to-many (`app_user` ↔ `org_unit_lineage`, durable,
> `UNIQUE(user,lineage)`, DL-075) + `lib/memberships/{service,forms}.mjs` (add/remove/status/
> list + an **idempotent bulk CSV importer** that reports missing accounts) gated by a NEW
> scoped **`membership.manage`** (DL-066); a NEW **`club_doc`** content type reusing
> `page_block_payload` for **Miscellaneous markdown docs** (DL-076) with a PURE escape-first
> **`renderMarkdown`** (DL-077, reused by M4); **club-specific announcements/events** bound via
> `content_item.orgUnitId` with an opt-in **`announcement_payload.sync_to_central`** to the
> central board (DL-078); ONE data-driven **tabbed** club/council page (`OrgUnitTabs` over
> `getClubPageView`, Achievements tab STUBBED for M4, DL-079) + "My clubs" on `/member`; and the
> optional M8 **usage beacon** finally wired (closes KNOWN_ISSUES #41). +1 permission (**51**);
> migration `20260701120000_member_platform_m3` (additive). **448 static** + a written live suite
> `tests/m3.db.test.mjs`; 14-agent review (4 findings → 3 confirmed + 1 single-vote → all fixed).
> **Operator:** after pulling, run `npm run db:migrate` then `npm run db:seed` (idempotent) — the
> Prisma model now selects `announcement_payload.sync_to_central`, so announcement reads REQUIRE
> the migration applied; then run the M3 live suite once on a warm Neon, isolated (KNOWN_ISSUES #42).

> ### ✅ Session 11 done — M7 + M8 spine (notifications/feedback + developer dashboard)
> Built inside the `member_platform` plugin. **M7:** generalized the `notification` queue
> (label + keyset `listNotificationsPage` + generic deduped `createNotification`, DL-069);
> a NEW standalone **`feedback`** table (FB-NNNNN ref id + CHECK status workflow, public
> `POST /api/feedback`, audited assign/resolve, pure client-safe validator, DL-070) + public
> `/feedback` form + admin module; a pure **`groupByWindow`** past/current/upcoming primitive
> (DL-074). **M8:** Action Log **export** (JSON/CSV, PII-minimized, DL-068); hidden **usage
> analytics** (`page_visit` + best-effort beacon + `getUsageAnalytics`, DL-071); per-table
> **storage** monitoring + thresholds + export + allowlisted/confirm-gated truncate (dev-only
> `storage.manage`, DL-072); **bulk mail** (authorized-sender allowlist + rate-limited send +
> lazy/injectable nodemailer, DL-073). +5 perms (50 total); migration
> `20260630170000_member_platform_m7m8` (applied). **415 static + 7 live (m7.db 4 + m8.db 3);**
> 20-agent review (3 confirmed-both + 2 single-vote → all 5 fixed). Next: **M3**.
> **Operator:** after pulling, `npm run db:migrate` then `npm run db:seed` (idempotent). To
> enable bulk mail: `npm install nodemailer` + set `MAIL_*` (KNOWN_ISSUES #40). Optionally wire
> the client usage beacon to `POST /api/usage` (KNOWN_ISSUES #41).

> ### ✅ Session 11 done — M1 (user status & access modes)
> Built inside the `member_platform` plugin, on top of M0 + M2. Delivered: the
> `UserStatus` enum forward-migrated to **`active / inactive / revoked`** via a
> CREATE-style type swap + `CASE` data backfill (suspended/invited→inactive,
> disabled→revoked; migration `20260630160000_member_platform_m1`, applied to Neon — no
> init rewrite, DL-027); **live enforcement** (DL-065) at the login/session layer (not
> the JWT) — login admits inactive / rejects revoked; `requireMember()` (member view,
> admits inactive) vs active-only `requireUser()` (back office); the reusable active-only
> `assertCanParticipate()` (the M5 event-participation seam); `requireScopedPermission()`;
> all driven by the pure, client-safe `lib/auth/access.mjs` (single source of truth).
> **Three surfaces + scoped route RBAC** (DL-066) reuse the existing `role_assignment`
> scope columns + the resolver's `inScope` matching (minimal `app/member` view +
> `loadMemberContext`); a per-account `allow_normal_view` toggle (DL-067); and the pending
> `role_assignment (user_id, revoked_at)` index migration
> (`20260630150000_add_roleassignment_user_index`). **393 static + 6 live
> (`m1.db.test.mjs`);** 6-dimension × 2-verifier review (1 confirmed → fixed: an
> inactive-developer surface dead-link). Next: **M7/M8 spine** (then M3 → M4 → M5 → M6).
> **Operator:** after pulling, run `npm run db:migrate` (idempotent — already applied
> here: the index + the M1 enum/column migrations) then `npm run db:seed` (idempotent).

---

## Original program prompt (still authoritative for the remaining modules)

Remaining work is **operator/owner** (run the imports + media migration; rotate the
V1 secrets — see [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md)) and a
large, operator-requested **Session 11+ feature program** (below). Session 10 was
harden-only, so these NEW features were correctly deferred (DL-057).

> Deploy/run: [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md) · Admin panel:
> [docs/ADMIN_PANEL_GUIDE.md](docs/ADMIN_PANEL_GUIDE.md).

## Today's auth surface (operator's question, for context)
The only login today is the **staff/admin sign-in at `/admin`** (Google OR
email+password, RBAC-gated). No public "Login" link, no event registration. Session
11 **replaces this** with an email+password-only, admin-provisioned account system
and a public member experience (see Module M0).

---

# ▶️ SESSION 11+ — Member platform: accounts, RBAC, club pages, event playground, dashboards

**This is a multi-session PROGRAM, not one session** (realistically ~6–9 sessions).
Run each session in automode at ultracode; **do ONE coherent module per session**,
end-to-end (design → migration(s) → service → UI → tests → adversarial review →
docs → handoff), following [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md).
Record decisions from **DL-058** onward. Build **every** module on the existing
spine (CMS content types, RBAC, `auditedMutation`, `mapDbError`, the dev console) —
**no parallel pipelines.** Design all data + services so a future **AI agent layer**
can read structured data and automate insights (clean service boundaries, typed
rows, no scraping).

**Read first:** SESSION_PROTOCOL, CURRENT_STATUS, this file, DECISION_LOG (esp.
DL-004/006/011 CMS spine; DL-009/021 cardinality guards; DL-013/019/020 auth;
DL-026 the "additive-union, no-deny" RBAC rule — **M2 revises it**; DL-037/038 the
"new module = content_type vs standalone table" rule; DL-040 audience gating;
DL-046/047/048 dev-console readers; DL-049/050/051 admin panel + the ONE mutation
route), SCHEMA_DESIGN, and the dev/admin guides.

### Global guard rails (unchanged)
- Never `prisma db pull` / `migrate reset`. Each schema change = a **NEW forward
  migration** (Prisma model + raw-SQL tail for partial uniques / CHECKs / triggers,
  via `npm run db:migrate`, DL-027). New `content_type` = a `content_type_def` seed
  row + payload table + in-code handler + the startup "every type has a handler" test.
- Authorize FIRST; one semantic `audit_log` row per op via `auditedMutation`;
  JSON-safe shapes; honor DB guards via `mapDbError`. Mutations go through the ONE
  admin route registry (`POST /api/admin/action`, DL-050) or a new gated route that
  reuses `lib/http/guard.mjs` (CSRF + rate limit). Prisma CLI reads `.env` → `db:*`
  scripts. Neon has high latency + auto-suspends (generous live-test timeouts).
- **Every cross-stakeholder / cross-domain action is audited** (a higher stakeholder
  editing a lower one's domain MUST be logged + attributed). Keep the static suite
  green and grow it; run the live suite once on a warm Neon; finish each session
  with a multi-agent adversarial review. Test every feature in the dev phase.
- **Performance is a requirement** (the event playground especially): keyset
  pagination, proper indexes, minimal round-trips, Server Components for reads,
  graceful degradation. Professional UI matching the site theme (`#003f87`, the
  consolidated `next/font` fonts).

### Suggested execution order (one module ≈ one session)
**M0 → M2 → M1 → M7/M8 spine → M3 → M4 → M5 → M6**, because accounts + RBAC +
notifications/audit/backup are the foundation everything else needs.

---

## M0 — Authentication & account lifecycle (FOUNDATION — do first)
- **Email + password ONLY.** REMOVE the Google provider (keep NextAuth credentials,
  argon2id DL-020, JWT, live per-request RBAC DL-019, one-account-per-email).
- **Admin-provisioned accounts.** Admin/dev create accounts **singly and in BULK**
  (CSV upload of `email → initial password`). Initial passwords are delivered via
  the **institute's EXTERNAL mail system**, NOT the app. Add `must_change_password`
  to `app_user` → force a change on first login. Password policy validated
  client-side AND server-side (mirror the validators, DL-051 pattern).
- **Account-creation request (new user):** a public "Request an account" form →
  creates a centralized `notification` to the admin/dev dashboards → admin manually
  creates the entry + initial password + emails it externally.
- **Forgot / reset password:** a public form (enter email) → creates a centralized
  password-reset `notification` visible in BOTH the admin AND developer **Password
  Management** tabs → a stakeholder clicks **"Fix"**, which **ASSIGNS** the request
  to them (audited) → they **generate a random password** (generator in the
  dashboard) → set `must_change_password` → deliver via external mail → user logs in
  and changes it. Admin/dev can force-reset on suspicion (same flow) and **delete**
  users. No self-serve email-link reset (admin-mediated by design).
- Tests: password policy + generator (pure), the must-change gate, the
  request→assign→reset flow, bulk-CSV ingest dedup.

## M1 — User status & access modes
- **Status: `active` / `inactive` / `revoked`** (forward-migrate the user-status
  enum; reconcile with today's invited/suspended/disabled). Enforced live in the
  session/route layer: **active** = full; **inactive** = can log in, browse, see own
  achievements, **cannot participate in events**; **revoked** = cannot log in, sees
  only the public site. A per-account "allow normal view on first login" toggle.
- **Three surfaces + route RBAC:** the public **normal view**, the **Admin
  dashboard**, the **Developer dashboard**, plus scoped route access (coordinator →
  own club page only; secretary → own council; staff → event playground + central
  announcements). Reuse `role_assignment`'s per-unit/per-year scope columns.

## M2 — RBAC: categories + per-email permission overrides
- **Categories = roles (data).** Seed: normal user, coordinator, co-coordinator,
  secretary, staff, admin, developer; admin/dev can create more. Each category has a
  default permission mapping (`role_permission`). Category also powers stakeholder
  search/grouping.
- **Per-email overrides (NEW):** a `user_permission_override` table (`grant | deny`)
  so admin/dev can add OR remove a specific permission from any single email.
  Extend `resolveEffectivePermissions`: additive role union, THEN apply overrides
  (**deny wins**). This **revises DL-026 #8 (no-deny)** — record the new decision and
  keep the developer/`grants_all` short-circuit + the DL-049 escalation guards.
- **Email-format smart search:** `email = <year><level><branch><serial>@iitjammu.ac.in`
  (e.g. `2023ume0243@…`; level `u`/`p`/`r` = UG/PG/research, branch `me`/`ch`/`ma`/
  `cs`/…). A pure parser + a **debounced** admin filter (by year / level / branch /
  role-category / status). Email is the unique identifier everywhere.

## M3 — Club/Council pages expansion + memberships
- **Club detail pages with tabs:** Overview (vision, details, PIC, team incl.
  **custom roles** an admin/dev defines), **Past events organized**, **Achievements**
  (the club's Wall-of-Fame slice, M4), **Resources** (exists), **Upcoming events**
  (links into the central playground, M5), **Announcements** (club-specific, with an
  opt-in **sync to the central announcements page**), and a **Miscellaneous** tab of
  **markdown docs** that permitted stakeholders can add/update/delete. Custom
  positions/roles are admin/dev-created (reuse `position` + `appointment.title_override`).
- **Club membership mapping:** a `club_membership` table (`app_user` ↔
  `org_unit_lineage`, many-to-many) — coordinators submit member email lists, admin
  **bulk-uploads** the mapping (CSV) to sync. One user may belong to multiple clubs /
  societies / student chapters. Idempotent importer (DL-031 pattern).

## M4 — Wall of Fame (student achievements)
- New `content_type='achievement'` CMS module (year-scoped) with **hybrid ordered
  blocks** (markdown / markdown+image / banner / link / gallery) — store blocks in
  `page_block_payload.data` JSONB (DL-016) or a normalized child table (pick + doc).
  Sanitize markdown (no raw-HTML injection). Reuse `media_asset` + `resolveDeliveryUrl`
  + `cloudinaryAutoUrl`. Public `/wall-of-fame` (Server Component) + a per-club slice.
- **Achievement ↔ user/stakeholder mapping** so a member's (and a club's)
  contributions are trackable any time and across an academic year.

## M5 — Centralized Event Playground (the largest module; likely 2 sessions)
- **ONE playground** (upgrade `/events`) hosting **any** event type (quiz, hackathon,
  case study, …) organized by **any** stakeholder (club / syndicate / hostel / a
  custom entity admin/dev defines). **Login-only access.** Professional, themed UI.
- **Model** = the existing `event` `content_item` (DL-037) + a relational subsystem:
  - `event_organizer` + `event_collaborator` (many-to-many to `org_unit_lineage` or a
    custom-entity table) with organizer/contributor **tagging** + **eligibility criteria**.
  - **Hybrid content:** event details AND a **problem statement** in markdown +
    banners + PDFs / sheets / any doc type (reuse media/resource patterns).
  - `event_round` (stages) · `event_registration` (per user; **partial-unique dedup**;
    optional **capacity → waitlist** via a cardinality guard, DL-009/021) ·
    `event_score` (round-wise + overall) · `event_attendance` (round-wise sheets,
    **manually marked** by organizers).
  - **Live status + ranking** (current + past), trackable **per round AND overall**.
  - **Event categories/tags** (organized-by) → feed user + stakeholder performance
    tracking (M6) across the year.
  - **Downloads** (CSV/structured): registered participants, per-participant scores,
    attendance — round-wise + overall — for organizers / admin / staff / developer.
  - **Closure window:** after an event closes, organizing stakeholders may submit an
    **OPTIONAL closure report — markdown only** (their role + contribution + overall
    budget). Admin **reviews → comments**; the corrected budget + comment are saved
    with the report. Stakeholders also submit **feedback** (e.g. data issues).
    Visible to organizers + admin + staff + developer.
  - **"Events Organized" page:** a dedicated page listing **all** organized events with
    their **tagged stakeholders + team members**, backed by a **curated markdown
    document** that **admin / staff / developer** add/update (a markdown content type /
    `page_block`, year-scoped). Every add/update is **audited** (who/what/when, before/
    after); that change history is **visible, accessible, and downloadable** from a
    named **Developer-dashboard tab** (M8).
- **Performance:** keyset pagination, indexes on (event, round, user), minimal
  round-trips, load handling, low latency, smooth UX.

## M6 — Member profiles & performance
- A profile page: name, email, **syndicate** (if any), roles/category, events
  **participated** in (with category mapping), **registered/upcoming** events (with
  details), and **achievements**. Self-view + admin view. Drives "what each
  stakeholder contributed to the institute through their roles."

## M7 — Centralized notifications, feedback/issues, announcements
- **`notification`** table — centralized, **labelled**, each with a **unique human
  reference id**, entity-linked, with **assignment tracking** (who took it). Surfaced
  on the admin & dev dashboards (password requests, account requests, threshold
  alerts, etc.).
- **`feedback` / support tickets** (standalone, DL-038 pattern) — a public
  feedback/issue/query tab; each carries a **unique ref id** so a user can report a
  bug against any component/service id and the developer can trace it. Status workflow.
- **Announcements:** the central (staff-managed) board + **club-specific**
  announcements with an opt-in **sync-to-central**. List **past / current / upcoming**
  for both announcements AND events.
- Every notification / feedback / event / announcement carries a unique referenceable id.

## M8 — Developer dashboard: audit, analytics, backups, monitoring, mail
- **Action tracking:** extend `audit_log` (DL-012/028) — emphasize cross-domain
  actions; a **named dev-dashboard tab** (e.g. "Action Log / Change History") makes
  the full history **visible, filterable, and downloadable** (CSV/JSON), including
  every add/update of the M5 **"Events Organized"** markdown (who did what, when) and
  all other multi-stakeholder edits — for future data analysis.
- **Usage analytics (hidden):** a `page_visit`/usage table (which sections are
  visited most) → dev dashboard; structured + downloadable.
- **Per-table size monitoring:** show each table's size; developer sets a **threshold**
  per table; exceeding it **flags + posts a dashboard message** ("back up this
  table") — **the site and the feature keep working past the warning**. Per-table
  **backup/export + truncate** from the dashboard (reuse the `backup_record` ledger,
  Session 8). All exports structured.
- **Resource monitoring:** Neon size + Cloudinary usage to plan monthly subscriptions
  (extend `getInfraUsage` / reports, DL-048).
- **Mail (`lib/mail/*`):** nodemailer on the institute VM — **bulk + rate-limited**
  sends with a **progress bar** ("X of Y sent; you can send N more now"); senders
  restricted to an **authorized-sender list** maintained by admin/dev. (Initial
  passwords still go via the institute's external mail, not the app.)

### Cross-cutting (every module)
Audit every multi-stakeholder/cross-domain action; keep all data synced under the
permission model; test each feature in the dev phase; structure data + service
boundaries so a future AI trigger/agent layer can read it and automate insights.

### End-of-session (each module session)
Run the END-OF-SESSION checklist: migration(s) + seed rows, grow static + live
tests, run the adversarial review workflow, update ALL tracking docs + the decision
log (DL-058+), update `Token_Usage.md`, prepare one specific commit, write the
handoff naming the next module. Update the session count (the plan is now 11+).

---

## Operator-owned (run when convenient — see OPERATIONS_RUNBOOK.md)
- Populate the live year: `npm run db:import:org` (~15 min) → `db:import:events` →
  `db:import:resources` (#27). Media migration: `db:migrate:media` (dry-run) →
  `-- --apply`; then the safe `/public` prune (#18, runbook §3.1).
- Observe: `npm run db:console [-- --audit]` or `/admin/console`.

## Owner-owned (anytime)
- Rotate/revoke the V1 leaked secrets + clean the root `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md)); then
  drop the `.gitleaks.toml` by-SHA allowlist; consider rotating the Neon password (#19).
