# Member Platform Plan — Session 11+ (durable design doc)

The IIT Jammu portal V2 (Sessions 1–10) is feature-complete and deployable. This
document is the **permanent design/architecture plan** for the operator-requested
**member platform** — a large, multi-session program (Sessions 11–~18). It maps each
requirement to concrete schema, services, routes, RBAC impact, and tests on the
**existing spine** (it does NOT introduce parallel pipelines).

> **Authoritative execution prompt:** [`NEXT_TASK.md`](../NEXT_TASK.md) (rewritten
> each session). **This file is the stable plan** that survives those rewrites — keep
> it updated as modules land. Decisions go in [DECISION_LOG.md](DECISION_LOG.md)
> (DL-058+). Spine references: DL-004/006/011 (CMS), DL-009/021 (cardinality),
> DL-013/019/020 (auth), DL-026 (RBAC; **M2 revises its no-deny rule**),
> DL-037/038 (new-module rule), DL-046–051 (dev console + admin panel + the ONE
> mutation route).

## Principles (every module)
- New schema = a **forward migration** (Prisma model + raw-SQL tail; never `db pull`
  / `migrate reset`). New `content_type` = `content_type_def` row + payload table +
  handler + the "every type has a handler" test.
- Authorize FIRST → `auditedMutation` (one semantic row) → JSON-safe shape; DB guards
  via `mapDbError`. Mutations via the `POST /api/admin/action` registry (DL-050) or a
  new gated route reusing `lib/http/guard.mjs` (CSRF + rate limit).
- **Audit every cross-stakeholder / cross-domain action** (a higher stakeholder
  editing a lower one's domain is logged + attributed).
- **Performance**: keyset pagination, indexes, Server-Component reads, low latency.
- **AI-ready**: typed rows + clean service boundaries so a later agent layer can read
  the data and automate insights — no scraping, no derived-only state.
- One module ≈ one session; full protocol each time (migration → service → UI → tests
  → adversarial review → docs → handoff).

**Suggested order:** M0 → M2 → M1 → M7/M8 spine → M3 → M4 → M5 → M6.

## Activation — the member platform is a DEVELOPER-CONTROLLED PLUGIN (DL-058)
The whole program ships behind ONE feature flag, **`member_platform`** (`feature_flag`
table + `lib/platform/flags.mjs`). A **developer** turns it on/off at
**`/admin/plugins`** (or via the service); when OFF the portal behaves exactly as
Sessions 1–10 (legacy Google sign-in intact), when ON the member-platform features
activate (email+password-only auth, member pages, account/reset requests, forced
first-login change). Gating reads **fail closed** (a DB error ⇒ off). Every module
M0–M8 builds *inside* this plugin. **To check current state:** `/admin/plugins`,
or `dotenv -e .env.local -- node -e "require('@prisma/client')..."`, or
`SELECT key, enabled FROM feature_flag;` (see the Developer Guide).

---

## M0 — Authentication & account lifecycle (foundation)
- **Email + password ONLY** — remove the NextAuth Google provider; keep credentials
  (argon2id, DL-020), JWT, live RBAC (DL-019), one-account-per-email.
- **Schema:** `app_user += must_change_password boolean`, `password_set_at`,
  `password_reset_request` (or reuse `verification_token`) for the admin-mediated
  flow. Account-creation + password-reset **requests** are rows in the new
  `notification` table (M7).
- **Flows:** admin/dev create accounts **singly + bulk CSV** (`email → initial
  password`); initial passwords delivered via the **institute external mail** (not the
  app). First login forces a change (client + server password-policy validation,
  mirroring DL-051). **Forgot/reset:** public form → `notification` in both admin & dev
  **Password Management** tabs → "Fix" **assigns** it (audited) → **random-password
  generator** → `must_change_password` → external mail → user changes it. Admin/dev
  force-reset (suspicion) + delete users.
- **Services/routes:** extend `lib/users/admin.mjs`; new `lib/auth/password-reset.mjs`;
  a public gated route for requests (CSRF + rate-limit). **Tests:** policy + generator
  (pure), must-change gate, request→assign→reset, bulk-CSV dedup.

## M1 — User status & access modes
- **Status enum → `active` / `inactive` / `revoked`** (forward-migrate; reconcile with
  today's invited/suspended/disabled). Enforced live in `lib/auth/session.mjs` + route
  guards: **active**=full; **inactive**=login + read + own achievements, **no event
  participation**; **revoked**=no login, public site only. Per-account "allow normal
  view on first login" toggle.
- **Surfaces:** public normal view · Admin dashboard · Developer dashboard · scoped
  route RBAC (coordinator→own club; secretary→own council; staff→playground + central
  announcements) via `role_assignment` scope columns. **Tests:** each status's access
  matrix; scoped-route gating.

## M2 — RBAC: categories + per-email overrides
- **Categories = roles** (data). Seed: normal user, coordinator, co-coordinator,
  secretary, staff, admin, developer; admin/dev create more; each has a default
  `role_permission` mapping.
- **`user_permission_override` (NEW):** `(user, permission, mode grant|deny, scope?)`.
  Extend `resolveEffectivePermissions`: additive role union THEN overrides (**deny
  wins**). **This revises DL-026 #8 (no-deny)** — record a new DL; keep the
  developer/`grants_all` short-circuit + DL-049 escalation guards.
- **Email-format smart search:** pure parser for
  `<year><level u|p|r><branch><serial>@iitjammu.ac.in` (e.g. `2023ume0243@…`) +
  a **debounced** admin filter (year/level/branch/category/status). Email is the unique
  identifier. **Tests:** override resolution (grant/deny/scoped), parser + filter.

## M3 — Club/Council pages + memberships
- **Club detail tabs:** Overview (vision/details/PIC/team incl. admin-defined custom
  roles), Past events organized, Achievements (club slice of M4), Resources, Upcoming
  events (link → M5), Announcements (club-specific + opt-in **sync to central**),
  **Miscellaneous markdown docs** (CRUD by permitted stakeholders).
- **Schema:** `club_membership (app_user ↔ org_unit_lineage)` many-to-many (one user
  in many clubs/societies/chapters); a club-markdown content type or `page_block`
  entries; custom roles via `position` + `appointment.title_override`. Bulk CSV upload
  (coordinators submit; admin syncs), idempotent (DL-031). **Tests:** membership
  import dedup, tab reads, scoped edit gating.

## M4 — Wall of Fame (achievements)
- `content_type='achievement'` (year-scoped) with **hybrid ordered blocks** (markdown /
  markdown+image / banner / link / gallery) in `page_block_payload.data` JSONB (DL-016)
  or a normalized child table (pick + doc); **sanitize markdown**. Public
  `/wall-of-fame` Server Component + per-club slice. **achievement ↔ user/club**
  mapping for performance tracking. Reuse media + `cloudinaryAutoUrl`. **Tests:**
  handler round-trip, block validation, sanitize, publish→visible.

## M5 — Centralized Event Playground (largest; ~2 sessions)
- **ONE playground** (upgrade `/events`), **login-only**, hosting any event type
  (quiz/hackathon/case-study/…) by any stakeholder (club/syndicate/hostel/custom
  entity). The event stays an `event` `content_item` (DL-037) + a relational subsystem:
  - `event_organizer`, `event_collaborator` (→ `org_unit_lineage` or a custom-entity
    table) + organizer/contributor **tags** + **eligibility criteria**.
  - Hybrid **details + problem statement** (markdown + banners + PDFs/sheets/any doc via
    media/resources).
  - `event_round` (stages) · `event_registration` (per user; **partial-unique dedup**;
    capacity → waitlist via a cardinality guard, DL-009/021) · `event_score`
    (round-wise + overall) · `event_attendance` (round-wise sheets, **manually
    marked**).
  - **Live + past ranking**, per round AND overall. **Category/tag** mapping →
    user/stakeholder performance (M6).
  - **CSV downloads** (participants/scores/attendance, round + overall) for
    organizers/admin/staff/developer.
  - **Closure window:** optional **markdown** closure report (role + contribution +
    overall budget); admin **reviews → comments**; corrected budget + comment saved;
    stakeholder feedback captured. Visible to organizers + admin + staff + developer.
- **"Events Organized" page:** a dedicated page listing **all** organized events with
  their **tagged stakeholders + team members**, backed by a **curated markdown
  document** that **admin / staff / developer** can add/update (a markdown
  content type / `page_block` doc, year-scoped). Every add/update is audited
  (who/what/when, before/after via `audit_log`); that change history is **visible,
  accessible, and downloadable** from a named **Developer-dashboard tab** (see M8).
- **Perf:** indexes on (event, round, user), keyset pagination, minimal round-trips,
  load handling. **Tests:** register/dedup/capacity/waitlist, scoring + ranking, round
  attendance, closure review, download integrity, access gating, **Events-Organized
  markdown edit → audited → appears in the dev-dashboard change history + export**.

## M6 — Member profiles & performance
- Profile: name, email, **syndicate** (if any), roles/category, events **participated**
  (category-mapped), **registered/upcoming** events, **achievements**. Self + admin
  view. Drives per-stakeholder institute contribution tracking across a year. **Tests:**
  aggregation correctness, visibility.

## M7 — Centralized notifications, feedback/issues, announcements
- **`notification`** — centralized, **labelled**, **unique human ref id**,
  entity-linked, **assignment-tracked** (who took it); on admin & dev dashboards
  (password/account requests, threshold alerts, …).
- **`feedback`/support tickets** (standalone, DL-038) — public feedback/issue/query
  tab; **unique ref id** so a user reports a bug against any component/service id;
  status workflow.
- **Announcements:** central (staff) + club-specific with opt-in sync; **past/current/
  upcoming** listing for announcements AND events. Every notification/feedback/event/
  announcement carries a unique referenceable id. **Tests:** ref-id uniqueness,
  assignment tracking, sync, listing windows.

## M8 — Developer dashboard: audit, analytics, backups, monitoring, mail
- **Action tracking:** extend `audit_log` (DL-012/028) — emphasize cross-domain
  actions; a **named dev-dashboard tab** (e.g. "Action Log / Change History") makes
  the full action history **visible, filterable, and downloadable** (structured
  export), including every add/update of the M5 **"Events Organized"** markdown
  (who did what, when) and all other multi-stakeholder edits.
- **Usage analytics (hidden):** `page_visit`/usage table (most-visited sections) → dev
  dashboard; structured + downloadable.
- **Per-table size monitoring:** show each table's size; developer-set **threshold**
  per table; exceeding → **flag + dashboard message** (site + feature keep working);
  **per-table backup/export + truncate** via the `backup_record` ledger (Session 8).
- **Resource monitoring:** Neon size + Cloudinary usage to plan subscriptions (extend
  `getInfraUsage`/reports, DL-048).
- **Mail (`lib/mail/*`):** nodemailer on the institute VM — **bulk + rate-limited**
  with a **progress bar** ("X of Y sent; N remaining"); senders restricted to an
  **authorized-sender list** (admin/dev maintained). (Initial passwords still via
  external institute mail.) **Tests:** threshold flag (non-blocking), export/truncate
  round-trip, mail rate-limit + progress accounting, authorized-sender enforcement.

---

## Status tracker (update as modules land)
| Module | Theme | Status |
|---|---|---|
| — | **Plugin control plane** (`feature_flag` / `member_platform`, developer-toggled, fail-closed) | ✅ (M0) |
| M0 | Auth & account lifecycle (email+password only) | ✅ Session 11 |
| M1 | User status (active/inactive/revoked) + surfaces | ✅ Session 11 (DL-065/066/067) |
| M2 | RBAC categories + per-email overrides + search | ✅ Session 11 (DL-062/063/064) |
| M3 | Club pages + memberships | ⬜ |
| M4 | Wall of Fame | ⬜ |
| M5 | Centralized Event Playground | ⬜ |
| M6 | Member profiles & performance | ⬜ |
| M7 | Notifications + feedback + announcements | ⬜ |
| M8 | Developer dashboard (audit/analytics/backups/mail) | ⬜ |
