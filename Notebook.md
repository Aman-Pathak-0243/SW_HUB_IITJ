# Notebook — The IIT Jammu Student Affairs Member Platform

> **The single comprehensive technical + product notebook for the whole website.**
> Everything about the platform: what it is, how it is built, its data model, its
> access-control engine, every module, every logged-in surface, its observability,
> its operations, its testing, and its known limits.
>
> **Product:** the IIT Jammu Student Affairs *Member Platform* — a rebuild of a V1
> marketing site into a full member / club / event platform. **Branch:** `portal-v2`.
> **Status (2026-07-01, Session 13):** feature-complete, hardened, delivery-documented.
> The remaining work is operator/owner-owned (live-data imports, media migration, V1
> secret rotation) — see [NEXT_TASK.md](NEXT_TASK.md).
>
> This notebook is grounded in the repository. Every claim below traces to a real
> file, route, permission, or migration. Authoritative deep-dives live in `docs/`
> (see [§11 Doc Map](#11-doc-map)). Where prices are mentioned they are **indicative
> only — verify at the provider's official pricing page; prices change.**

---

## Table of Contents

1. [What the platform is — the V1→V2 story + the plugin model](#1-what-the-platform-is)
2. [Architecture](#2-architecture)
3. [The complete data model](#3-the-complete-data-model)
4. [RBAC in full](#4-rbac-in-full)
5. [Every module — Sessions 1–10, M0–M8, and the Session-13 coordinator surface](#5-every-module)
6. [The three logged-in surfaces](#6-the-three-logged-in-surfaces)
7. [Audit, observability, and the developer dashboard](#7-audit-observability-and-the-developer-dashboard)
8. [Operations](#8-operations)
9. [Testing](#9-testing)
10. [Known limitations + the operator/owner backlog](#10-known-limitations--backlog)
11. [Doc map](#11-doc-map)

---

## 1. What the platform is

### 1.1 The product

The platform is the **online home of student affairs at IIT Jammu**: the public-facing
institute site (councils, clubs, hostels, messes, events, announcements, resources)
**plus** a logged-in member experience (accounts, club pages with memberships, a
centralized event playground, a wall of fame, member profiles, notifications and
feedback, and an admin + developer back office).

It is designed so that **content and structure are data, not code** — councils, clubs,
positions, roles, permissions, content types and academic years are all rows edited
through the portal, never hardcoded. It is also designed to be **AI-ready**: clean
service boundaries and typed rows so a later agent layer can read structured data and
automate insights without scraping.

### 1.2 The V1 → V2 story

**V1** was a mostly-static Next.js marketing site backed by MongoDB/Mongoose, with a
tiny event API and a two-email hardcoded admin allowlist. It had well-documented
liabilities (see [KNOWN_ISSUES.md](KNOWN_ISSUES.md)): secrets committed to `README.md`,
an unauthenticated `POST /api/events`, base64 images stored in the database, four
near-identical hand-copied "Clubs" pages (~400 lines each), no tests, and authorization
by a hardcoded email array (`AUTHENTICATION_AND_RBAC.md` records the original allowlist:
`["tusharneymar8@gmail.com","apaarmsd@gmail.com"]`).

**V2** (this repository, branch `portal-v2`) is a ground-up rebuild on **PostgreSQL
(Neon) + Prisma** with a real, DB-derived RBAC engine, a generic CMS spine, an academic-
year engine, a flexible organization model, an audited mutation registry, and a full
member platform. The V1 database pivot resolved most V1 defects structurally (events
API auth, the allowlist, base64 images, no edit/delete, the broken `/past-events`
contract — all fixed by the move to Postgres + the CMS service). The rebuild was done
across **10 foundational sessions** (docs → DB/RBAC/auth → CMS → year engine → org model
→ events+announcements → resources+media → developer console → admin panel →
hardening/deploy), then a **Session-11 member-platform program (modules M0–M8)**, a
**Session-12 consolidation/hardening pass**, and a **Session-13 scoped-coordinator
surface + delivery documentation**.

### 1.3 The plugin model — one flag, two sites

The entire member platform is a **developer-controlled plugin**, gated behind one
feature flag: **`member_platform`** (a `feature_flag` row + [lib/platform/flags.mjs](lib/platform/flags.mjs)).
It is **off by default** and **fail-closed** (a DB error while reading the flag ⇒ treated
as off; the flag state is cached ~10s per process — [KNOWN_ISSUES #35](KNOWN_ISSUES.md)).

| Flag | The site becomes | Auth | Member surfaces |
|------|------------------|------|-----------------|
| **OFF** | The classic Sessions-1–10 public portal, exactly as before | **Google sign-in** (kept only while off), staff/admin at `/admin` | None (public reads only) |
| **ON** | The full member platform | **Email + password only** (Google rejected at the `signIn` callback) | Accounts, `/member`, login-only event playground, `/wall-of-fame`, profiles, feedback, `/coordinator` |

A developer toggles the flag at **`/admin/plugins`** (developer-only, audited). Because
the edge middleware keys off the JWT `mustChangePassword` flag — not the plugin — it is
naturally inert while the plugin is off (no account is ever flagged must-change then).

**By the numbers (as of Session 13):** 51 Prisma models, **52 permissions**, **11 seeded
roles**, **13 content types**, **11 forward migrations**, **530+ static tests** plus
per-file live suites on Neon, a route-render smoke, and CI.

---

## 2. Architecture

### 2.1 Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | **Next.js 16** (App Router, React 19) | Server Components for reads; Client Components only where interactivity is needed |
| Database | **PostgreSQL on Neon** (serverless) via **Prisma 6** | High per-query latency + auto-suspend shape the timeout/test design (see [MEMORY neon-latency]) |
| Auth | **NextAuth v4**, JWT sessions | Credentials (email+password) when the plugin is on; Google kept only when off |
| Password hashing | **argon2id** (`@node-rs/argon2`) | DL-020 |
| Media | **Cloudinary** | `f_auto,q_auto` transforms via `cloudinaryAutoUrl`; migration tool from `/public` |
| Mail (optional) | **nodemailer** on the institute VM | Lazy + injectable; off until the operator installs it and sets `MAIL_*` |
| Hosting | **Vercel** (hobby/pro) **or** an institute VM (PM2) | Both topologies documented in the runbook |

### 2.2 The request flow

```
Public visitor ─► Server Components read published content (year-scoped)
Member         ─► /member surfaces behind loadMemberContext (login-only, plugin on)
Admin/Developer─► /admin panel, RBAC-gated per module (loadModuleContext)
Coordinator    ─► /coordinator standalone back office (loadCoordinatorContext)
                        │
                        ▼ every mutation
              POST /api/admin/action  (the ONE audited mutation registry)
                        │
        ┌───────────────┼───────────────────────────┐
        ▼               ▼                            ▼
   PostgreSQL/Neon   Cloudinary                 audit_log (one attributed row/op)
     (Prisma)         (media)
```

### 2.3 Server Components + reads

Public and member reads are **Server Components** — data is fetched server-side (so
member PII never ships to the browser), and only HTML is sent. The data-driven `/org/*`,
`/events`, `/past-events`, `/announcements`, `/wall-of-fame`, and the whole admin/
coordinator panels are Server Components; the shared `MemberProfile` and
`ContributionSummary` renderers are Server Components so PII stays server-side and the
one client picker only ever receives public club/entity names.

### 2.4 NextAuth JWT + **live** per-request RBAC

Sessions are **JWT** (stateless — the token only proves identity). **Authorization is
never in the token.** On every protected action, effective permissions are resolved
**live from the DB** (`role_assignment` + `role_permission`, plus `user_permission_override`)
by [lib/rbac/authorize.mjs](lib/rbac/authorize.mjs). Consequences:

- A revoked role / deactivated account takes effect **on the next request**, not on token
  refresh (a valid token still *authenticates* for ≤24h — accepted, DL-019 /
  [KNOWN_ISSUES #22](KNOWN_ISSUES.md)).
- The heavy resolution is memoized **per request** via `React.cache` (`loadUserRbac`),
  collapsing the ~7 identical resolutions a single admin page triggers to one set of DB
  round-trips — but nothing is cached *across* requests.
- An un-memoized `loadUserRbacInputs(userId, client)` lets a non-request caller (CLI/test/
  the Session-13 scoped-grant discovery) load the same inputs with an explicit client.

### 2.5 Edge middleware

[middleware.js](middleware.js) is **Edge-safe** — it reads **only the JWT** (no DB). Its
single job: force a first-login password change by redirecting a `mustChangePassword`
user to `/account/password` (via the pure, unit-tested `shouldForcePasswordChange`). It
runs on app routes, skipping Next internals and static assets.

### 2.6 The one audited mutation route

Every admin/coordinator write goes through **`POST /api/admin/action`** ([app/api/admin/action/route.js](app/api/admin/action/route.js)):

1. `assertSameOrigin(req)` — CSRF same-origin check (`lib/http/guard.mjs`; why `NEXTAUTH_URL` must be the real origin).
2. `requireUser()` — authentication + a **live active-account** check (401/403).
3. `assertWithinRateLimit(adminActionLimiter, …)` — 60/min/account, per-process ([KNOWN_ISSUES #34](KNOWN_ISSUES.md)).
4. `dispatchAdminAction(action, args, …)` inside `withAuditContext` — a per-action registry
   ([lib/admin/handlers.mjs](lib/admin/handlers.mjs)) that either gates an institute-wide
   permission, or delegates to a service that authorizes at the item's year/lineage scope,
   or runs a console op. Each op writes **one attributed `audit_log` row**.

Public gated routes reuse the same `lib/http/guard.mjs` (CSRF + rate-limit + plugin gate):
`POST /api/account/{request,forgot,password}`, `POST /api/events`, `POST /api/events/participate`,
`GET /api/events/export`, `POST /api/feedback`, `POST /api/usage`.

---

## 3. The complete data model

51 Prisma models in [prisma/schema.prisma](prisma/schema.prisma), grouped by domain. The
authoritative schema narrative (ER reasoning, adversarial verification) is in
[docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md). Key durability decisions:

- **The `org_unit_lineage` pattern (cross-year durability).** An `OrgUnit` row is
  *year-scoped* (one row per year), but each unit belongs to a durable **`org_unit_lineage`**
  (a stable UUID). Memberships, achievement credits, event organizers, role assignments,
  and permission overrides all key on the **lineage** — so "this club" is the same
  identity across academic years, even though its yearly `OrgUnit` rows differ. This is
  what makes "what did this stakeholder contribute across the year(s)" answerable.
- **The `content_type` CMS spine (normalization + versioning).** All editorial content is
  `content_item` (identity, status, slug, cache columns for published/draft revision) +
  `content_revision` (immutable snapshots) + a per-type **`*_payload`** table (typed
  scalars + normalized list children in 3NF, not JSON arrays). Draft → publish → version
  history is uniform across every type. `content_type` is a **lookup table**
  (`content_type_def`), not an enum — adding a module is pure data + one payload table, no
  `ALTER TYPE`.
- **PII posture.** Member identity lives server-side; public shapes are display-**name**-only
  (the internal `app_user` UUID is never serialized to a browser). Person phone numbers are
  stored but withheld from public org pages ([KNOWN_ISSUES #28](KNOWN_ISSUES.md)). "Participants
  reached" is a **distinct COUNT, never a roster**.

### 3.1 Identity & access

| Model | Purpose |
|-------|---------|
| `User` (`app_user`) | One account per email. `status` (active/inactive/revoked), `isDeveloper`, `allowNormalView`, `mustChangePassword`, `passwordSetAt`, argon2id `passwordHash`. |
| `Account` / `VerificationToken` | NextAuth Prisma-adapter tables (Google account linking when off). |
| `Role`, `Permission`, `RolePermission` | RBAC as data — roles, atomic permissions, and their mapping. |
| `RoleAssignment` | Grants a role to a user, optionally **scoped** to an `orgUnitLineageKey` and/or `academicYearId`; `revokedAt` for live revocation. Indexed `(userId, revokedAt)`. |
| `UserPermissionOverride` | Per-email **grant/deny** of a single permission at an optional scope (deny wins). NULLS-NOT-DISTINCT unique = one override per (user, permission, scope). |
| `Person` | A directory person (name, photo, email?, phone?) — distinct from a login account. |

### 3.2 Academic-year engine & organization model

| Model | Purpose |
|-------|---------|
| `AcademicYear` | `label` ("2025-26"), start/end, `isCurrent`, `status` (with lock). |
| `TransitionRun` | Ledger of the Transition Wizard's idempotent year-forward copies. |
| `OrgUnitType`, `OrgUnitTypeAllowedChild` | Flexible unit types (council/club/hostel/mess/…) + the allowed-child hierarchy — data, not code. |
| `OrgUnit` | A **year-scoped** unit row (typeId, name, slug, parent, status). |
| `OrgUnitLineage` | The **durable** identity a unit's per-year rows share (the cross-year key everything else references). |
| `Position` | Position definitions (Coordinator/Secretary/Warden/…). |
| `Appointment` | Who holds which position, per year (with `title_override` for custom roles). |

### 3.3 CMS content (the spine)

| Model | Purpose |
|-------|---------|
| `ContentTypeDef` | The `content_type` lookup table (label, isYearScoped, supportsPublish, isOrgBound, payloadTable). |
| `ContentItem` | Content identity: type, year, orgUnit, `lineageKey`, slug, status, published/draft revision cache columns, pinned, archivedAt. |
| `ContentRevision` | Immutable per-edit snapshots (draft/publish/version + diff). |
| `ContentMedia` | Media attached to a revision. |
| **Payload tables** | `ClubProfilePayload` (+`ClubMissionPoint`), `HostelProfilePayload`, `MessProfilePayload` (+`MessMealTiming`), `EventPayload`, `AnnouncementPayload`, `FlagshipEventPayload`, `ResourcePayload`, `PageBlockPayload`, `AchievementPayload`. |

**The 13 content types** ([lib/cms/content-types.mjs](lib/cms/content-types.mjs)):
`council_profile`, `club_profile`, `hostel_profile`, `mess_profile` (org-bound profiles),
`event`, `announcement`, `flagship_event`, `resource`, `team_page`, `page_block`, and the
member-platform additions **`club_doc`** (M3, reuses `page_block_payload`), **`achievement`**
(M4, own `achievement_payload`), and **`events_organized`** (M5, curated markdown reusing
`page_block_payload`). Several types share one payload table with distinct handlers (e.g.
club/council share `club_profile_payload`).

### 3.4 Event playground (M5)

The event is a versioned `content_type='event'` **plus** a relational subsystem keyed on
the durable event content item:

| Model | Purpose |
|-------|---------|
| `EventEntity` | Admin/dev-defined custom organizing entities (a syndicate / external partner). |
| `EventOrganizer` | Credits an event to **exactly one** of {a club `org_unit_lineage`, a custom `event_entity`, a member `app_user`} — a one-target CHECK + three per-target uniques — with a `kind` (organizer/collaborator) + role tag. |
| `EventSettings` | 1:1 registration config: capacity + registration window + a `registration_closed` switch (a *stable* number the waitlist guard reads, deliberately NOT the versioned payload). |
| `EventRound` | Stages of an event. |
| `EventRegistration` | Per-user, deduped (partial-unique WHERE status ≠ cancelled); capacity → **WAITLIST** via a deferred cardinality trigger + auto-promote on any seat-vacating path. |
| `EventScore`, `EventAttendance` | Per-round (round_id) or overall (round_id NULL, partial unique) replace-set sheets → read-layer ranking. |
| `EventClosureReport` | Optional markdown per (event, submitter): role + contribution + self-reported budget; central review adds comment + corrected budget. |

Ranking is computed in the **read layer** — per-round (by points) and overall (sum) — via
the pure `rankEntries` (standard competition rank), batched from one score fetch.

### 3.5 Memberships & achievements

| Model | Purpose |
|-------|---------|
| `ClubMembership` | Durable many-to-many `app_user` ↔ `org_unit_lineage` (a member can belong to many clubs), `UNIQUE(user, lineage)`, status (active/inactive). Not per-year — lineage-keyed. |
| `AchievementCredit` | Credits one achievement to a **member OR a club** (`org_unit_lineage`) — exactly one target (CHECK) + two per-target uniques; durable ids feed profiles/contribution. |

### 3.6 Notifications, feedback, mail

| Model | Purpose |
|-------|---------|
| `Notification` | Centralized, **labelled** queue with human ref ids (`AR-/PR-NNNNN`), keyset pagination, assignment tracking; account/password requests + system alerts. |
| `Feedback` | Standalone public support tickets — unique `FB-NNNNN` ref id + a CHECK-guarded status workflow (open→triaged→in_progress→resolved/dismissed). Submitter linked from the session, never the body. |
| `AuthorizedSender` | The bulk-mail allowlist (`mail.manage` maintains it). |

### 3.7 Operations & observability

| Model | Purpose |
|-------|---------|
| `AuditLog` | BIGSERIAL append-only ledger: `actorUserId`, `action`, `entityType`, `entityId` (polymorphic, intentionally not an FK), `academicYearId`, `before`/`after` JSONB, `summary`, `ipAddress`, `userAgent`. Indexed for the viewer. |
| `PageVisit` | BIGSERIAL usage analytics (best-effort, **never audited**) — top sections/paths. |
| `BackupRecord` | Backup/export ledger (Session 8; M8 export writes a row). |
| `TableThreshold` | Per-table size thresholds the storage monitor flags against (non-blocking). |
| `FeatureFlag` | The plugin control plane (`member_platform`, developer-toggled, fail-closed). |
| `MediaAsset` | Media library + `/public`→Cloudinary migration tracking (originalPath preserved for reversibility). |

`FeatureFlag`, `Notification`, `ClubMembership`, `AchievementCredit`, `PageVisit`, and the
M5 tables are registered in `AUTO_AUDIT_SKIP` (they use a *semantic* audit row, not the
auto extension; `page_visit` is never audited at all).

---

## 4. RBAC in full

The engine is [lib/rbac/authorize.mjs](lib/rbac/authorize.mjs); the catalog is
[lib/rbac/permissions.mjs](lib/rbac/permissions.mjs). Permissions and roles are **data**
(rows), not code — the catalog file is the seed + the single source of truth for tests.

### 4.1 The resolution algorithm

`resolveEffectivePermissions(user, assignments, scope, overrides)`:

1. **Developer / `is_developer` short-circuit** → `grantsAll:true` (bypasses everything).
2. **Additive UNION** across the user's **in-scope, non-revoked, active** role
   assignments (each assignment's role permission keys are added).
3. **`grants_all` short-circuit** (e.g. `super_admin`) → `grantsAll:true`, **before** overrides.
4. **Per-user overrides** applied last: grants add, then **denies subtract — DENY WINS**,
   independent of array order. The unrestricted bypass (developer/`grants_all`) is
   **never** restricted by an override.

`inScope` matching: an assignment/override applies iff, for each scope dimension
(`orgUnitLineageKey`, `academicYearId`), it is either unscoped (NULL = "all") or equals the
requested value. A NULL request value with a non-NULL scope does **not** match — a
club-scoped grant never passes a global check. This is the seam that lets a coordinator
run their own club's events but not act globally.

> This model **revises the original DL-026 "no-deny" rule** (M2, DL-062): a deny override
> can now subtract a permission a role granted.

### 4.2 The 52 permissions (by module)

`year.*` (5) · `org_unit.*` / `org_type.manage` / `position.manage` / `appointment.*` /
**`membership.manage`** (org) · **`event.manage`** (events) · `content.*` /
`content_type.manage` (cms) · `media.*` (5) · `user.*` / `role.*` / **`permission.override`**
(users) · `audit.read` / `backup.*` / `dev.console` / **`storage.manage`** (ops) ·
`notification.{read,assign,resolve}` · `feedback.{read,resolve}` · `mail.{send,manage}`.

### 4.3 The 11 roles + their bundles

| Role | System? | grants_all? | Bundle |
|------|---------|-------------|--------|
| **developer** | yes | **yes** | Unrestricted (bypasses checks; `is_developer`). |
| **super_admin** | yes | no | Every permission explicitly (editable). |
| **content_editor** | no | no | Full content lifecycle + media upload/edit + read. |
| **org_manager** | no | no | Org units + positions + appointments + read. |
| **viewer** | no | no | Read-only (content/org/media/year). |
| **normal_user** | no (category) | no | **No back-office permissions** (a member; drives search/grouping). |
| **co_coordinator** | no (category) | no | Drafts a unit's content (create/edit, no publish). |
| **coordinator** | no (category) | no | Editor set + `membership.manage` + `event.manage` (scoped to their club). |
| **secretary** | no (category) | no | Coordinator + structure (`org_unit.update`, appointments). |
| **staff** | no (category) | no | Central content + `notification.read` + `feedback.read` + `mail.send` + **unscoped** `event.manage`. |
| **admin** | no (category) | no | The full catalog **minus** developer-only ops — **computed** from the catalog so it never drifts. |

The `admin` bundle excludes `dev.console`, `backup.create`, `backup.restore`,
`media.migrate`, and `storage.manage` (destructive/ops → reserved for super_admin /
developer). The seven `category:true` roles (`normal_user` … `admin`) form the stakeholder
ladder that the M2 search facet uses.

### 4.4 Global vs. scoped grants

A `role_assignment` (or override) can be **GLOBAL** (no scope columns) or **SCOPED** to an
`org_unit_lineage` + academic year. A staff/admin/developer holds `event.manage`
*unscoped* → the central playground. A coordinator holds it *scoped* to a tagged organizing
club lineage → they run only their own event. Central-only actions (organizer tagging,
custom entities, closure **review**) stay `requireGlobal`.

### 4.5 The three statuses + `allow_normal_view`

| Status | Log in? | Browse public | Own achievements | Event participation | Back office |
|--------|---------|---------------|------------------|---------------------|-------------|
| **active** | yes | yes | yes | yes | yes (if permitted) |
| **inactive** | yes | yes | yes | **no** (`assertCanParticipate` blocks) | no (resolver returns no perms) |
| **revoked** | **no** | yes (public only) | — | — | — |

The single source of truth is the pure, client-safe [lib/auth/access.mjs](lib/auth/access.mjs)
(`canLogin`/`canParticipate`/`canViewNormal`/`resolveSurface`/`scopeMatches`). The per-account
**`allow_normal_view`** toggle withholds the member view independently of status. The RBAC
resolver already returns **no permissions** for non-active users, so inactive/revoked have
no back-office access regardless of their roles.

---

## 5. Every module

### 5.1 Sessions 1–10 (the V2 foundation)

| Session | What it delivered |
|---------|-------------------|
| **1** | Phase-0 analysis + docs: the V1 inventory, target architecture, schema design, decision log. |
| **2** | DB + RBAC + auth foundation: Postgres/Prisma, the RBAC tables, the `audit_log` table, credentials auth — resolved the V1 events-API-auth and email-allowlist defects. |
| **3** | The CMS spine: `content_item`/`content_revision`/payload tables, draft/publish/version, the single audit choke point (`lib/cms/audit.mjs` via a Prisma `$extends`). |
| **4** | The academic-year engine: years, lock/unlock, the Transition Wizard (idempotent year-forward copy). |
| **5** | The flexible organization model: unit types/hierarchy, units, positions, appointments, the durable lineage, the data-driven `/org/[type]/[slug]`. |
| **6** | Events + announcements rebuilt as CMS content (fixed base64 images, no-edit/delete, the `/past-events` contract). |
| **7** | Resources + media: `resource` content, the `media_asset` library, the reversible `/public`→Cloudinary migration tool. |
| **8** | The developer console readers: system status, migration/transition/media status, reports, the audit viewer, the backup ledger. |
| **9** | The RBAC-gated **admin panel** + the ONE mutation registry (`POST /api/admin/action`) + the Users & Roles service (`lib/users/admin.mjs`) with the four privilege-escalation guards. |
| **10** | Hardening + deploy: security headers, CSRF same-origin + per-process rate-limiter (`lib/http/guard.mjs`), Core-Web-Vitals (`cloudinaryAutoUrl`, one `next/font` load, unified brand blue `#003f87`), CI, the operations runbook. |

### 5.2 Session 11 — the member-platform program (M0–M8)

Executed order **M0 → M2 → M1 → M7/M8 spine → M3 → M4 → M5 → M6**. Every module is built
*inside* the `member_platform` plugin on the existing spine (no parallel pipelines).

- **M0 — Auth & account lifecycle.** Email+password only (Google rejected when on);
  admin-provisioned accounts singly + **bulk CSV**; `must_change_password` forces a
  first-login change (edge middleware); public **"Request an account"** / **"Forgot
  password"** forms create `notification` rows (human ref ids, race-free dedup, existence
  never leaked); an admin/dev **Password Management** tab assigns → generates → delivers via
  the institute's *external* mail. Key files: [lib/platform/flags.mjs](lib/platform/flags.mjs),
  [lib/users/admin.mjs](lib/users/admin.mjs), `lib/auth/{password-policy,password-generator,password-reset}.mjs`.
  Routes: `/login`, `/account/{request,forgot,password}`, `/admin/plugins`, `/admin/requests`.
- **M2 — RBAC categories + per-email overrides + smart search.** The 6 category roles;
  the `user_permission_override` table + the deny-wins resolver revision; the pure email
  parser (`<year><level u|p|r><branch><serial>@iitjammu.ac.in`) + a debounced admin filter.
  Files: [lib/users/search.mjs](lib/users/search.mjs), `permission.override.{set,remove}` actions.
- **M1 — User status & access modes.** The `active/inactive/revoked` enum (forward-migrated
  with a `CASE` backfill); live enforcement in [lib/auth/access.mjs](lib/auth/access.mjs) +
  `lib/auth/session.mjs` (`requireMember` / `assertCanParticipate` / `requireScopedPermission`);
  the three surfaces + the `allow_normal_view` toggle; the `/member` view (`loadMemberContext`).
- **M7/M8 spine — notifications/feedback + developer dashboard.** Generalized notifications
  (label + keyset + generic dedup); the standalone `feedback` table + public `/feedback`;
  the `groupByWindow` past/current/upcoming primitive; audit **export** (`exportAuditLog`);
  hidden **usage analytics** (`page_visit` + beacon + `getUsageAnalytics`); per-table
  **storage monitoring** + thresholds + export + allowlisted/confirm-gated truncate
  (dev-only `storage.manage`); **bulk mail** (`AuthorizedSender` allowlist + rate-limited
  `sendBulk` + lazy nodemailer). Files: `lib/feedback/*`, `lib/devconsole/storage.mjs`,
  `lib/mail/{progress,service}.mjs`. Routes: `/admin/feedback`, `/admin/mail`, `/admin/devdash`.
- **M3 — Club/council pages + memberships.** The `club_membership` many-to-many + an
  idempotent bulk CSV importer (reports missing accounts, never auto-creates); the `club_doc`
  markdown content type; the pure escape-first `renderMarkdown` (`lib/markdown/render.mjs`);
  club announcements with opt-in `sync_to_central`; the one data-driven tabbed page
  (`OrgUnitTabs` over `getClubPageView`). New permission `membership.manage` → 51.
- **M4 — Wall of Fame.** The `achievement` content type (own `achievement_payload` = typed
  scalars + a `blocks` JSONB of hybrid ordered blocks) via a `coercePayload` hook; the
  standalone `achievement_credit` (member OR club). Public `/wall-of-fame` + the club
  Achievements tab. Reuses `content.*` — no new permission (still 51).
- **M5 — Centralized Event Playground** (the largest module). The `event.manage`
  permission (→ 52) + `assertEventManage` seam; `event_organizer`/`event_entity`/`event_settings`/
  `event_round`/`event_registration`/`event_score`/`event_attendance`/`event_closure_report`;
  login-only participation via `POST /api/events/participate` (`requireMember` +
  `assertCanParticipate`); capacity→waitlist + auto-promote; read-layer ranking; CSV
  downloads (`GET /api/events/export`); the curated `events_organized` doc (→ 13 content
  types) with an audited **change-history dev-dashboard tab**. Files: `lib/events/{authz,forms,registration,downloads,organized,public}.mjs`.
  Routes: `/events`, `/events/[slug]`, `/events/organized`, `/admin/events`.
- **M6 — Member profiles & contribution.** A **read-only aggregation** — NO new table/
  permission/mutation. `lib/member/profile.mjs` (identity, roles, affiliations, full event
  involvement with overall rank via `rankEntries`, credited achievements),
  `lib/member/contribution.mjs` (per-stakeholder year contribution by durable id;
  "participants reached" as a distinct COUNT), and the pure `lib/member/summary.mjs`.
  Surfaces: `/member/profile`, `/admin/users/[userId]`, `/admin/contribution`.

### 5.3 Session 12 — consolidation / deploy-hardening

No new module. The full test gate (517 static + lint + build; every live suite per-file,
single-fork, warm Neon); CI extended to warm Neon + single-fork; a reusable route-render
smoke ([scripts/route-smoke.mjs](scripts/route-smoke.mjs), `npm run test:routes`); the
[WEBSITE_TESTING_SOP](docs/WEBSITE_TESTING_SOP.md); a small logged-in member nav
(`MemberNav`+`SignOutButton`). A per-feature × per-role adversarial audit found 21 defects →
**11 fixed** (`docs/CONSOLIDATION_BUGLOG.md` B1–B11: e.g. the inactive+must-change lockout
via a new `requireLoggedInAccount` boundary, the `/events/[slug]` revoked/view-disabled
gate, capacity-raise waitlist promotion, non-destructive membership re-import, a shared CSV
formula-injection guard `lib/csv/cell.mjs`, fail-closed export auditing, member sign-out) +
10 documented-as-accepted. No schema change.

### 5.4 Session 13 — the standalone `/coordinator` surface

A club-scoped coordinator (a `role_assignment` with `event.manage`/`membership.manage`
**scoped** to an `org_unit_lineage`) was invisible to the *global* admin nav, so they could
only dispatch scoped mutations programmatically ([KNOWN_ISSUES #43](KNOWN_ISSUES.md)).
Session 13 ships the missing **surface**: a standalone **`/coordinator`** back office (its
own never-throws `loadCoordinatorContext`, **not** under the hardened `/admin` gate),
plugin-independent and **active-only**, where a coordinator manages **their unit's**:

- **events** — per-event settings, rounds, registrations (roster + add/status/remove),
  score & attendance replace-sheets, own **closure report** submit, CSV downloads;
- **members** — roster + add/status/remove + non-destructive bulk CSV import;
- **contribution** — the M6 club slice via the shared `ContributionSummary`.

Driven by a **NEW inverse-of-the-resolver scoped-grant discovery**
([lib/rbac/grants.mjs](lib/rbac/grants.mjs)): `scopedLineagesFor` enumerates the lineages a
user holds a permission at as a *scoped* grant (built on `resolveEffectivePermissions` for
exact live parity — deny-wins, developer short-circuit, year dimension), and
`listManageableLineages` resolves them to current-year unit display. `lib/events/manage.mjs`
adds `listEventsForManager` + `getManagedEvent` (gated by `assertEventManage` first, then
composing the gated sub-reads so the page shows live data). Central-only actions stay
`requireGlobal` and are absent from the surface. **No new permission/table/migration/mutation**
— every action re-authorizes via the existing seams. Routes: `/coordinator`,
`/coordinator/events`, `/coordinator/events/[eventId]`, `/coordinator/members`,
`/coordinator/contribution`.

---

## 6. The three logged-in surfaces

| Surface | Route root | Guard | Who | What they do |
|---------|-----------|-------|-----|--------------|
| **Member** | `/member` | `loadMemberContext` (states: plugin-off→404, unauthenticated, revoked, view-disabled, ok) — admits active + inactive | Any logged-in member | View profile, "my clubs", browse the playground; a coordinator sees a link to `/coordinator`. |
| **Admin + Developer** | `/admin` | `loadModuleContext` / `loadAdminContext` — RBAC-gated per module, **global scope**, active-only | staff/admin/super_admin/developer (and any global grant) | The full back office: Content, Organization, Academic Years, Event Playground, Media, Users & Roles, Contribution, Password Management, Feedback, Mail, Plugins, Developer Console, Developer Dashboard. |
| **Coordinator** | `/coordinator` | `loadCoordinatorContext` — never-throws, scope-aware, active-only, **not** under the `/admin` gate | A purely club-scoped coordinator (or anyone with a scoped `event.manage`/`membership.manage`) | Manage only *their* unit's events, members, and contribution. |

The admin nav ([lib/admin/nav.mjs](lib/admin/nav.mjs)) shows only the modules the viewer's
resolved permissions satisfy (`buildAdminNav`); developer/`grants_all` sees everything; the
Dashboard shows to anyone with at least one module. `/admin/plugins` and the console/
dev-dashboard are gated on developer-only permissions.

---

## 7. Audit, observability, and the developer dashboard

- **Audit.** Every mutation writes **one attributed `audit_log` row** (actor, action,
  entity, before/after JSONB, IP via `net.isIP`, academic year) — the central choke point is
  `lib/cms/audit.mjs` (a Prisma `$extends`) plus the semantic path used by multi-step flows.
  Cross-stakeholder/cross-domain edits (a higher stakeholder editing a lower one's domain)
  are always logged + attributed. Audit writes are best-effort (after commit) — accepted
  ([KNOWN_ISSUES #24](KNOWN_ISSUES.md)); the export path writes a **guaranteed** independent
  row so a PII dump always leaves a trail.
- **Developer Console** (`/admin/console`, gated `dev.console`/`audit.read`/`backup.*`):
  system status (DB health, migration diff, transition history, media-migration plan),
  testing + cost reports, the audit-log viewer (filter/paginate/drill-down; list/timeline
  rows omit ip/user-agent, shown only in the single-entry drill-down since `audit_log`
  carries PII), the backup ledger, and recovery actions. Also driveable headless via
  `npm run db:console [-- --audit]`.
- **Developer Dashboard** (`/admin/devdash`, M8): the **Action Log / Change History**
  export (JSON/CSV, PII-minimized — including every add/update of the `events_organized`
  markdown, `getEventsOrganizedChangeHistory`/`exportEventsOrganizedHistory`), **usage
  analytics** (`getUsageAnalytics` — top sections/paths, fed by the `UsageBeacon` in the
  root layout → `POST /api/usage`), and **per-table storage** (`getTableSizes` via
  `pg_total_relation_size`, thresholds, over-threshold flags that are **non-blocking** +
  a deduped alert, per-table export → a backup_record, and an allowlisted/confirm-gated
  truncate). Infra usage (Neon size + Cloudinary) extends `getInfraUsage` to plan
  subscriptions.

---

## 8. Operations

Full runbook: [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md). CLI reference:
[docs/DEV_CLI.md](docs/DEV_CLI.md). Golden rule: **never** `prisma db pull` / `migrate
reset` / `db:reset` against the real DB — raw-SQL objects (partial uniques, triggers,
CHECKs) live in migrations and are invisible to Prisma drift detection.

- **Migrations.** 11 forward migrations under `prisma/migrations/` (init + a singleton-guard
  fix + M0/M1/M2/M3/M4/M5/M7M8 + the notification-dedup unique + the role-assignment index).
  Apply with `npm run db:migrate` (`prisma migrate deploy`, uses `DIRECT_URL`). Each schema
  change = a **new forward migration** (Prisma model + raw-SQL tail).
- **Seed.** `npm run db:seed` (idempotent): academic year, **52 permissions, 11 roles, 13
  content types**, org types/positions, and the bootstrap developer/admin accounts
  (`BOOTSTRAP_DEVELOPER_EMAIL`/`_PASSWORD`, `BOOTSTRAP_ADMIN_EMAILS`). Re-seed never resets
  the operator's plugin `enabled` state.
- **Live-data imports (operator step, idempotent, resumable).** `npm run db:import:org`
  (~15 min: 4 councils / 30 clubs / 6 hostels / 5 messes / committee) → `db:import:events`
  → `db:import:resources`. Until org import runs, `/org/*` shows the correct empty
  data-driven state ([KNOWN_ISSUES #27](KNOWN_ISSUES.md)).
- **Membership/CSV imports.** Coordinators submit email lists; the idempotent
  `importClubMemberships` syncs them, reports missing accounts, never auto-creates. A shared
  formula-injection guard (`lib/csv/cell.mjs`) protects all CSV output.
- **Media migration.** `npm run db:migrate:media` (dry-run) → `-- --apply` → optional
  `-- --rollback` (reversible; restores local URLs, does not delete remote assets). Needs
  `CLOUDINARY_*`. Pruning `/public` is a careful multi-step operator procedure (runbook §3.1,
  [KNOWN_ISSUES #18](KNOWN_ISSUES.md)) — some V1 pages still hardcode `/public` paths.
- **Mail config.** Bulk mail is off until the operator runs `npm install nodemailer` and
  sets `MAIL_HOST`/`MAIL_PORT`/`MAIL_USER`/`MAIL_PASS` ([KNOWN_ISSUES #40](KNOWN_ISSUES.md));
  until then `sendBulk` returns a friendly 503. Initial account passwords always go via the
  institute's *external* mail, never the app.
- **Deploy.** `npm ci` → `npm run db:migrate` → `npm run build` → `pm2 restart …` (VM) or set
  §1 env vars on Vercel. Required env: `DATABASE_URL` (pooled), `DIRECT_URL` (unpooled),
  `NEXTAUTH_SECRET` (fresh per env), `NEXTAUTH_URL` (the real origin — also the CSRF check),
  Google + Cloudinary vars. Backups precede migrations; a verified backup ledger
  (`backup_record`) tracks exports.

---

## 9. Testing

Strategy: [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md); full-site procedure:
[docs/WEBSITE_TESTING_SOP.md](docs/WEBSITE_TESTING_SOP.md). Four layers, cheap → expensive:

| # | Layer | Command | Catches |
|---|-------|---------|---------|
| 1 | **Static gate** | `npm test && npm run lint && npm run build` | logic/regression, lint, build breaks (**530+ static tests**) |
| 2 | **Live-DB gate** | per-file `RUN_DB_TESTS=1 … vitest run tests/<x>.db.test.mjs --pool=forks --poolOptions.forks.singleFork` | real DB behaviour: authz, guards, persistence, per-mode allow/deny |
| 3 | **Route-render smoke** | `npm run dev` then `npm run test:routes` | crashed pages (5xx), broken links, dynamic-route render errors |
| 4 | **Per-mode functional matrix** | the manual click-through in the SOP | end-to-end + cross-stakeholder audit + UX gaps |

- **Static suites** (~50 files) cover the pure logic: RBAC resolution, the access matrix,
  CMS handlers/diff/visibility, the markdown renderer, memberships, achievements, the event
  playground validators + `rankEntries` + CSV quoting, feedback, mail progress, the smart
  search, migration blocks, and the `coordinator.test.mjs` scoped-grant parity (13).
- **Live per-file suites** run on a warm Neon, isolated (`m0.db`…`m8.db`, plus Sessions-1–10
  `cms/year/org/events/resources/media/devconsole/users/smoke` and `coordinator.db` 5/5).
  They are run **single-fork** because running all DB suites in parallel against one Neon DB
  can produce transient P2025s in the stateful `year.db` suite — a test-harness isolation
  artifact, not a code defect ([KNOWN_ISSUES #39](KNOWN_ISSUES.md)).
- **CI** (`.github/workflows/ci.yml`): static + lint + build on every push/PR; the live-DB
  job runs nightly / on manual dispatch, secret-gated, warming Neon (`prisma migrate deploy`)
  and running single-fork. `secret-scan.yml` runs gitleaks.
- **The golden rule of the SOP:** a feature is "tested" only when you have confirmed it
  *worked and persisted* in the mode it is meant for **and** that it was *correctly refused*
  in a mode it is not — allow-path and deny-path, across the 11-role × 3-status matrix,
  plugin ON and OFF.
- Each module session closes with a **multi-agent adversarial review** (a multi-dimension
  finder → per-finding 2-verifier workflow); findings are triaged, fixed, and re-verified.

---

## 10. Known limitations & backlog

Full register: [KNOWN_ISSUES.md](KNOWN_ISSUES.md). The **accepted** (deliberate, documented)
items:

- **Auth-revocation latency (#22).** A valid JWT still *authenticates* for ≤24h after
  sign-out; authorization + status are re-checked live, so protected actions are blocked
  immediately (DL-019).
- **Plugin gating cache (#35).** The flag is cached ~10s per process; a toggle propagates
  within ~10s across warm instances. Fail-closed.
- **Per-process rate limiters (#34, #37).** In-memory windows — a coarse abuse dampener, not
  a global quota; front with a shared store (Upstash/Redis) for a hard limit.
- **No CSP header (#33).** Safe headers are set; a strict CSP needs a nonce pipeline
  (deferred).
- **Bulk mail sends synchronously (#45) + needs operator config (#40).** No job queue yet; a
  large multi-batch send could exceed the request timeout. Inert until configured.
- **M6 lists are bounded, not keyset-paginated (#44).** Bounded in practice (a member joins
  a limited number of events); the cursor columns exist if paging is ever needed.
- **"Participated" counts include waitlisted-only registrations (#46)** — a semantic choice;
  each row carries its status so the UI distinguishes.
- **Two admin nav items can show for a permission the page then rejects (#47)** — cosmetic,
  fails closed, only via a non-standard custom grant.
- **Documented scope/behaviour notes (#23, #25, #26, #28, #29, #30, #31, #36).** Payload-level
  lock guards, the errata path, the non-atomic-by-design transition, PII-withheld phones,
  the events-importer resume, the ungated status building-blocks, hard-delete authorship
  nulling.

**Operator/owner backlog (the only remaining work):**
1. **Operator:** populate the live year (`db:import:org` → `db:import:events` →
   `db:import:resources`, #27); run the media migration + safe `/public` prune (#18);
   optionally enable bulk mail (#40/#45).
2. **Owner:** rotate/remove the V1 leaked secrets in `README.md` + purge history (#1), then
   drop the `.gitleaks.toml` by-SHA allowlist; consider rotating the Neon password (#19).
3. **Client hand-over:** follow `CLIENT_INSTRUCTIONS.md`; share the delivery docs
   (`DELIVERABLES_INDEX.md`).

> **Cost posture.** The platform is designed to run on **free tiers** (Neon free, Cloudinary
> free, Vercel hobby/pro) at student scale; bulk mail uses the institute's own SMTP/VM
> (nodemailer), not a paid service. Any figure you cite for capacity or spend is **indicative
> only — verify at the provider's official pricing page (neon.tech/pricing,
> cloudinary.com/pricing, vercel.com/pricing); prices change.**

---

## 11. Doc map

Repo-root trackers: [CURRENT_STATUS.md](CURRENT_STATUS.md) (what's done),
[NEXT_TASK.md](NEXT_TASK.md) (what's next), [KNOWN_ISSUES.md](KNOWN_ISSUES.md),
[TODO.md](TODO.md), [README.md](README.md). Client-facing delivery set (root):
`USER_MANUAL.md`, `RESOURCES.md`, `INVESTOR_EMAIL.md`, `ANNOUNCEMENT_EMAIL.md`,
`DELIVERABLES_INDEX.md`, `CLIENT_INSTRUCTIONS.md`, and this `Notebook.md`.

Deep-dives in `docs/`:

| Area | Document |
|------|----------|
| Session process | [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md) |
| Every decision | [docs/DECISION_LOG.md](docs/DECISION_LOG.md) (DL-001…DL-096) |
| Schema (authoritative) | [docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md) |
| Architecture | [docs/TARGET_ARCHITECTURE.md](docs/TARGET_ARCHITECTURE.md), [docs/CURRENT_ARCHITECTURE.md](docs/CURRENT_ARCHITECTURE.md) |
| Auth & RBAC | [docs/AUTHENTICATION_AND_RBAC.md](docs/AUTHENTICATION_AND_RBAC.md) |
| Full-site testing | [docs/WEBSITE_TESTING_SOP.md](docs/WEBSITE_TESTING_SOP.md), [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) |
| Operations | [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/DEV_CLI.md](docs/DEV_CLI.md) |
| Admin panel | [docs/ADMIN_PANEL_GUIDE.md](docs/ADMIN_PANEL_GUIDE.md), [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) |
| Developer guide | [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) |
| Member platform plan | [docs/MEMBER_PLATFORM_PLAN.md](docs/MEMBER_PLATFORM_PLAN.md), [docs/MILESTONE_PLAN.md](docs/MILESTONE_PLAN.md) |
| Performance / security | [docs/PERFORMANCE.md](docs/PERFORMANCE.md), [docs/SECURITY.md](docs/SECURITY.md) |
| Backup / migration | [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md), [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md), [docs/DATA_MIGRATION_REPORT.md](docs/DATA_MIGRATION_REPORT.md) |
| Consolidation bug log | [docs/CONSOLIDATION_BUGLOG.md](docs/CONSOLIDATION_BUGLOG.md) |
| Changelog | [docs/CHANGELOG.md](docs/CHANGELOG.md) |

Key code entry points: [prisma/schema.prisma](prisma/schema.prisma),
[lib/rbac/permissions.mjs](lib/rbac/permissions.mjs), [lib/rbac/authorize.mjs](lib/rbac/authorize.mjs),
[lib/rbac/grants.mjs](lib/rbac/grants.mjs), [lib/admin/nav.mjs](lib/admin/nav.mjs),
[lib/cms/content-types.mjs](lib/cms/content-types.mjs), [lib/auth/access.mjs](lib/auth/access.mjs),
[lib/platform/flags.mjs](lib/platform/flags.mjs), [app/api/admin/action/route.js](app/api/admin/action/route.js),
[middleware.js](middleware.js).
