# Admin Guide

> **Note:** Most of the Admin Panel described here is **proposed for V2** and not
> yet built. The only working admin feature **today** is publishing events.
> Sections are clearly marked **(today)** or **(V2 — proposed)**.

## Signing in (today)

- Go to `/admin` and click **Sign in with Google**.
- Only **allowlisted** Google accounts can sign in. The allowlist is currently
  hardcoded in source (two emails). To add an admin **today**, a developer must
  edit `app/api/auth/[...nextauth]/route.js` and redeploy. *(V2 replaces this
  with in-portal role management.)*

## Publishing an event (today)

1. Sign in at `/admin`.
2. Fill **Title** (required), **Description**, **Date** (required), and optionally
   choose an **image** from your device.
3. Click **Publish Event**. A toast confirms success.
4. The event appears on **/announcements** (sorted by date; auto-split into
   Upcoming vs Past).

**Limitations today:** you can only **create** events — there is no edit or delete
in the UI, and the uploaded image is embedded as base64 (heavy). The
**/past-events** page is currently broken and shows nothing. These are fixed in
V2.

## What administrators will be able to do (V2 — proposed)

Without touching source code:

- **Users & roles** — invite/manage users, assign multiple roles, scope roles to
  organization units and academic years.
- **Academic years** — create a new year via the **Transition Wizard** (copy the
  previous year's structure, optionally copy content, then edit only what
  changed). Past years stay viewable.
- **Organizations** — create/rename/archive councils, clubs, committees, hostels,
  messes, offices; define positions (Coordinator, Secretary, Warden, …) and
  appoint people.
- **Clubs / councils / hostels / messes** — edit names, logos, descriptions,
  vision/mission, Instagram links, infrastructure PDFs, and the people in each.
- **Events & announcements** — create, **edit, delete**, schedule, and pin.
- **Resources** — manage PDFs/links per unit and year.
- **Media** — upload images (to Cloudinary) and run the **Media Migration Tool**
  to move existing `/public` images safely.
- **Permissions** — manage which roles can do what.

## Good practices (V2)

- Prefer the **Transition Wizard** at year change — never rebuild structures by
  hand.
- Archive (don't delete) outgoing units/appointments so history is preserved.
- Use the Admin Panel for routine changes; involve a developer only for genuinely
  structural/code changes.

See [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) for the design and
[MILESTONE_PLAN.md](MILESTONE_PLAN.md) for when each capability arrives.
