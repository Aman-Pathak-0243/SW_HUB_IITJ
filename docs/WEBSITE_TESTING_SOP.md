# Website Testing SOP — full-site, per-mode functional test

**Purpose.** A repeatable procedure to test **the entire IIT Jammu member platform as
if it were hosted in production**, exercising **every feature in every access mode**
(developer, admin, staff, secretary, coordinator, co-coordinator, normal member —
each in the `active` / `inactive` / `revoked` status — and the anonymous public
visitor), finding bugs, logging them, fixing them, and re-verifying.

Use this whenever you want a full-site confidence pass: before a release, after a big
merge, after a schema/seed change, or on a schedule. It is the human-facing companion
to the automated suites (`docs/TESTING_STRATEGY.md`).

> **Golden rule of this SOP:** a feature is "tested" only when you have (1) done the
> action in the mode it is meant for and confirmed it *worked and persisted*, AND
> (2) tried it in a mode it is **not** meant for and confirmed it was *correctly
> refused*. Allow-path **and** deny-path, every time.

---

## 0. TL;DR — the four layers

Run them in order; each is cheap-to-expensive and catches a different class of bug.

| # | Layer | Command | Catches |
|---|-------|---------|---------|
| 1 | **Static gate** | `npm test && npm run lint && npm run build` | logic/regression bugs, type/lint, build breaks |
| 2 | **Live-DB gate** | per-file `RUN_DB_TESTS=1 … vitest run tests/<x>.db.test.mjs --pool=forks --poolOptions.forks.singleFork` | real DB behaviour: authz, guards, persistence, per-mode allow/deny |
| 3 | **Route-render smoke** | `npm run dev` then `npm run test:routes` | crashed pages (5xx), broken links, dynamic-route render errors |
| 4 | **Per-mode functional matrix** | the manual click-through in §5 (or drive services as in §4.3) | end-to-end "admin created X and it shows up", cross-stakeholder audit, UX gaps |

If you only have five minutes: Layer 1. If you have an hour and a warm DB: all four.

---

## 1. Prerequisites & environment

1. **Env.** `.env.local` must have `DATABASE_URL` + `DIRECT_URL` (Neon), `NEXTAUTH_SECRET`,
   `NEXTAUTH_URL`. Optional: `BOOTSTRAP_DEVELOPER_EMAIL`/`_PASSWORD`, `BOOTSTRAP_ADMIN_EMAILS`,
   `CLOUDINARY_*`, `MAIL_*`.
2. **Install + generate.** `npm install` (or `npm ci`) then `npm run db:generate`.
3. **Migrate + seed (operator step — idempotent).**
   ```bash
   npm run db:migrate      # prisma migrate deploy — applies forward migrations
   npm run db:seed         # idempotent: 52 permissions, 11 roles, 13 content types, bootstrap users
   ```
   Confirm with the **read-only** `npx prisma migrate status` → *"Database schema is up to date!"*.
4. **Neon is slow + auto-suspends** (~30–60 s per live test on a cold/loaded compute).
   **Warm it first** with `npm run db:migrate`, and **never run all live suites in one
   parallel process** — see §3.
5. **Plugin state.** The whole member platform is gated behind the `member_platform`
   feature flag. Confirm it is **ON** for member-platform testing (a developer toggles it
   at `/admin/plugins`; seeded off by default). With it **OFF** the site is the
   Sessions-1–10 public portal — test that mode too (§6).

---

## 2. The access modes, and how to get a test account in each

There are **two orthogonal axes**: the **role/category** (what you're allowed to do) and
the **status** (whether/how you can log in). Test the cross-product that matters.

### 2.1 Roles / categories (RBAC — 11 seeded roles)

| Role key | What it can do | Notes |
|----------|----------------|-------|
| `developer` | **everything** (grants_all bypass) | the bootstrap `developer@iitjammu.ac.in`; the ONLY role that sees Plugins/Console/Dev-Dashboard + `storage.manage` |
| `super_admin` | full permission catalog (no grants_all bypass) | seeded from `BOOTSTRAP_ADMIN_EMAILS` |
| `admin` | full catalog **minus** dev-only (`dev.console`/`backup.*`/`media.migrate`/`storage.manage`) | the M2 top "category" |
| `staff` | central content & announcements, feedback.read, mail.send, notification.read | sees the request queue |
| `secretary` | coordinator perms **+ org structure** (units/appointments) — scope to a council | scoped grant |
| `coordinator` | full content lifecycle + media + membership.manage + event.manage — scope to a club | scoped grant |
| `co_coordinator` | draft content only (create/edit, no publish) — scope to a unit | scoped grant |
| `normal_user` | **no** back-office permissions | the default member; drives search/grouping + member features |
| `content_editor`, `org_manager`, `viewer` | legacy Session-2 operational roles | still seeded; test if used |

**Scope matters.** Coordinator/secretary/co-coordinator grants are usually **scoped** to
an `orgUnitLineageKey` (and optionally a `academicYearId`). A scoped grant must pass the
service's *scoped* check for its own unit and **fail** the *global* check (e.g. a club
coordinator can manage their own club's event but not another club's, and does not see the
global `/admin/events` nav — KNOWN_ISSUES #43).

### 2.2 Status (M1 — live-enforced, not in the JWT)

| Status | Log in? | Browse public? | Member view? | Participate in events? | Back-office? |
|--------|---------|----------------|--------------|------------------------|--------------|
| `active` | ✅ | ✅ | ✅ | ✅ | ✅ (if role permits) |
| `inactive` | ✅ | ✅ | ✅ (sees own achievements) | ❌ | ❌ (resolver returns no perms) |
| `revoked` | ❌ | ✅ (public only) | ❌ | ❌ | ❌ |

Plus a per-account **`allow_normal_view`** toggle that withholds the member view even when
`active`.

### 2.3 Creating the test accounts

The cleanest way is as the **developer** (once, then reuse):

- **UI:** sign in at `/login` as the developer → `/admin/users` → *Create user* (single) or
  *Bulk import* (CSV `email,password`). Grant a role via the row action (scope it for
  coordinator/secretary). Flip status with Activate / Deactivate / Revoke. Toggle
  "allow normal view" in the edit modal. Overrides via the *Permission overrides* modal.
- **Programmatically** (fast, for the functional matrix in §4.3) — see the pattern the
  live suites use: `lib/users/admin.mjs#createUser` / `grantRole` / `setUserStatus`, driven
  with an actor `{ userId: <developerId> }`. Always **clean up** created rows + their
  `grant_role`/`revoke_role` audit rows at the end (see any `*.db.test.mjs` teardown).

> **Never** test with real student accounts or real passwords. Use throwaway emails in a
> reserved test namespace (e.g. `zz-test-*@iitjammu.ac.in`) so cleanup is unambiguous.

---

## 3. Layer 2 — the live-DB gate (per-file, single-fork)

The live suites are the authoritative "does this feature actually work against Postgres,
in each mode" check. **Warm Neon first**, then run **per file** (or single-fork) — never
the whole set in one default (parallel) process, because the stateful `year.db` suite
mutates the shared current-year row and races the others (KNOWN_ISSUES #39).

> **Fastest way to run this locally — Docker Postgres (Session 13).** Instead of Neon, run a
> local `postgres:16` (identical engine, all guards intact — SQLite cannot host the triggers /
> citext / partial uniques / `FOR UPDATE SKIP LOCKED`, so it is not an option):
> ```bash
> cp env.test.example .env.test        # once (git-ignored)
> npm run db:local:up && npm run db:local:setup && npm run test:db   # 19/19 green in ~20s
> ```
> `npm run test:db` runs every live suite **per-file** (auto-discovered) against `.env.test`.
> Full details in [TESTING_STRATEGY.md](TESTING_STRATEGY.md) § "Local Postgres for testing (Docker)".

```bash
npm run db:migrate     # warm + confirm schema

# One suite:
RUN_DB_TESTS=1 ./node_modules/.bin/dotenv -e .env.local -- \
  npx vitest run tests/m5.db.test.mjs --pool=forks --poolOptions.forks.singleFork

# All live suites, sequentially, one process each (robust; slow on a cold Neon):
for s in cms year org events resources media devconsole users \
         m0 m1 m2 m3 m4 m5 m6 m7 m8; do
  RUN_DB_TESTS=1 ./node_modules/.bin/dotenv -e .env.local -- \
    npx vitest run "tests/$s.db.test.mjs" --pool=forks --poolOptions.forks.singleFork \
    || echo "FAIL: $s"
done
```

**Live-suite → feature map** (what each proves, and in which modes):

| Suite | Feature | Modes/authz it exercises |
|-------|---------|--------------------------|
| `db.smoke` | schema/seed sanity | triggers, uniques, developer grants_all |
| `cms.db` | CMS lifecycle | draft/publish/restore/version/visibility/lock guard |
| `year.db` | academic year engine | resolve/history/transition/lock (**run isolated**) |
| `org.db` | org model | hierarchy/type/cardinality guards, importer, public read |
| `events.db` | events + announcements | window/audience/split/pinned/idempotency |
| `resources.db` | resources | per-unit resource lineage + public view |
| `media.db` | media | inventory writer + Cloudinary URL layer |
| `devconsole.db` | dev console readers | audit keyset/stats, status, backup ledger, 401/403 gate |
| `users.db` | users & roles | CRUD, self-lockout, system-role protection, grant escalation |
| `m0.db` | auth & accounts | plugin toggle (dev-only), must-change, reset/delete escalation |
| `m1.db` | status & surfaces | login per status, participation, scoped coordinator grant, allow-normal-view, self-lockout |
| `m2.db` | RBAC overrides + search | grant/deny-wins/escalation guard/scoped/smart-search |
| `m3.db` | club pages + memberships | membership idempotency + scoped 403 + PII gate, importer, club_doc, sync-to-central |
| `m4.db` | wall of fame | achievement CRUD + publish, credits one-target, central-scope 403, PII no-uuid |
| `m5.db` | event playground | assertEventManage global-vs-scoped, waitlist+auto-promote, ranking, closure review, CSV, PII |
| `m6.db` | profiles & contribution | aggregation + rank, contribution counts, PII, empty/unknown safety |
| `m7.db` | notifications/feedback | feedback lifecycle + reopen-clears + keyset walk, notification dedup |
| `m8.db` | dev dashboard | usage/storage/truncate guards + export audit trail, mail allowlist + rate-limited send |

A green run here = every feature's core allow/deny + persistence is correct at the service
layer. Layers 3–4 add the rendering + end-to-end + UX dimensions.

---

## 4. Layer 3 — route-render smoke (every page loads)

The unit/live suites test services, not pages. This layer confirms **no route crashes**
when actually rendered — the single most common "it's hosted now" failure.

```bash
npm run dev                 # terminal 1 (or: npm run build && npm start)
npm run test:routes         # terminal 2  → scripts/route-smoke.mjs
# against a deployed host:
BASE_URL=https://your-host npm run test:routes
```

It hits every public/gated/API route as an **anonymous** visitor and fails on any **5xx**
(or a hidden Next error-boundary body). Gated pages are **expected** to render a sign-in /
"access denied" screen (200) or a redirect (3xx) — that is a PASS; only a crash is a FAIL.
It resolves one real org-unit slug, event slug, and user id from the DB for the dynamic
routes (`/org/[type]/[slug]`, `/events/[slug]`, `/admin/users/[id]`).

**For authenticated render checks**, sign in through the browser as each role and walk the
routes in §5 (a session cookie is required; the script tests the anonymous surface).

---

## 5. Layer 4 — the per-feature × per-mode functional matrix

This is the "click through the hosted site as each stakeholder" pass. For each feature,
do the **allow** action in the intended mode and confirm it **worked + persisted +
audited**, then attempt it in a **wrong** mode and confirm it was **refused**. Log every
deviation (§7).

> **Efficient variant (§4.3 driving):** instead of clicking, call the same service the UI
> calls with an actor `{ userId }` for each role and assert the result — this is exactly
> what the `*.db.test.mjs` suites do, and it is the fastest way to cover the whole matrix.
> The manual click-through below is the acceptance layer on top of that.

### M0 — Auth & accounts (`/login`, `/account/*`, `/admin/users`, `/admin/requests`)
- [ ] **Anon** → `/login` renders; wrong password rejected; `revoked` user cannot log in;
      `inactive`/`active` can.
- [ ] **First login** with `must_change_password` → forced to `/account/password`; cannot
      reach other pages until changed; after change, redirect stops.
- [ ] **Anon** → "Request an account" + "Forgot password" create a queued notification
      (ref `AR-/PR-NNNNN`); account existence is **never** leaked; duplicate submits dedup.
- [ ] **Admin/staff** → `/admin/requests`: *Take* (assigns, audited) → generate temp
      password → resolve; user then logs in and is forced to change.
- [ ] **Admin** → create single user; **bulk CSV** import (existing emails skipped).
- [ ] **Escalation:** only a **developer** can delete OR reset-password-of a developer;
      no self-delete/self-lockout. A non-developer attempting either is refused (403/409).
- [ ] With plugin **ON**, Google sign-in is rejected; with it **OFF**, Google works.

### M1 — Status & surfaces (`/member`, surface routing)
- [ ] `active` member → `/member` shows access mode "active", "can participate"; links to
      profile + clubs; back-office link only if entitled.
- [ ] `inactive` member → `/member` shows "cannot participate"; cannot register for an event
      (§M5); still sees own achievements.
- [ ] `revoked` → `/member` shows "Access revoked"; cannot log in at all.
- [ ] `allow_normal_view` OFF → `/member` shows "Member view not enabled".
- [ ] Scoped coordinator/secretary → their scoped routes; **not** another unit's.

### M2 — RBAC categories, overrides, smart search (`/admin/users`)
- [ ] Admin filters users by year/level/branch/category/status + free text (debounced);
      results match the email format `<year><u|p|r><branch><serial>@iitjammu.ac.in`.
- [ ] Grant a per-email **override**: a `deny` removes a permission the role grants
      (deny wins); a `grant` requires the actor to hold that permission (escalation guard);
      developer/grants_all is never restricted by a deny.
- [ ] Override scope (lineage/year) applies only within scope.

### M3 — Club/council pages + memberships (`/org/[type]/[slug]`, `/member`)
- [ ] Public club page renders tabs: Overview / Announcements / Upcoming / Past / **Achievements** /
      Resources / Documents; hostels/messes show only Overview + Resources.
- [ ] **Coordinator (scoped)** bulk-imports members (CSV) → idempotent; missing accounts are
      **reported, not created**; true CSV line numbers on error.
- [ ] Membership roster read requires `membership.manage` **scoped** (PII gate: a wrong-scope
      or unauthenticated read is 401/403 **before** any disclosure).
- [ ] Club announcement with **sync-to-central** ON also appears on `/announcements`; OFF is
      club-only. Club docs (markdown) render safely (no `javascript:`/`data:`/HTML injection).
- [ ] "My clubs" on `/member` lists the member's units and links to each.

### M4 — Wall of Fame (`/wall-of-fame`, club Achievements tab)
- [ ] **Content editor/staff/admin** create an achievement (hybrid blocks) → publish →
      appears on `/wall-of-fame`; unpublish hides it.
- [ ] A bad block payload → 422; unsafe link is neutralised.
- [ ] **Credits**: exactly one target (member OR club) per row; central-scope authz means a
      unit-scoped coordinator is **403** on credit management.
- [ ] **PII:** a credited member appears by **display name only** — no `app_user` uuid/email
      in the client payload (view source / network tab).

### M5 — Event Playground (`/events`, `/events/[slug]`, `/admin/events`, `/events/organized`)
- [ ] With plugin ON, `/events` is **login-only** (anon gets sign-in / the public board when OFF).
- [ ] **Organizer tagging**: an event is credited to exactly one of {club lineage, custom
      entity, member}; a club-scoped coordinator can manage **their own** organized event
      (rounds/scores/attendance/settings/registration/closure) and **not** another's; the
      **global** check still requires an unscoped grant.
- [ ] **Participate** (login-only): `active` registers; at capacity → **waitlist**; cancelling
      a confirmed spot **auto-promotes** the earliest waitlisted (from every seat-vacating
      path — self-cancel, organizer cancel/remove/downgrade); duplicate registration deduped;
      `inactive` is **blocked** from registering.
- [ ] **Scores/attendance** submitted as replace-set sheets; ranking shows per-round + overall
      (overall = sum across round+overall), and equals the number on a member's profile (§M6).
- [ ] **CSV export** (`/api/events/export`) gated by `assertEventManage`; correct quoting.
- [ ] **Closure report**: an organizer submits (markdown); a **central** admin reviews
      (comment + corrected budget); a **scoped coordinator cannot review**; re-submit clears
      the stale reviewer/comment.
- [ ] **Events Organized** (`/events/organized`) renders; every add/update of the curated doc
      is audited and shows in the dev-dashboard change-history tab (§M8).

### M6 — Profiles & contribution (`/member/profile`, `/admin/users/[id]`, `/admin/contribution`)
- [ ] **Self** `/member/profile` shows identity, roles/category, affiliations (+ syndicate if
      any), category-mapped events with rank, and achievements — **own data only** (a member
      cannot read another's).
- [ ] **Admin** `/admin/users/[id]` (needs `user.read`) shows the same for any member.
- [ ] `/admin/contribution` explorer (member/club/entity) shows organized/participated/
      achievements/roles/members + **participants reached as a COUNT** (never a roster).
- [ ] **PII:** no uuid/email of credited members in any client payload. Empty account → valid
      empty shape; unknown id → null (no crash).

### M7 — Notifications, feedback/support (`/feedback`, `/admin/feedback`)
- [ ] **Anon/member** submits `/feedback` → gets a ref id `FB-NNNNN`; the submitter is taken
      from the **session**, never the request body; CSRF + rate-limit + plugin gate enforced.
- [ ] **Staff/admin** (`feedback.read`) sees the queue; assign + status workflow
      (open→triaged→in_progress→resolved/dismissed); reopening a resolved ticket **clears**
      the stale resolvedAt/By.

### M8 — Developer dashboard (`/admin/devdash`, `/admin/console`, `/admin/mail`, `/api/usage`)
- [ ] **Developer** sees Action-Log export (JSON/CSV, PII-minimized, `audit.read`); usage
      analytics (top sections/paths — `page_visit` fills from the client beacon); per-table
      sizes + set a **threshold** (flag is **non-blocking** — the site keeps working past it);
      `exportTable` writes a guaranteed audit row; `truncateTable` is allowlisted +
      confirm-gated + injection-guarded.
- [ ] **Admin (not developer)** does **not** have `storage.manage` (verify the Dev-Dashboard
      storage controls are absent / refused).
- [ ] **Bulk mail** (`/admin/mail`): only an **authorized sender** can send; rate-limited with
      a progress readout; nodemailer is lazy — without config it fails closed
      (`MAIL_NOT_CONFIGURED`/`MAIL_NOT_INSTALLED`), never crashing.

### Admin panel + the ONE mutation registry (`POST /api/admin/action`)
- [ ] Every admin write posts `{action,args}` to the single registry; each action is gated
      (permission / scoped / console); a `normal_user`/member cannot dispatch any action
      (401/403); CSRF same-origin + rate-limit enforced; every mutation writes one attributed
      audit row (IP validated).
- [ ] The admin **nav** shows only the modules the resolved permission set satisfies (a
      coordinator sees fewer modules than an admin; only a developer sees Plugins/Console/
      Dev-Dashboard).

### Public site + navigation
- [ ] Header links resolve (no 404): councils, hostels, messes, Flagship Events, Announcements,
      Wall of Fame, Team, Contact Us.
- [ ] A logged-in member can navigate between `/member`, `/member/profile`, `/events`,
      `/wall-of-fame`, `/announcements`, and their club pages (member nav).

---

## 6. Plugin ON vs OFF

Test **both** — the flag flips whole surfaces:

| Surface | Plugin ON | Plugin OFF |
|---------|-----------|------------|
| Sign-in | email+password only (Google rejected) | Google **and** credentials |
| `/events` | login-only playground | public Sessions-1–10 board |
| `/member`, `/member/profile`, `/wall-of-fame` | active | `/member*` → 404; `/wall-of-fame` fail-closed |
| Public account/feedback/usage APIs | active | gated off (404/204) |

Flag reads **fail closed** (a DB error ⇒ treated as off; the Google-reject auth check fails
toward *deny*). A developer toggles it at `/admin/plugins`; propagation is ≤10 s per process
(KNOWN_ISSUES #35).

---

## 7. Bug logging → triage → fix → re-verify loop

For every deviation, record a row (a scratch `BUGLOG.md` or an issue) with this template:

```
### BUG-<n> — <one-line title>
- **Feature / module:** M5 event playground (lib/events/registration.mjs)
- **Mode:** club-scoped coordinator (active)
- **Repro:** 1) … 2) … 3) …
- **Expected:** …
- **Actual:** … (status code / stack / wrong data / PII leak / 500)
- **Severity:** critical | high | medium | low
- **Layer that caught it:** static | live | route-smoke | manual
```

Then:
1. **Triage** by severity; fix critical/high before shipping.
2. **Fix** at the right layer (usually the service or the pure helper — never patch the UI
   to hide a service bug). Keep the convention: authorize-first, one audit row per mutation,
   PII-minimized shapes, pure helper mirrors the server.
3. **Add a regression test** (a static unit test for pure logic; a `*.db.test.mjs` assertion
   for authz/persistence) so the bug can't come back.
4. **Re-verify:** re-run the layer that caught it + the static gate. Update the bug row to
   *fixed* with the commit.

---

## 8. Reference

- **Routes:** enumerated in `scripts/route-smoke.mjs` (kept in sync with `app/`).
- **Roles → permissions:** `lib/rbac/permissions.mjs` (`ROLE_DEFS`, `CATEGORY_ROLE_KEYS`).
- **Admin modules → required permission:** `lib/admin/nav.mjs` (`ADMIN_MODULES`).
- **The one mutation registry:** `lib/admin/handlers.mjs` (`dispatchAdminAction`).
- **Access matrix (status):** `lib/auth/access.mjs`.
- **Automated suites:** `docs/TESTING_STRATEGY.md`; live-suite map in §3 above.
- **Deploy/operate:** `docs/OPERATIONS_RUNBOOK.md`; **admin login/roles:** `docs/ADMIN_PANEL_GUIDE.md`.
- **Known accepted limitations:** `KNOWN_ISSUES.md` (esp. #35 flag cache, #39 parallel live
  flake, #40 mail config, #43 scoped-coordinator nav).
