# Academic-Year Rollover & Data-Ingestion Guide

**When the academic year changes** (e.g. `2025-26 → 2026-27`), this guide is the exact,
ordered procedure to roll the platform forward and ingest new data — via the **admin UI**
(`/admin/years`) or the **service/CLI**. It is grounded in the Session-4 Academic-Year
Engine (`lib/year/*`) and the importers (`lib/*/import.mjs`).

> **Golden rule:** the platform is **year-aware, not year-destructive.** Rolling over
> **creates a new year** and (optionally) copies structure into it — it **never deletes or
> overwrites** a past year. Past years stay browsable and become **read-only** when locked.
> Never `prisma db pull` / `migrate reset` and never hand-edit the DB to "change the year."

---

## Table of contents
1. [The mental model — what is year-scoped vs. durable](#1-the-mental-model--what-is-year-scoped-vs-durable)
2. [The rollover procedure (recommended order)](#2-the-rollover-procedure-recommended-order)
3. [Doing it in the admin UI (`/admin/years`)](#3-doing-it-in-the-admin-ui-adminyears)
4. [Doing it via the service / CLI](#4-doing-it-via-the-service--cli)
5. [Ingesting NEW data into the new year (the importers)](#5-ingesting-new-data-into-the-new-year-the-importers)
6. [What carries over automatically vs. what needs action](#6-what-carries-over-automatically-vs-what-needs-action)
7. [Verification](#7-verification)
8. [Gotchas & edge cases](#8-gotchas--edge-cases)
9. [Rollover checklist](#9-rollover-checklist)

---

## 1. The mental model — what is year-scoped vs. durable

The whole design turns on the **`org_unit_lineage`** pattern: a club/council/hostel has a
**durable lineage key** that persists across years, and **one `org_unit` row per year** that
points at it. So "the Robotics Club" is one lineage with a 2025-26 unit and a 2026-27 unit.

| Data | Scoped to a year? | What happens at rollover |
|------|-------------------|--------------------------|
| `org_unit` (a unit's per-year row), appointments | **Year-scoped** | Copied forward by the **Transition Wizard** (structure always; appointments optional) |
| Content — events, announcements, resources, club docs, achievements, "events organized" (all `content_item`) | **Year-scoped** | NOT copied by default; the Wizard can clone the latest revision as a **target-year DRAFT** (`copyContent`), or you author/import fresh |
| `role_assignment` (a coordinator's grant) | **Optionally year-scoped** (`academicYearId` may be set or NULL) | A grant scoped to the OLD year does **not** apply to the new year — either use a NULL-year grant, or re-grant / copy roles forward (`copyRoleAssignments`) |
| **`club_membership`** | **DURABLE** (lineage-keyed, not per-year) | **Carries over automatically** — no action needed |
| **`achievement_credit`** (member/club) | **DURABLE** (lineage/user-keyed) | **Carries over automatically** |
| Event operational rows (registrations/scores/attendance) | Tied to the **durable event item** | Belong to that event; a new year's events are new items |
| Users, roles, permissions, media | **Not year-scoped** | Unchanged |

**Takeaway:** rollover is mostly about **structure** (units + optionally appointments) and
**setting the new current year**; memberships and achievement credits follow the lineage
automatically; content is authored fresh (or cloned as drafts).

---

## 2. The rollover procedure (recommended order)

Do these in order. Every step is **audited** and **idempotent/resumable** (safe to re-run).

1. **Create the new year** (`status: planning`, not yet current).
2. **Run the Transition Wizard** from the previous (source) year into the new (target) year —
   copy **structure** (recommended); optionally **appointments**, **content**, **roles**.
3. **Review** the target year (units + any cloned draft content) while it is still `planning`.
4. **Set the new year as current** — this flips the live site + makes the importers target it.
5. **Ingest any NEW data** for the new year (imports / admin authoring) — see §5.
6. **Lock the previous year** so it becomes read-only history.

> You can create the new year and run the Wizard **before** the semester starts (while the old
> year is still current), then flip `setCurrent` on the changeover day.

---

## 3. Doing it in the admin UI (`/admin/years`)

Sign in as a user with the year permissions (developer / super_admin / admin have them). Open
**Admin → Academic Years**. Every button posts to the one audited mutation route
(`POST /api/admin/action`).

1. **Create year** → enter the **label `YYYY-YY`** (e.g. `2026-27`), a **start date** and **end
   date**. It is created as `planning`, not current. *(action `year.create`)*
2. **Transition Wizard** → choose **source = the current year**, **target = the new year**, and
   the copy options:
   - **Copy structure** — ON by default (councils/clubs/hostels/messes, reusing each lineage).
   - **Copy appointments** — OFF by default (people usually change year to year).
   - **Copy content** — OFF by default; ON clones each item's latest revision as a **DRAFT** in
     the target year (nothing is auto-published).
   - **Copy role assignments** — OFF by default.
   Run it. It records a `transition_run` with per-entity counts; **re-running is safe** (it skips
   rows already present). *(action `year.transition`)*
3. **Set current** → on the new year row, click **Set current**. The old current year is demoted
   in the same transaction (there is only ever one current year). *(action `year.setCurrent`)*
4. **Lock** the previous year when you want it read-only. *(action `year.lock`; `year.unlock` to
   reverse — you cannot lock the *current* year.)*

---

## 4. Doing it via the service / CLI

The same operations are available programmatically (used by tests + scripts). Authorize as an
actor with the year permissions (`{ userId }`), or a `system` actor for scripts.

```js
import { createYear, setCurrentYear } from "./lib/year/context.mjs";
import { runTransition, listTransitionRuns } from "./lib/year/transition.mjs";
import { lockYear } from "./lib/year/lock.mjs";

// 1) Create the new year (label must be 'YYYY-YY'; created as 'planning', not current).
const { year: next } = await createYear(
  { label: "2026-27", startDate: "2026-07-01", endDate: "2027-06-30" },
  actor
);

// 2) Copy structure forward (idempotent + resumable). Toggle the optional copies as needed.
await runTransition(
  {
    sourceYearId: currentYearId,
    targetYearId: next.id,
    copyStructure: true,        // default true
    copyAppointments: false,    // default false (people change)
    copyContent: false,         // default false (ON = clone latest revision as a DRAFT)
    copyRoleAssignments: false, // default false
    // force: true,             // re-sync rows ADDED to the source since a prior run
  },
  actor
);

// 3) Make it the live current year.
await setCurrentYear(next.id, actor);

// 4) Later: lock the previous year to make it read-only history.
await lockYear(currentYearId, actor);

// Inspect what a run did:
const runs = await listTransitionRuns({ targetYearId: next.id });
```

The Transition Wizard runs as a **sequence of idempotent statements** (not one giant
transaction) for Neon-latency resilience — so an interrupted run leaves the target *partially*
populated and a **re-run self-heals** (it skips done rows). Use `force: true` to re-sync source
rows that were added *after* an earlier run.

---

## 5. Ingesting NEW data into the new year (the importers)

Three idempotent importers seed a year's baseline data from the versioned datasets in
`lib/*/data/`. **They target the CURRENT year by default** (`getCurrentYearId()`), so the usual
flow is **set the new year current first, then import**:

```bash
npm run db:import:org         # councils / clubs / hostels / messes / committees (~15 min on Neon)
npm run db:import:events      # the seed events (idempotent)
npm run db:import:resources   # per-unit resources (run AFTER org)
```

Key facts:
- **Order:** `org` first (units must exist), then `events` / `resources`.
- **Idempotent:** re-running creates **0** duplicates; a partial run **resumes** where it stopped.
- **No current year?** the org importer fails fast with `NO_CURRENT_YEAR` — set the year current
  first (or pass an explicit `academicYearId` when calling the service directly, e.g.
  `importOrgData({ academicYearId })` in `lib/org/import.mjs`).
- **Missing accounts are reported, never created** (e.g. the membership CSV importer).
- **Media:** the importers register lightweight media **inventory** rows, never base64 blobs;
  run the media migration separately (`npm run db:migrate:media -- --apply`) to move `/public`
  assets to Cloudinary (see [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md) §3.1).

**When to use which:**
- **Transition Wizard** — carry the *previous year's* structure (and optionally content) forward.
- **Importers** — (re)seed the baseline datasets into a year (e.g. a fresh install, or refreshing
  the canonical org list). Safe to run alongside the Wizard (both are idempotent by slug/lineage).
- **Admin UI authoring** — the day-to-day way to add the new year's events, announcements,
  achievements, and club content (draft → publish).
- **Coordinator/admin CSV** — club coordinators bulk-import their new-year member lists from
  `/coordinator/members` (memberships are durable, so this is usually only for *new* members).

---

## 6. What carries over automatically vs. what needs action

| Carries over automatically (durable) | Needs an explicit action for the new year |
|--------------------------------------|--------------------------------------------|
| **Club memberships** (`club_membership`, lineage-keyed) | **Org structure** — run the Transition Wizard (`copyStructure`) |
| **Achievement credits** (member & club) | **Appointments / team** — `copyAppointments` or re-appoint in the admin UI |
| Users, roles, permission definitions, media library | **Content** — author fresh, or `copyContent` to seed drafts, then publish |
| A club's **lineage identity** (name/slug via the lineage) | **Year-scoped role grants** — re-grant for the new year, use a NULL-year grant, or `copyRoleAssignments` |
| Past years (browsable history) | **Set the new year current** + **lock the old year** |

---

## 7. Verification

- **Migrations are applied & clean:** `npx prisma migrate status` → *"Database schema is up to
  date!"* (run `npm run db:migrate` to warm/apply first).
- **The right year is current:** Admin → Academic Years shows the new year as *Current*; the
  public site's year selector reflects it.
- **Structure landed:** the new year lists the expected councils/clubs (`listOrgUnitsForYear`),
  and `listTransitionRuns({ targetYearId })` shows the per-entity counts with no unexpected skips.
- **Content is where you expect it:** cloned content (if `copyContent`) shows as **drafts** in the
  new year — publish deliberately; nothing auto-publishes.
- **Run the gate:** `npm test && npm run lint && npm run build`, then the live suites per-file on a
  warm Neon and `npm run test:routes` (see [docs/WEBSITE_TESTING_SOP.md](docs/WEBSITE_TESTING_SOP.md)).

---

## 8. Gotchas & edge cases

- **Only one current year** — `setCurrentYear` demotes the old and promotes the new in one
  transaction (a partial-unique constraint enforces it). You cannot make a **locked** year current
  (unlock it first).
- **You cannot lock the current year** — flip current to the new year first, then lock the old one.
- **Interrupted transition = safe** — re-run to self-heal (idempotent). Use `force: true` only to
  pick up source rows **added after** a prior run.
- **Changed singleton-position holder on a forced re-sync** — the Wizard pre-skips a conflicting
  singleton appointment (leaving the prior target appointment for manual reconciliation) rather than
  aborting the whole run (KNOWN_ISSUES #26). Reconcile such appointments in the admin UI.
- **Importers need a current year** — or an explicit `academicYearId` at the service call.
- **Content copy clones DRAFTS** — it never auto-publishes; you review and publish in the new year.
- **Neon is slow / auto-suspends** — warm it with `npm run db:migrate` before a big import/transition;
  a large org import is ~15 min. A cold DB is a reported state, not an error.

---

## 9. Rollover checklist

- [ ] `npm run db:migrate` (warm + confirm schema up to date).
- [ ] **Create** the new year (`YYYY-YY`, start/end dates) — Admin → Academic Years (or `createYear`).
- [ ] **Transition Wizard**: source = current year → target = new year; **copy structure** (+ optional
      appointments / content / roles). Review the `transition_run` counts.
- [ ] **Review** the new year while `planning` (units + any cloned drafts).
- [ ] **Set current** → the new year.
- [ ] **Ingest new data**: `db:import:org` → `db:import:events` → `db:import:resources` if (re)seeding;
      otherwise author in the admin UI. Coordinators refresh member lists from `/coordinator/members`.
- [ ] **Media**: `npm run db:migrate:media -- --apply` if new assets were added (runbook §3.1).
- [ ] **Publish** the new year's content deliberately.
- [ ] **Lock** the previous year (read-only history).
- [ ] **Verify**: `prisma migrate status` clean; year selector correct; run the test gate.

*See [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md) for deploy/ops, [Notebook.md](Notebook.md)
for the data model, and [CLIENT_INSTRUCTIONS.md](CLIENT_INSTRUCTIONS.md) for first-time setup.*
