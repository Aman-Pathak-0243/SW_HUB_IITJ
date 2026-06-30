# Next Task

**As of:** 2026-06-30 · Sessions 1–10 complete. **Session 11 shipped the plugin, M0,
and now M2** (RBAC categories + per-email overrides + smart search). Next session:
**M1** (user status active/inactive/revoked + the three surfaces + scoped route RBAC),
built inside the plugin.

> ### ✅ Session 11 done — M2 (RBAC categories + per-email overrides + smart search)
> Built inside the `member_platform` plugin, on top of M0. Delivered: six seeded
> **"category" roles** (normal_user / co_coordinator / coordinator / secretary / staff /
> admin — `admin` = the catalog minus the developer-only ops; DL-063); a new
> **`user_permission_override`** table (grant|deny, optional unit/year scope) that
> extends `resolveEffectivePermissions` to *additive role union THEN overrides, **deny
> wins*** — **revising DL-026 #8's no-deny rule** while keeping the developer/`grants_all`
> short-circuit and adding a "can't grant what you don't hold" escalation guard (DL-062,
> new `permission.override` permission); and an **email-format smart search** — the pure
> client-safe `lib/users/search.mjs` (reusing `parseInstituteEmail`) behind a **debounced**
> admin filter (year / level / branch / category / status) and a coarse server
> pre-filter on `listUsers` (DL-064). Migration `20260630140000_member_platform_m2`
> (applied); seed now 45 perms / 11 roles. **379 static + 7 live (`m2.db.test.mjs`);**
> 12-agent review (0 confirmed, 1 single-vote drift fixed). Next: **M1** (then M7/M8 →
> M3 → M4 → M5 → M6).
> **Operator:** after pulling, run `npm run db:migrate` (idempotent — already applied
> here) then `npm run db:seed` (idempotent) so the new permission + category roles attach.

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
