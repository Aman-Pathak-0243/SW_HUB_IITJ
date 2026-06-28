# Developer Guide

A practical guide for running, understanding, and extending this project. Aimed
at future IIT Jammu students inheriting the codebase.

> **Working in sessions?** Read [SESSION_PROTOCOL.md](SESSION_PROTOCOL.md) FIRST.
> The project is built across 10 sessions; each begins by reading the tracking
> files and ends by updating them. Don't repeat completed work.

> **Database (Session 2):** V2 runs on **PostgreSQL (Neon) + Prisma** (replacing
> V1's MongoDB/Mongoose). The schema, first migration, seed, NextAuth auth, and
> RBAC are live. Some V1 surfaces (events API, admin page) are interim until
> their rebuilds (Sessions 6/9). The legacy `mongoose`/`lib/db.js` path remains
> only for the not-yet-rebuilt events endpoint.

## Prerequisites

- **Node.js** (LTS recommended; Next.js 16 + React 19 require a modern Node).
- **npm** (a `package-lock.json` is committed).
- A **Neon PostgreSQL** database (connection string in `.env.local`), **Google
  OAuth** credentials, and the **Cloudinary** account(s) used for media.
- (Legacy, optional) a **MongoDB** URI only if reading old V1 data.

## Setup

```bash
# 1. Install dependencies (node_modules is NOT committed)
npm install

# 2. Create your env file from the template
cp env.example .env.local   # NOT .env — Next.js & our db:* scripts read .env.local

# 3. Fill in values in .env.local:
#    DATABASE_URL=...            # Neon POOLED host (…-pooler…), add &pgbouncer=true
#    DIRECT_URL=...              # Neon UNPOOLED host (no -pooler) — for migrations
#    NEXTAUTH_SECRET=...         # openssl rand -base64 32
#    NEXTAUTH_URL=http://localhost:3000
#    GOOGLE_CLIENT_ID=... / GOOGLE_CLIENT_SECRET=...
#    BOOTSTRAP_DEVELOPER_EMAIL=... [BOOTSTRAP_DEVELOPER_PASSWORD=...] BOOTSTRAP_ADMIN_EMAILS=a@x,b@y

# 4. Set up the database (Prisma)
npm run db:generate     # generate Prisma Client
npm run db:migrate      # apply migrations to Neon (prisma migrate deploy, uses DIRECT_URL)
npm run db:seed         # seed year/roles/permissions/org-types/positions/content-types/bootstrap users

# 5. Run the dev server
npm run dev             # http://localhost:3000
```

> `.env*` files are git-ignored — never commit real secrets. The **Prisma CLI
> reads `.env`, not `.env.local`**, so the `db:*` scripts wrap commands with
> `dotenv -e .env.local --`. Running `prisma` directly? do `set -a; . ./.env.local;
> set +a` first. (See [SECURITY.md](SECURITY.md): leaked V1 secrets in `README.md`
> must be rotated/removed.)

> **Neon auto-suspends** the serverless compute when idle; the first connection
> wakes it (a few seconds) and may need a retry. The seed has a `waitForDb` loop;
> the DB test warms in `beforeAll`.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npm test` | Run the Vitest suite (152 static tests; DB smoke + CMS + year-engine + org live tests self-skip) |
| `RUN_DB_TESTS=1 dotenv -e .env.local -- npm test` | Include the live Neon DB tests (smoke + CMS + year engine + org; slow — remote Neon latency, may need one re-run on a cold compute; the org suite is the slowest) |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate` | `prisma migrate deploy` (apply migrations to Neon) |
| `npm run db:seed` | Seed the database (idempotent: year, RBAC, org types/positions, content types, bootstrap users) |
| `npm run db:import:org` | Import the V1 org content (4 councils / 30 clubs / 6 hostels / 5 messes + people + appointments) into the current year — idempotent, resumable, ~15 min on Neon. Flags: `-- --draft` (don't publish), `-- --no-media` (skip media rows). |
| `npm run db:studio` | Prisma Studio (DB browser) |
| `npx eslint .` | Lint (config: `eslint.config.mjs`) |

> **Never run `prisma db pull`** — the migration's raw-SQL objects (partial/
> NULLS-NOT-DISTINCT uniques, triggers, GIN/BRIN, CHECKs) are invisible to Prisma
> introspection and would be dropped from the schema's view. They live in the
> init migration's hand-written tail and are guarded by `tests/migration.test.mjs`.
> `prisma migrate reset` is destructive and blocked for AI agents — evolve the dev
> DB with forward migrations / checked deltas instead (see DL-027).

## Auth & RBAC (how to protect a handler)

```js
import { requirePermission } from "@/lib/auth/session.mjs"; // or relative path

export async function POST(req) {
  try {
    // 401 if unauthenticated, 403 if lacking the permission; scope is optional.
    await requirePermission("content.create", { orgUnitLineageKey, academicYearId });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status ?? 403 });
  }
  // ...authorized work...
}
```

- Permissions/roles are DATA (`lib/rbac/permissions.mjs` is the seed + catalog).
  Add a permission → add a row there, re-seed. No code edit to enforce it.
- Developer (`is_developer` / a `grants_all` role) short-circuits all checks.
- Permission checks hit the DB live, so revoked roles / suspended accounts take
  effect on the next request (sessions are JWT — DL-019).

## CMS content lifecycle (Session 3)

The content engine lives in `lib/cms/` and runs on the content spine
(`content_item` + immutable `content_revision` + per-type `*_payload`).

```js
import * as cms from "@/lib/cms/content.mjs";
import { withAuditContext } from "@/lib/cms/audit-context.mjs";

// In a route handler, after requirePermission(...):
await withAuditContext({ actorUserId: user.id, ipAddress, userAgent }, async () => {
  const { item } = await cms.createDraft(
    { contentType: "event", academicYearId, title: "Fest",
      payload: { body: "...", publishFrom, publishUntil } },
    { userId: user.id }
  );
  await cms.publish(item.id, {}, { userId: user.id });
});
```

- **Lifecycle:** `createDraft` → `editDraft` (edits the open draft in place, or
  auto-opens one from the published revision) → `publish` (supersedes the prior
  published revision, repoints the cache pointer) → `unpublish` / `archive`.
  `restore(itemId, revisionId)` overwrites the open draft with a past revision.
- **Versioning:** `listRevisions`, `getRevision`, `diffRevisions` (immutable
  append-only revisions; monotonic `revision_no`; `is_restore_of_revision_id`).
- **New content type = data + one table + one handler config** (no `ALTER TYPE`):
  add a `content_type_def` row, a `*_payload` table (migration), and a config in
  `lib/cms/content-types.mjs`. The startup test enforces "every type has a handler".
- **Audit is automatic.** Import `prisma` from `lib/prisma.mjs` (the
  audit-extended client) and mutations are recorded in `audit_log` — the CMS
  service writes one semantic row per operation; other single-statement writes are
  auto-audited. Use `prismaBase` ONLY to bypass audit (audit reader, repair
  scripts). Set the actor with `withAuditContext` so rows are attributed.
- **Don't re-check DB invariants in app code.** The one-draft/one-published
  uniques, `content_item_pointer_guard`, `lock_guard`, and payload CHECKs are
  enforced by the DB; wrap DB work in `withMappedDbErrors` (the service already
  does) and you get friendly `CmsError`s (`YEAR_LOCKED`, `SLUG_TAKEN`, …) with an
  HTTP `status` + `code`.
- **Public reads** go through `lib/cms/visibility.mjs` (`listPublicContent`,
  `getPublicItemBySlug`): published AND current-year AND not-archived, with
  event/announcement publish windows applied. Admin reads (drafts, other years)
  go through `lib/cms/content.mjs`.

## Academic Year Engine (Session 4)

The temporal layer lives in `lib/year/` and reuses the CMS audit/error plumbing.

```js
import * as year from "@/lib/year/context.mjs";
import { runTransition } from "@/lib/year/transition.mjs";
import { lockYear } from "@/lib/year/lock.mjs";

const current = await year.resolveCurrentYear();           // the one is_current row
await year.setCurrentYear(nextYearId, { userId: user.id }); // demote+promote in one tx
// Copy 2025-26's structure into a freshly-created 2026-27 year:
const { run, counts } = await runTransition(
  { sourceYearId, targetYearId, copyStructure: true, copyContent: true },
  { userId: user.id }
);
await lockYear(sourceYearId, { userId: user.id });          // make the old year read-only
```

- **Current year is singular & DB-guaranteed.** `resolveCurrentYear` /
  `getCurrentYearId` (canonical here; `visibility.mjs` re-exports them). The
  `academic_year_one_current_uq` partial unique enforces exactly one;
  `setCurrentYear` demotes-then-promotes in one transaction.
- **Mutations** (`createYear`, `setCurrentYear`, `lockYear`/`unlockYear`,
  `runTransition`) gate on `year.*` via `assertActorPermission`, share the
  `auditedMutation` wrapper (`lib/cms/audited-mutation.mjs`), and write exactly one
  semantic `audit_log` row (a `{ system: true }` actor bypasses authz for
  seeds/migrations).
- **Transition Wizard** (`runTransition`) copies a source year's org structure
  forward as new `org_unit` rows **reusing their `org_unit_lineage`** (never a bare
  uuid), remapping parents within the target year. Options: `copyAppointments`
  (default OFF), `copyContent` (clone the latest revision as a target-year **draft**,
  default OFF), `copyRoleAssignments` (default OFF). It records a `transition_run`
  (status + `counts`), is **idempotent / resumable** (re-run skips done rows; a
  completed pair is a no-op; `{force:true}` re-syncs into the same run), and audits
  `action='transition'`. It is NOT one giant transaction (Neon-latency-safe; DL-031).
- **History** (`lib/year/history.mjs`): `listContentForYear` /
  `listOrgUnitsForYear` / `listAppointmentsForYear` + `followLineage` /
  `getUnitHistory` to track a logical unit across years. Reads only.
- **Public archive** (`lib/year/public.mjs`): `listSelectableYears`,
  `listPublicContentForYear`, `getPublicItemBySlugForYear` — a chosen year's
  published content; the live publish window is enforced only for the current year
  (DL-032).
- **Locked years are read-only by the DB.** `lockYear` flips
  `academic_year.status='locked'`; the `lock_guard` trigger then rejects writes to
  that year's rows → friendly `YEAR_LOCKED`. The current year cannot be locked.

## Organization Model (Session 5)

Councils, clubs, hostels and messes are generic `org_unit` rows; the people who
staff them are `appointment`s of a `person` into a `position`. Services live in
`lib/org/`.

```js
import { createOrgUnit, publishOrgUnit } from "@/lib/org/units.mjs";
import { upsertPerson } from "@/lib/org/people.mjs";
import { createAppointment } from "@/lib/org/appointments.mjs";
import { importOrgData } from "@/lib/org/import.mjs";
import { getPublicOrgUnit, getPublicOrgStructure } from "@/lib/org/public.mjs";

// Create a club under its council (a NEW lineage is minted automatically):
const { unit } = await createOrgUnit(
  { academicYearId, typeKey: "club", parentId: councilUnitId, slug: "coding-club", name: "Coding Club", status: "published" },
  { userId: user.id }
);
// Appoint a person (year derived from the unit; type/cardinality DB-guarded):
const { person } = await upsertPerson({ fullName: "Dr. X", personType: "faculty" }, { userId: user.id });
await createAppointment({ orgUnitId: unit.id, positionId: picPositionId, personId: person.id, status: "published" }, { userId: user.id });
// Public read for a data-driven page:
const view = await getPublicOrgUnit("coding-club");        // unit + profile + roster + children
```

- **Lineage is identity (DL-007).** `createOrgUnit` mints ONE `org_unit_lineage`
  row per genuinely new logical unit (never a bare uuid); pass an existing
  `lineageKey` to add a per-year instance. The Transition Wizard reuses it.
- **DB guards are honored, never re-implemented (DL-029).** `org_unit_hierarchy_guard`
  (same-year parent + allowed child type → `ORG_HIERARCHY`), the composite
  `(org_unit_id, academic_year_id)` FK (the appointment service derives the year
  FROM the unit), `appointment_type_guard` (auto-fills `org_unit_type_id` + the
  `is_singleton` flag; wrong type → `APPOINTMENT_TYPE`), and both cardinality guards
  (singleton partial unique + deferred count trigger → `APPOINTMENT_CARDINALITY`;
  duplicate → `APPOINTMENT_DUPLICATE`). Leave `org_unit_type_id` NULL on create.
- **People are deduped by cleaned name (case-insensitive; DL-034).** V1 role
  mailboxes are NOT stored on the UNIQUE `person.email`; `upsertPerson` drops a
  colliding email. It authorizes at the appointment's scope (gate
  `appointment.create`); org-unit ops gate on `org_unit.*`.
- **The importer** (`importOrgData` / `npm run db:import:org`) is idempotent by
  natural key (unit by year+slug, content by type+year+unit, appointment by
  year+unit+position+person, person by name) and **resumable** — a found-but-draft
  entity is re-published, so a partial run self-heals. Pass `{ plan }` to import a
  custom subset (the live test does this). It is NOT one big transaction (DL-031).
- **Public pages are data-driven.** `lib/org/public.mjs` applies the public rule
  (published + current/selected year + not-archived) to BOTH the unit and its bound
  profile content; one `<OrgUnitPage>` (`app/components/OrgUnitPage.jsx`) renders any
  unit type, served by `app/org/[type]/[slug]` (+ the `/org/[type]` list).
- **Raw-SQL trigger fixes are forward migrations.** Session 5 added
  `20260628130000_fix_appointment_singleton_guard` (`CREATE OR REPLACE` of
  `appointment_type_guard` so `is_singleton` is never NULL for unlimited positions)
  — never edit the init migration in place (DL-027/DL-036).

## Project map

See [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md) for the full tree. Quick
orientation:

- `app/` — App Router pages, components, and API routes.
- `app/api/auth/[...nextauth]/route.js` — NextAuth handler (uses `lib/auth/options.mjs`).
- `prisma/schema.prisma` — the V2 data model; `prisma/migrations/` — SQL migrations;
  `prisma/seed.mjs` — idempotent seed.
- `lib/prisma.mjs` — Prisma Client singleton (global-cached), **audit-extended**;
  also exports `prismaBase` (un-extended, audit-bypass).
- `lib/auth/` — `options.mjs` (NextAuth config + `authorizeCredentials`),
  `password.mjs` (argon2id), `session.mjs` (`requireUser`/`requirePermission`).
- `lib/rbac/` — `authorize.mjs` (permission engine), `permissions.mjs` (catalog + roles).
- `lib/cms/` — the CMS engine: `content.mjs` (lifecycle + version history),
  `content-types.mjs` (registry + generic payload handlers), `visibility.mjs`
  (public read rule + shared `loadPublicItems`/`loadPublicItem`), `audit.mjs` +
  `audit-context.mjs` (central audit writer), `audited-mutation.mjs` (shared
  post-commit audited-mutation wrapper + Neon `TX_OPTS`), `errors.mjs`
  (`mapDbError` → friendly errors).
- `lib/year/` — the Academic Year Engine: `context.mjs` (current-year resolve /
  set-current / create / list), `history.mjs` (cross-year reads + lineage follow),
  `transition.mjs` (the Transition Wizard), `lock.mjs` (lock/unlock),
  `public.mjs` (public year selector / archive).
- `lib/org/structure.mjs` — org-type/edge/position seed catalog.
- `tests/` — Vitest suite (`*.test.mjs`); `vitest.config.mjs`.
- `lib/db.js` / `models/Event.js` — **legacy Mongoose** (only the not-yet-rebuilt
  events endpoint; retired in Session 6).
- `public/` — local images (do **not** reorganize; see the media migration plan).
- `docs/` — this documentation.

## How things work today

- **Adding an event:** log in at `/admin` (must be an allowlisted Google email),
  fill the form, submit → `POST /api/events`. It appears on `/announcements`.
- **Most content is hardcoded** in the page components — to change a club,
  coordinator, hostel, etc. **today**, you edit the arrays in the relevant
  `app/.../page.jsx`. (V2 moves this into the database/Admin Panel.)
- **Path alias:** `@/` maps to the project root (`jsconfig.json`).

## Gotchas (real, from analysis)

- `app/page1.js` and `app/admin/page2.js` are **dead** (not routed). Don't
  mistake them for the live pages (`page.js`).
- `/past-events` is currently **broken** (expects a `{success, events}` shape the
  API doesn't return). See [KNOWN_ISSUES.md](../KNOWN_ISSUES.md).
- `pdfjs-dist` version mismatch — `PdfSlideshow.jsx` comments expect 3.x but
  `package.json` declares 6.x. If PDF previews render blank, this is why.
- `lib/db.js` calls `process.exit(1)` on a DB connection error — fine to know
  when debugging local crashes.

## Contributing workflow (V2)

1. Work on a feature branch off `portal-v2` (or the agreed base).
2. One milestone at a time; reuse components; avoid duplicate implementations.
3. Update the relevant `/docs` files and the root tracking files in the same PR.
4. Ensure the test gate passes (once it exists) before marking a milestone done.
5. Never commit secrets; never reorganize `/public` outside the media tool.

See [ADMIN_GUIDE.md](ADMIN_GUIDE.md) for the admin-facing side and
[MILESTONE_PLAN.md](MILESTONE_PLAN.md) for the roadmap.
