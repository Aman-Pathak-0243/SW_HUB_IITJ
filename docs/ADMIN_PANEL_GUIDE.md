# Admin Panel — Login & Access Guide

The Admin Panel (Session 9) is the authenticated, RBAC-gated UI over everything the
portal manages. This guide explains **where to go**, **how to sign in**, **which role
sees what**, and **how to give someone access**.

> The panel only ever *renders* what you can touch. The real security boundary is
> server-side: every mutation re-checks your permissions live from the database
> (`POST /api/admin/action`), so hiding a button is a convenience, not the lock.

---

## 1. Where to go (the URL)

The panel lives at **`/admin`** on whatever origin the app runs on:

| Environment | URL |
|---|---|
| Local dev (`npm run dev`) | `http://localhost:3000/admin` |
| Deployed (Session 10) | `https://<your-domain>/admin` |

Visiting `/admin` while signed out shows a **Sign in** screen. After signing in you
land on the dashboard, and the left sidebar shows only the modules your roles allow.

### Per-module URLs

You can deep-link to any module (you'll be redirected to sign-in if needed, and shown
a "no access" panel if your roles don't include it):

| Module | URL | Needs (any of) |
|---|---|---|
| Dashboard | `/admin` | any admin permission |
| Content (events, announcements, resources, profiles) | `/admin/content` | `content.*` |
| Organization (units, people, appointments) | `/admin/organization` | `org_unit.*`, `appointment.*`, `position.manage` |
| Academic Years (years, transition wizard, lock) | `/admin/years` | `year.*` |
| Media library | `/admin/media` | `media.*` |
| Users & Roles | `/admin/users` | `user.*`, `role.*` |
| Developer Console (status, audit, backups) | `/admin/console` | `dev.console`, `audit.read`, `backup.*` |

---

## 2. How to sign in

There are **two ways**, and an account can use either (one account per email):

1. **Google** — click **"Sign in with Google"**. If an account already exists for that
   Google email, you're linked to it; a brand-new Google sign-in creates an `active`
   account with no roles (an admin then grants you a role).
2. **Email + password** — for accounts that have a password set. (Set/reset a password
   from **Users & Roles → Edit user → New password**, min 8 characters.)

Whichever method you use, the account must be **`active`**. A `suspended`, `invited`, or
`disabled` account is blocked at sign-in and at every protected action (this takes
effect on the **next request**, since authorization is checked live — DL-019).

---

## 3. The seeded roles — who can do what

Roles are **data** (rows in `role` / `role_permission`), so they can be edited and new
ones created in the panel. The database seed (`prisma/seed.mjs`) ships these:

| Role | What it's for | Sees these modules |
|---|---|---|
| **`developer`** | Unrestricted super-role (`grants_all` + `is_developer`). Bypasses every permission check. Only a developer can mint another developer. | **Everything** |
| **`super_admin`** | Full administrative access via the complete permission set (editable data, not a bypass flag). | **Everything** |
| **`content_editor`** | Create/edit/publish CMS content and upload media. | Content, Media (read year/org) |
| **`org_manager`** | Manage org units, positions and appointments. | Organization (read content/media/year) |
| **`viewer`** | Read-only on content / structure / media / years. | Read-only views |

What each operational role actually grants (from `lib/rbac/permissions.mjs`):

- **content_editor** → `content.read/create/update/publish/unpublish/archive/restore`,
  `media.read/upload/update`, `org_unit.read`, `year.read`.
- **org_manager** → `org_unit.read/create/update/archive`, `position.manage`,
  `appointment.create/update/archive`, `content.read`, `media.read`, `year.read`.
- **viewer** → `content.read`, `org_unit.read`, `media.read`, `year.read`.

> Note: `viewer` has no `*.create/update` permission, so it can browse but every
> mutation button is hidden **and** the server would reject it. Users & Roles and the
> Developer Console require their own (`user.*` / `role.*` / `dev.console` / `audit.read`
> / `backup.*`) permissions, which only `developer` / `super_admin` hold by default.

---

## 4. Who has access out of the box (bootstrap)

The seed creates the first accounts (so there's no chicken-and-egg with RBAC):

- **Developer account** — email from `BOOTSTRAP_DEVELOPER_EMAIL` (default
  `developer@iitjammu.ac.in`), granted the `developer` role. It gets a password **only
  if** `BOOTSTRAP_DEVELOPER_PASSWORD` was set at seed time; otherwise sign in with Google
  using that email.
- **Super-admins** — every email in `BOOTSTRAP_ADMIN_EMAILS` (comma-separated) is created
  `active` and granted `super_admin`.

These are set as environment variables when running `npm run db:seed`. To bootstrap a
developer you can log in with **right now**, seed with a password, e.g.:

```bash
BOOTSTRAP_DEVELOPER_EMAIL=you@iitjammu.ac.in \
BOOTSTRAP_DEVELOPER_PASSWORD='a-strong-password' \
BOOTSTRAP_ADMIN_EMAILS='colleague@iitjammu.ac.in' \
npm run db:seed
```

Then open `/admin`, sign in with that email + password (or Google), and you're a
developer with full access.

---

## 5. How to give someone access (grant a role)

Once you can reach **Users & Roles** (`/admin/users`):

1. **Users tab → + New user** — create the account by email (optionally set a password;
   otherwise they sign in with Google using that email).
2. **Users tab → Roles** (on the user's row) — grant them a role (e.g. `content_editor`).
3. They sign in at `/admin` and immediately see the modules that role unlocks.

To **suspend** access, use **Suspend** on the user's row (you can't suspend yourself).
To **change what a role can do**, use the **Roles tab** (system roles `developer` /
`super_admin` are protected — only their description is editable; create a new custom
role for bespoke permission sets).

---

## 6. Quick start (local)

```bash
# 1. ensure .env.local has DATABASE_URL / DIRECT_URL / NEXTAUTH_SECRET (+ Google creds for OAuth)
# 2. apply schema + seed (one-time)
npm run db:migrate
BOOTSTRAP_DEVELOPER_EMAIL=you@iitjammu.ac.in BOOTSTRAP_DEVELOPER_PASSWORD='change-me' npm run db:seed
# 3. run the app
npm run dev
# 4. open the panel
open http://localhost:3000/admin
```

Sign in with `you@iitjammu.ac.in` / `change-me` → full developer access.
