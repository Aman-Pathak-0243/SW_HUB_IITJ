# IIT Jammu Member Platform — User Manual

**Audience:** members, coordinators, secretaries, staff, administrators, developers, and
project stakeholders.
**Product:** the IIT Jammu Student Affairs **Member Platform** — a member / club / event
platform built on top of the classic public portal (branch `portal-v2`).
**As of:** Session 13 (2026-07-01). Feature-complete, hardened, and delivery-documented.

> This manual describes **what the platform does and how to use it**. For deploy/setup, see
> `docs/OPERATIONS_RUNBOOK.md`; for admin login/roles, `docs/ADMIN_PANEL_GUIDE.md`; for the
> full-site test procedure, `docs/WEBSITE_TESTING_SOP.md`; for the authoritative RBAC data,
> `lib/rbac/permissions.mjs` and `lib/admin/nav.mjs`.

---

## Table of contents

1. [Getting started (signing in & account requests)](#1-getting-started)
2. [Roles, statuses & the access matrix](#2-roles-statuses--the-access-matrix)
3. [The member experience](#3-the-member-experience)
4. [How-to guides (admin & staff)](#4-how-to-guides--admin--staff)
5. [The event-organizing engine — help guide](#5-the-event-organizing-engine--help-guide)
6. [The coordinator surface (`/coordinator`)](#6-the-coordinator-surface-coordinator)
7. [The developer dashboard](#7-the-developer-dashboard)
8. [FAQ & troubleshooting](#8-faq--troubleshooting)

---

## 1. Getting started

The member experience is a **developer-controlled plugin** (the `member_platform` feature
flag). When it is **ON**, sign-in is **email + password only** and the member surfaces are
active. When it is **OFF**, the site is the classic public portal and the legacy Google
sign-in works instead. A developer controls this at `/admin/plugins`; the flag is off by
default and **fails closed** (a database error is treated as OFF).

### 1.1 Signing in — `/login`

| Step | Action |
|------|--------|
| 1 | Open **`/login`** on the platform's address (e.g. `https://<your-domain>/login`). |
| 2 | Enter your **institute email** and **password**. Email is the unique identifier (format `<year><level u\|p\|r><branch><serial>@iitjammu.ac.in`, e.g. `2023ume0243@iitjammu.ac.in`). |
| 3 | Submit. A wrong password is rejected; a **revoked** account cannot sign in at all. |

You do not create your own password directly — an administrator provisions your account and
your **initial (or reset) password is delivered by the institute's own email**, never by the
app. On your first sign-in you are **forced to change it** (see §1.4).

### 1.2 Requesting an account — `/account/request`

If you do not yet have an account:

1. Go to **`/account/request`**.
2. Fill in the requested details and submit.
3. You receive a **reference id** of the form `AR-NNNNN`. This queues a request for an
   administrator to review; the platform **never reveals** whether an email already exists,
   and duplicate submissions are de-duplicated to the same request.
4. An administrator creates your account and emails you an initial password externally.

### 1.3 Forgot / reset password — `/account/forgot`

1. Go to **`/account/forgot`** and enter your email.
2. Submit. You receive a reference id `PR-NNNNN`. (Again, account existence is never leaked.)
3. This queues a **password-reset request** in the admin/developer **Password Management**
   queue. A stakeholder **takes** the request, generates a temporary password, and delivers
   it to you by the institute's external mail.
4. Sign in with the temporary password; you will be forced to change it.

> There is **no self-service email-link reset** — password resets are **admin-mediated by
> design**.

### 1.4 First-login forced password change — `/account/password`

If your account is flagged **must-change-password** (all new/reset accounts are), the platform
redirects you to **`/account/password`** and holds you there — you cannot reach any other page
until you set a new password. The new password must satisfy the policy: **at least 10
characters, including a lowercase letter, an uppercase letter, and a digit.** After a
successful change, the flag clears and normal navigation resumes.

---

## 2. Roles, statuses & the access matrix

Access is governed by **two orthogonal axes**:

- **Role / category** — *what* you are allowed to do (RBAC, derived live from the database).
- **Status** — *whether and how* you can sign in and be seen (`active` / `inactive` /
  `revoked`), plus an `allow_normal_view` toggle.

### 2.1 The 11 roles (from `lib/rbac/permissions.mjs`)

There are **52 atomic permissions**, **11 seeded roles**, and **13 content types**. Grants
can be **GLOBAL** (institute-wide) or **SCOPED** to an org-unit lineage (a club/council) and
optionally an academic year. Effective permissions are the **additive UNION** of a user's
in-scope role grants, **then** per-user overrides (**deny wins**), with a
developer / `grants_all` short-circuit that is never restricted by a deny.

| Role key | What it can do | Grant style |
|----------|----------------|-------------|
| **`developer`** | **Everything** (`grants_all` bypass). The only role that sees Plugins / Developer Console / Developer Dashboard and holds `storage.manage`. Only a developer can mint another developer. | bootstrap |
| **`super_admin`** | The full permission catalog, granted explicitly (no bypass flag). | bootstrap |
| **`admin`** | The full catalog **minus** the developer-only ops (`dev.console`, `backup.create`, `backup.restore`, `media.migrate`, `storage.manage`). The top M2 "category". | global |
| **`staff`** | Central content & announcements (create/edit/publish/unpublish/archive/restore), `media.read/upload/update`, `org_unit.read`, `year.read`, `notification.read`, `feedback.read`, `mail.send`, and **global `event.manage`** (central event operations). | global |
| **`secretary`** | Coordinator permissions **plus org structure** — `org_unit.update`, `appointment.create/update/archive`. Usually scoped to a council. | scoped |
| **`coordinator`** | Full content lifecycle + media (the editor set) + `membership.manage` + `event.manage`. Usually scoped to a club. | scoped |
| **`co_coordinator`** | **Draft** content only — `content.read/create/update` (no publish), `media.read/upload`, `org_unit.read`, `year.read`. Usually scoped to a unit. | scoped |
| **`normal_user`** | **No** back-office permissions — the default member. Drives search/grouping and the member features. Reads are public anyway. | n/a |
| **`content_editor`** | Legacy Session-2 role: `content.*` + `media.read/upload/update` + read year/org. | global |
| **`org_manager`** | Legacy: `org_unit.*` + `position.manage` + `appointment.*` + read content/media/year. | global |
| **`viewer`** | Legacy read-only: `content.read`, `org_unit.read`, `media.read`, `year.read`. | global |

**Scope matters.** A scoped grant (typical for coordinator / secretary / co-coordinator)
passes a service's **scoped** check for *its own* unit and **fails** the **global** check.
A club coordinator can run their own club's event but not another club's, and does **not** see
the global `/admin/events` nav — they use the dedicated **`/coordinator`** surface (§6).

### 2.2 The 3 statuses + `allow_normal_view`

Status is **enforced live** at the login/session layer (it is not baked into the JWT), so a
status change takes effect on the next request.

| Status | Log in? | Browse public? | Member view (`/member`)? | Participate in events? | Back-office? |
|--------|:---:|:---:|:---:|:---:|:---:|
| `active` | ✅ | ✅ | ✅ | ✅ | ✅ (if the role permits) |
| `inactive` | ✅ | ✅ | ✅ (sees own achievements) | ❌ | ❌ (resolver returns no permissions) |
| `revoked` | ❌ | ✅ (public only) | ❌ | ❌ | ❌ |

- **`allow_normal_view`** — a per-account toggle. When **off**, the member view is withheld
  even for an `active` account (`/member` shows "Member view not enabled").

### 2.3 Role × status access matrix (areas each role can reach)

This combines the role's permission bundle (`permissions.mjs`), the admin-module map
(`nav.mjs`), and the status rules above. "Access areas" = which `/admin` modules, member
surfaces, and the coordinator surface. **A non-active status removes all back-office access
regardless of role** (the RBAC resolver returns no permissions for a non-active user).

| Role | Status `active` — access areas | Status `inactive` | Status `revoked` |
|------|--------------------------------|-------------------|------------------|
| **developer** | Everything: all `/admin` modules incl. **Plugins, Developer Console, Developer Dashboard**; member surfaces; can open any `/coordinator` unit | No back-office; member view (own achievements); no participation | Public site only; cannot sign in |
| **super_admin** | All `/admin` modules (full catalog); member surfaces | No back-office; member view | Public only; no login |
| **admin** | `/admin`: Dashboard, Content, Organization, Academic Years, **Event Playground** (central), Media, Users & Roles, Contribution, Password Management, Feedback, Mail. **Not** Plugins/Console; **no** `storage.manage` on the Dev Dashboard | No back-office; member view | Public only; no login |
| **staff** | `/admin`: Dashboard, Content, **Event Playground** (central), Media (read/upload/update), Contribution (via `user.read`? no — staff lacks `user.read`), Password Management, Feedback, Mail (send). Central event ops + closure review | No back-office; member view | Public only; no login |
| **secretary** (scoped) | `/coordinator` for their council: events + members + contribution; scoped content/org edits via the one mutation route. **Not** the global `/admin/events` nav | No back-office; member view | Public only; no login |
| **coordinator** (scoped) | `/coordinator` for their club: **events** (settings/rounds/registrations/scores/attendance/own closure + CSV), **members** (roster + CSV import), **contribution**. Scoped content/media edits | No back-office / no coordinator surface; member view | Public only; no login |
| **co_coordinator** (scoped) | Scoped **draft** content only (create/edit, no publish); member surfaces. No coordinator events/members surface unless also granted `event.manage`/`membership.manage` | No back-office; member view | Public only; no login |
| **normal_user** | Member surfaces only: `/member`, `/member/profile`, My clubs, Wall of Fame, announcements, event participation | Member view (own achievements); **cannot participate** | Public only; no login |
| **content_editor** | `/admin`: Content, Media, (read Years/Org) | No back-office; member view | Public only; no login |
| **org_manager** | `/admin`: Organization, (read Content/Media/Years) | No back-office; member view | Public only; no login |
| **viewer** | `/admin` read-only views (Content/Org/Media/Years) | No back-office; member view | Public only; no login |

> Notes: `staff` does **not** hold `user.read`, so it does not see Users & Roles or the
> Contribution explorer. The **admin nav shows only the modules your resolved permissions
> satisfy** — a coordinator with only scoped grants resolves to *no* global modules and is
> routed to `/coordinator` instead (this is why the coordinator surface exists). Hiding a
> button is a convenience only — every mutation re-checks permissions live on the server.

---

## 3. The member experience

The member surfaces are active only when the plugin is **ON** and you are signed in as an
`active` or `inactive` account with `allow_normal_view` on.

### 3.1 `/member` — the member home

- Shows your **access mode** (active / inactive) and whether you **can participate** in events.
- Links to your **profile**, your **clubs** ("My clubs" lists the units you belong to, each
  linking to its public page), and the **Wall of Fame** / **announcements**.
- A back-office link appears **only if** you are entitled (an active admin/staff sees an
  `/admin` link; a scoped coordinator sees a `/coordinator` link).
- `revoked` accounts see "Access revoked"; `allow_normal_view` off shows "Member view not
  enabled".

### 3.2 `/member/profile` — your profile

A read-only aggregation over the durable data the platform already stores (no separate
"profile editor"):

- **Identity** — name, email, and the facets parsed from your institute email (admission year,
  level UG/PG/research, branch).
- **Roles / category** and the units they are scoped to.
- **Affiliations** — your club memberships (and a derived "syndicate" facet, currently empty).
- **Category-mapped events** you took part in, with your **overall rank** per event (the same
  sum-across-rounds number shown on the event page).
- Your credited **achievements**.

You see **your own data only**; an administrator with `user.read` can view any member's
profile at `/admin/users/[id]`.

### 3.3 Wall of Fame & announcements

- **`/wall-of-fame`** — the public achievements board. Credited members appear by **display
  name only** (no internal ids/emails).
- **`/announcements`** — the central board (staff-managed) plus club announcements that opted
  in to "sync to central". Club-only announcements appear on the club page instead.
- Each club/council page (`/org/[type]/[slug]`) has tabs: Overview / Announcements / Upcoming /
  Past events / **Achievements** / Resources / Documents (hostels & messes show only Overview +
  Resources).

### 3.4 Participating in events (login-only, active-only)

- The event playground at **`/events`** is **login-only** when the plugin is ON.
- Registering requires an **active** account. Register from the event page (`/events/[slug]`).
- If the event is **at capacity**, you are placed on the **waitlist**; if a confirmed spot
  frees up, the earliest waitlisted member is **auto-promoted** (see §5).
- An **`inactive`** account can browse events but **cannot register**.
- Duplicate registrations are de-duplicated.

---

## 4. How-to guides — admin & staff

All admin writes go through **one audited mutation registry** (`POST /api/admin/action`):
every action is permission-gated, CSRF- and rate-limited, and writes **one attributed
`audit_log` row**. The admin panel lives at **`/admin`**.

### 4.1 Create a single user

1. Sign in and open **`/admin/users`** (needs `user.*`; developer/super_admin/admin hold it).
2. Click **+ New user** (Create user).
3. Enter the email and an initial password (delivered externally). The account is created with
   **must-change-password** on.
4. Optionally grant a role and set status. Save.

### 4.2 Bulk-create users (CSV)

1. `/admin/users` → **Bulk import (CSV)**.
2. Paste `email,password` (optionally `email,password,name`) — one per line.
3. Submit. Existing emails are **skipped** (idempotent). Deliver the initial passwords by the
   institute's external mail; each new user must change theirs on first login.

### 4.3 Grant a role — scoped vs global

1. `/admin/users` → the user's row → **Roles**.
2. Pick a role (e.g. `coordinator`).
3. **Scope it** for scoped roles: choose the **org-unit lineage** (a club/council) and,
   optionally, an **academic year**. A scoped grant unlocks only that unit — the user gets the
   `/coordinator` surface for it, not the global `/admin` modules.
4. For central roles (`staff`, `admin`), leave it **global**.

> Escalation guards: only a **developer** can create/set a developer or grant a `grants_all`/
> system role; no self-lockout; system roles are edit-protected (description only).

### 4.4 Per-email permission overrides

1. `/admin/users` → the user's row → **Permission overrides**.
2. **Grant** a single catalog permission (the actor must themselves hold it — escalation
   guard) or **Deny** one (removes it even if a role grants it — **deny wins**).
3. Optionally scope the override to a lineage/year. A developer's `grants_all` is never
   restricted by a deny.

### 4.5 The request / password queue — `/admin/requests`

1. Open **Password Management** (`/admin/requests`; needs `notification.read`).
2. For a request (`AR-`/`PR-NNNNN`): click **Take** to assign it to yourself (audited).
3. **Generate & set** mints a temporary password (shown once) and flags must-change; deliver
   it externally. Or **Reset pw** / **Delete** directly from Users & Roles.
4. Resolve or dismiss. (Only a developer may reset-the-password-of or delete a developer.)

### 4.6 Content lifecycle — `/admin/content`

1. Open **Content** (`/admin/content`; needs a `content.*` permission).
2. Create a content item of any of the 13 content types (event, announcement, resource,
   achievement, club_doc, events_organized, page blocks, etc.).
3. Move it through the lifecycle: **draft → publish → unpublish → archive**, with
   **version diff** and **restore** of a previous revision. Content is versioned; every change
   is audited. Markdown is rendered escape-first (injection-safe); unsafe links are neutralised.

### 4.7 Org units & appointments — `/admin/organization`

1. Open **Organization** (`/admin/organization`; needs `org_unit.*` / `appointment.*` /
   `position.manage`).
2. Manage councils, clubs, hostels, messes, positions, and **appointments** (assign a person to
   a position, with an optional custom title override for bespoke team roles).

### 4.8 Media — `/admin/media`

1. Open **Media** (`/admin/media`; needs a `media.*` permission).
2. Browse the library, **register/upload** assets (Cloudinary-backed), edit metadata, and
   archive. The `/public → Cloudinary` migration tool needs `media.migrate` (developer-only).

### 4.9 Feedback — `/admin/feedback`

1. Open **Feedback** (`/admin/feedback`; needs `feedback.read`; staff & admin hold it).
2. Tickets arrive from the public `/feedback` form with a `FB-NNNNN` ref id.
3. **Assign** and run the status workflow: open → triaged → in_progress → resolved / dismissed.
   Reopening a resolved ticket clears the stale resolved-at/by.

### 4.10 Bulk mail — `/admin/mail`

1. Open **Mail** (`/admin/mail`; needs `mail.send`; `mail.manage` maintains the sender list).
2. Only an **authorized sender** can send. Sends are **rate-limited** with a live "X of Y sent"
   progress readout. Without SMTP configured, sending fails closed
   (`MAIL_NOT_CONFIGURED` / `MAIL_NOT_INSTALLED`) rather than crashing. Bulk mail uses the
   institute's own SMTP/VM via nodemailer.

### 4.11 Plugins — `/admin/plugins`

1. Open **Plugins** (`/admin/plugins`). Admins can **see** the state; only a **developer** can
   **toggle** the `member_platform` flag. ON = the member platform; OFF = the classic public
   portal (Google sign-in intact). Propagation is within ~10 seconds per process.

### 4.12 Staff — central content & the event playground

A **staff** account holds **global `event.manage`**, so it runs the playground **centrally**
from `/admin/events`: **organizer tagging**, **custom entities**, and **closure review** (all
central-only), plus the operational tools. Staff also manage central content/announcements and
see the request queue, feedback queue, and mail. See §5 for the event flow.

---

## 5. The event-organizing engine — help guide

An event is a versioned `content_type='event'` **plus** a relational subsystem
(`event_organizer`, `event_settings`, `event_round`, `event_registration`, `event_score`,
`event_attendance`, `event_closure_report`). Authorization runs through the **`event.manage`**
seam (`assertEventManage`): **GLOBAL** (staff/admin/developer) **or SCOPED** to a tagged
organizing club's lineage (a coordinator runs their own event).

### 5.1 Who can do what

| Action | Central (global `event.manage`: staff/admin/dev) | Scoped coordinator (their organizing club) |
|--------|:---:|:---:|
| Create the event (CMS content) | ✅ | ✅ (content lifecycle at their scope) |
| **Organizer tagging** (credit the event to a club/entity/member) | ✅ **central-only** | ❌ |
| Define **custom entities** (syndicate / external partner) | ✅ **central-only** | ❌ |
| Registration **settings** (capacity + window) | ✅ | ✅ (own event) |
| **Rounds** create/delete | ✅ | ✅ (own event) |
| **Registrations** roster (add/status/remove) | ✅ | ✅ (own event) |
| **Scores** & **attendance** (replace sheets) | ✅ | ✅ (own event) |
| **CSV** downloads | ✅ | ✅ (own event) |
| Submit a **closure report** | ✅ | ✅ (own event) |
| **Review** a closure report (comment + corrected budget) | ✅ **central-only** | ❌ |

### 5.2 The end-to-end flow

1. **Central staff/admin tags the organizing club.** Because organizer tagging is central, a
   staff/admin credits the event to exactly **one** of {a club lineage, a custom entity, a
   member} (with kind = organizer or collaborator). Tagging a **club lineage as organizer** is
   what grants that club's **coordinator** scoped management access to the event.
2. **The club coordinator runs the event** from **`/coordinator/events/<id>`** (see the steps
   below). The per-event page is gated by `assertEventManage`, so a coordinator cannot open
   another club's event by id.
3. **Central admin reviews the closure report** once the coordinator submits it.

### 5.3 Coordinator: running the event step by step

Open **`/coordinator`** → **Events** → the event. The page shows the **live** operational data
and offers only the scoped actions.

**A. Registration settings**
1. Set **Capacity** (blank = unlimited). Capacity drives the waitlist.
2. Set the **registration opens / closes** window (datetime), or tick **Force-close
   registration** to close regardless of the window.
3. Save. **Raising** capacity **auto-promotes** waitlisted members into the newly opened seats
   (earliest-registered first).

**B. Rounds / stages**
1. Add a round (name + optional description). Rounds hold per-round scores and attendance.
2. Deleting a round removes its scores/attendance.

**C. Registrations roster (add / waitlist / promote / remove)**
1. **Add** a participant by email as **confirmed** or **waitlisted**.
2. Change a row's status via the dropdown (`confirmed` / `waitlisted` / `cancelled`) —
   promote a waitlisted member to confirmed, or downgrade/cancel.
3. **Remove** a registration.
4. **Capacity → waitlist + auto-promote:** when the event is at capacity, a new registration
   becomes **waitlisted**; when a **confirmed** seat is vacated (self-cancel, or the organizer
   cancels/removes/downgrades a confirmed row), the **earliest** waitlisted member is
   **auto-promoted** to confirmed. This runs from every seat-vacating path and is
   concurrency-safe (the earliest waitlisted row is locked `FOR UPDATE SKIP LOCKED`), so two
   simultaneous cancellations promote **distinct** members. Unlimited capacity means nobody is
   waitlisted for capacity.
5. **Download participants CSV** via the button (see §5.4).

**D. Scores (replace-set sheets)**
1. Pick a **Round** (or **Overall** = round_id NULL).
2. Paste one line per member: **`email,points[,note]`**.
3. Save. This **replaces the entire sheet** for that round. Missing accounts are **reported,
   never created**.

**E. Attendance (replace-set sheets)**
1. Pick a **Round** (or **Overall**).
2. Paste one line per member: **`email[,present][,note]`** — `present` is `y/yes/true/1/p`
   (blank = present).
3. Save. This **replaces the sheet** for that round.

**F. Closure report**
1. Enter your **role & contribution** (markdown) and an optional **reported budget**.
2. Submit — the report goes to **central review**. A coordinator **cannot review** reports
   here; a central admin adds a comment + corrected budget. Re-submitting clears any stale
   reviewer/comment.

### 5.4 CSV downloads

Each of Registrations / Scores / Attendance has a **Download CSV** button, backed by
`GET /api/events/export?eventItemId=<id>&kind=participants|scores|attendance`. The endpoint is
gated by `assertEventManage` (so only a manager of that event can export) and CSV cells are
formula-injection-guarded.

### 5.5 Ranking semantics

Ranking is computed in the read layer (no stored rank column), using standard competition rank:

- **Per-round ranking** — orders participants by that round's points.
- **Overall ranking** — the **sum** of a member's scores **across all rounds** plus any
  explicit "overall" row. The overall number a member sees on their profile equals the number
  on the event page (same sum-based semantic).

Public ranking displays show **display names only** — no internal ids or emails.

---

## 6. The coordinator surface (`/coordinator`)

`/coordinator` is a **standalone scoped back office** (Session 13) for a club-scoped
**coordinator** or council-scoped **secretary**. It is plugin-independent (like `/admin`) and
**active-only**. It exists because a purely scoped grant is invisible to the global admin nav —
this surface lets those users **see and run** their unit's tools without any global admin
access. No new permission or table was added; every action re-authorizes via the existing
seams.

**Landing — "My units".** Shows the unit(s) you coordinate, each with capability badges
(**Events** / **Members**) and quick links.

| Sub-surface | Route | What you do |
|-------------|-------|-------------|
| **My units** | `/coordinator` | See the clubs/councils you manage, jump to their tools |
| **Events** | `/coordinator/events` → `/coordinator/events/<id>` | Run your unit's events — settings, rounds, registrations, scores, attendance, own closure submit, CSV (see §5.3). Lists only events an organizing lineage of yours is tagged on |
| **Members** | `/coordinator/members?lineage=<key>` | Manage the roster: **add** a member (email + optional role), **change status** (active/inactive), **remove**, and **bulk-import CSV** |
| **Contribution** | `/coordinator/contribution?lineage=<key>` | The M6 **club slice** — events organized/participated, achievements, roles, members, and participants-reached (a count, never a roster) |

**Members — roster & CSV import.**
1. `/coordinator/members` shows the roster (name / email / role / status).
2. **Add a member** by email, optionally with a club role (e.g. Core, Volunteer).
3. **Bulk import CSV:** one email per line, optionally `email,role`. Imports are
   **non-destructive** (a manually-set role/status is preserved), idempotent by
   `(user, lineage)`, and a **missing account is reported, not created**. The result summary
   shows new / updated / missing / failed counts.

**Central actions are absent.** Organizer tagging, custom entities, and closure **review**
stay `requireGlobal` and do not appear here — they live in the central `/admin/events`.

---

## 7. The developer dashboard

Open **`/admin/devdash`** (Developer Dashboard) — visible to a developer (and gated per-section
by `audit.read` / `dev.console` / `storage.manage`). Threshold flags are **non-blocking**: the
site and features keep working past a warning.

| Section | What it shows / does | Gate |
|---------|----------------------|------|
| **Action Log / Change History** | The cross-domain audit trail, filterable and **exportable** (JSON/CSV), PII-minimized | `audit.read` |
| **Events Organized — Change History** | Every add/update of the curated "Events Organized" markdown doc (who did what, when), visible + downloadable | `audit.read` |
| **Usage analytics** | Hidden usage stats — most-visited sections/paths over a window (fed by a client beacon into `page_visit`) | `dev.console` |
| **Storage — per-table sizes & thresholds** | Each table's size; set a **per-table threshold** (MB); over-threshold tables are flagged (non-blocking) with a dashboard alert | `storage.manage` (developer-only) |
| **Export / Truncate table** | **Export** a table (JSON/CSV) — always writes a guaranteed audit row; **Truncate** is allowlisted (`page_visit`), confirm-gated, and injection-guarded | `storage.manage` |

Related developer tools: **Developer Console** (`/admin/console`) for system status, the audit
viewer, reports, and the backup ledger; **Mail** (`/admin/mail`) for bulk sending; **Plugins**
(`/admin/plugins`) for the feature flag. An **admin (not developer)** does **not** have
`storage.manage` — the storage export/threshold/truncate controls are absent for them.

---

## 8. FAQ & troubleshooting

**I can't sign in with Google.** With the member platform **ON**, sign-in is **email +
password only** and Google is rejected. Google works only when a developer turns the plugin
OFF (the classic portal).

**I never got a password.** Initial and reset passwords are delivered by the **institute's own
email**, never by the app. If you requested an account (`AR-`) or a reset (`PR-`), an
administrator must action it in the Password Management queue and mail you the temporary
password.

**The site keeps redirecting me to a password page.** Your account is flagged
must-change-password. Set a new password (≥10 chars, with lower + upper + a digit) at
`/account/password`; navigation then resumes.

**"Access revoked" / "Member view not enabled".** A `revoked` account cannot sign in
(public site only). "Member view not enabled" means your account's `allow_normal_view` toggle
is off — ask an administrator to enable it.

**I'm a coordinator but I don't see `/admin/events`.** A scoped grant does not appear in the
global admin nav by design. Use **`/coordinator`** → **Events**, which lists exactly the events
your organizing unit is tagged on.

**I registered but I'm "waitlisted".** The event is at capacity. If a confirmed spot frees up
(or the organizer raises capacity), the earliest waitlisted member — possibly you — is
auto-promoted to confirmed.

**My score sheet "lost" earlier entries.** Saving a score/attendance sheet **replaces the
entire set** for that round. Paste the complete list each time. Emails without an account are
reported (not created).

**I can't review my own closure report.** Closure **review** is central-only. Coordinators
**submit**; a staff/admin reviews (comment + corrected budget).

**Bulk mail says not configured.** The institute SMTP/nodemailer transport is not set up on the
host. It fails closed by design (`MAIL_NOT_CONFIGURED` / `MAIL_NOT_INSTALLED`) — an operator
must install nodemailer and set the `MAIL_*` environment variables.

**A member's name shows but no email/id.** By design — public and cross-stakeholder views are
PII-minimized (display name only). Internal ids and emails are never serialized to clients.

**Where do prices for hosting come from?** The platform is designed to run on **free tiers**
(Neon free, Cloudinary free, Vercel hobby/pro) at student scale, with bulk mail on the
institute's own SMTP/VM. Any figure is **indicative only** — verify current pricing at the
provider's official pricing page (prices change): Neon (`neon.tech/pricing`), Cloudinary
(`cloudinary.com/pricing`), Vercel (`vercel.com/pricing`).

---

*Authoritative sources for this manual: `docs/WEBSITE_TESTING_SOP.md`,
`lib/rbac/permissions.mjs`, `lib/admin/nav.mjs`, `docs/ADMIN_PANEL_GUIDE.md`,
`docs/MEMBER_PLATFORM_PLAN.md`, `lib/coordinator/server.mjs`, `lib/events/manage.mjs`,
`app/coordinator/*`, `CURRENT_STATUS.md`, `NEXT_TASK.md`.*
