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
| `npm test` | Run the Vitest suite (**517 static tests**; the live DB suites self-skip without `RUN_DB_TESTS`) |
| `RUN_DB_TESTS=1 dotenv -e .env.local -- npm test -- --pool=forks --poolOptions.forks.singleFork` | Include the live Neon DB tests. **Run single-fork (or per-file)** — vitest runs files in parallel by default and the stateful `year.db` suite then flakes against one Neon DB (KNOWN_ISSUES #39). Suites: smoke / cms / year / org / events / resources / media / devconsole / users + `m0.db…m8.db`. Slow (remote Neon latency); warm with `npm run db:migrate` first. |
| `npm run test:routes` | **Route-render smoke** — `scripts/route-smoke.mjs` hits every route of a running server (default `http://localhost:3000`; `BASE_URL=…` for a deployed host) as an anonymous visitor and fails on any 5xx. Start `npm run dev` first. See [WEBSITE_TESTING_SOP.md](WEBSITE_TESTING_SOP.md) Layer 2. |
| `npm run lint` | ESLint (`eslint .`; Next 16 removed `next lint`). Config: `eslint.config.mjs` (`backups/**` ignored). |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate` | `prisma migrate deploy` (apply migrations to Neon) |
| `npm run db:seed` | Seed the database (idempotent: year, RBAC, org types/positions, content types, bootstrap users) |
| `npm run db:import:org` | Import the V1 org content (4 councils / 30 clubs / 6 hostels / 5 messes + people + appointments) into the current year — idempotent, resumable, ~15 min on Neon. Flags: `-- --draft` (don't publish), `-- --no-media` (skip media rows). |
| `npm run db:import:events` | Import the 3 backed-up V1 events into the current year — idempotent, resumable, ~1 min. Flags: `-- --draft`, `-- --no-media`. |
| `npm run db:import:resources` | Import the V1 per-unit resources (infra PDFs / Drive links) — idempotent; **run `db:import:org` first** (resources bind to org units; absent-unit rows are skipped). Flags: `-- --draft`, `-- --no-media`. |
| `npm run db:migrate:media` | Admin Media Migration Tool (`/public` → Cloudinary). **DRY-RUN by default.** Flags: `-- --apply` (upload; needs `CLOUDINARY_*` in `.env.local`), `-- --rollback` (dry-run rollback), `-- --rollback --apply` (restore migrated assets to `/public`). Idempotent + reversible. |
| `npm run db:console` | Developer Console — read-only system status + testing/cost reports (JSON). Flags: `-- --audit` (recent audit-log entries + stats), `-- --action=publish`, `-- --entityType=…`, `-- --take=N`. Runs as the seeded developer. |
| `npm run db:studio` | Prisma Studio (DB browser) |

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
- Permission checks hit the DB live, so revoked roles / non-active accounts take
  effect on the next request (sessions are JWT — DL-019).
- **RBAC "categories" are roles (M2, DL-063).** The seeded stakeholder ladder
  (`normal_user` / `co_coordinator` / `coordinator` / `secretary` / `staff` / `admin`,
  plus `developer`/`super_admin`) lives in `ROLE_DEFS`; `CATEGORY_ROLE_KEYS` is the
  search/grouping facet. Grant a category per-unit/per-year via the `role_assignment`
  scope columns.
- **Per-email overrides (M2, DL-062).** Resolution order is: developer short-circuit →
  additive role union → `grants_all` short-circuit → per-user overrides (`grant` adds,
  `deny` **wins**). Manage with `lib/users/admin.mjs#setUserOverride/removeUserOverride`
  (gated `permission.override`; a *grant* requires the actor to hold that permission).
  The bypass (developer/`grants_all`) is never restricted by an override.
- **Email smart search (M2, DL-064).** `lib/users/search.mjs` (pure, client-safe)
  reuses `lib/auth/email.mjs#parseInstituteEmail`; `matchesUserFilter` is the one
  predicate behind both the debounced admin filter and `listUsers`'s server criteria
  (`year`/`level`/`branch`/`category`/`status`/`search`).

### Access modes & the three surfaces (M1, DL-065/066/067)

- **Status = `active` / `inactive` / `revoked`.** The single source of truth for the
  matrix is the PURE, client-safe `lib/auth/access.mjs`:
  `canLogin` (active+inactive), `canParticipate` (active only), `canViewNormal`
  (login-able AND `allowNormalView`), `resolveSurface` (developer/admin/member),
  `scopeMatches` (mirrors `lib/rbac/authorize.mjs#inScope`). `USER_STATUSES` is
  re-exported by `lib/users/admin.mjs` + `lib/admin/forms.mjs` (no divergent copy).
- **Boundaries (live, never the JWT — DL-019):**
  - `requireUser()` — back office; **active only**.
  - `requireMember()` — the member normal view; **admits active + inactive**, rejects
    `revoked` (403 `ACCOUNT_REVOKED`) and `allowNormalView=false` (403 `NORMAL_VIEW_DISABLED`).
  - `assertCanParticipate(memberOrUserId)` — the reusable event-participation capability
    (active only; M5 gates registration/scoring/attendance on it). Accepts the
    `requireMember()` result (uses its live `status`) or a userId (reads live).
  - `requireScopedPermission(key, { orgUnitLineageKey, academicYearId })` — the named
    seam for per-unit/per-year route gating (coordinator→own club, secretary→own council,
    staff→playground); it is `requirePermission` with scope, resolved by the existing
    `inScope` matching (a narrower grant does NOT satisfy a broader/unscoped request).
  - Login: `authorizeCredentials` + the `signIn` callback reject `revoked`, admit `inactive`.
- **Member view:** `app/member` behind the non-throwing `lib/member/server.mjs#loadMemberContext`
  (states `plugin-off` → 404, `unauthenticated`, `revoked`, `view-disabled`, `ok`).
- **Set status / the member-view toggle:** `lib/users/admin.mjs#setUserStatus`
  (active/inactive/revoked; no self-lockout) and `updateUser({ allowNormalView })`
  (audited), exposed as registry actions `user.setStatus` + `user.setAllowNormalView`.
  From the CLI: `npm run cli -- user:status --email=… --status=active|inactive|revoked`.

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

## Events & Announcements (Session 6)

Events and Announcements are **just CMS content** — there is no separate events
service. To create/edit/publish one, call the Session-3 CMS service directly with
the right `content_type`:

```js
import { createDraft, publish } from "./lib/cms/content.mjs";

// An event (year-scoped, NOT org-bound). The publish_from/publish_until window is
// enforced by the DB CHECK → a friendly PUBLISH_WINDOW error if from > until.
const { item } = await createDraft({
  contentType: "event",
  academicYearId,                 // required — events are year-scoped
  slug: "tech-talk-2026",
  title: "Tech Talk 2026",
  payload: { body: "…", eventDate: new Date("2026-09-15"), audience: "public",
             publishFrom: null, publishUntil: null, coverMediaId: null },
}, actor);
await publish(item.id, {}, actor);

// An announcement (pinned-first on the public page; body is required).
await createDraft({
  contentType: "announcement", academicYearId, slug: "hostel-notice",
  title: "Hostel Notice", pinned: true,
  payload: { body: "…", audience: "students" },
}, actor);
```

**Public reads** — `lib/events/public.mjs` (anonymous, no auth):

- `listPublicEvents()` → shaped events for the current year (windowed,
  public-audience). Pair with the **pure** `splitEventsByDate(events)` →
  `{ upcoming, past }` for the pages (this is the tested fix for the old
  `/past-events` contract bug).
- `listPublicAnnouncements()` → pinned-first (DL-010).
- `listEventsForYear(yearId)` / `listAnnouncementsForYear(yearId)` → a past year's
  archive (the live window is NOT enforced for a non-current year — DL-032).
- `getPublicEventBySlug(slug)` / `getPublicAnnouncementBySlug(slug)`.
- **Audience gating (DL-040):** all readers default to `PUBLIC_AUDIENCES` (`['public']`)
  so non-public content never reaches anonymous visitors. Pass `{ audiences: [...] }`
  to widen (the seam for a future role-aware / admin view). `filterByAudience` is pure.

**Data-driven pages** (`force-dynamic`, mobile-first responsive, graceful DB-down):
`/events`, `/past-events`, `/announcements` → `EventsBoard` (reuses `EventCard`;
allowlists cover-image hosts so an off-host URL can't crash the render) and
`AnnouncementCard`.

**The API** — `app/api/events/route.js` is CMS-backed: `GET` returns
`{ events }` (published, current-year, in-window, public); `POST` is gated by
`content.create` (scoped to the current year), validates input, **rejects inline
base64** (upload via the Media tool, Session 7, and pass a URL), creates the cover
`media_asset` via `prismaBase`, then `createDraft` (+publish). Mongoose is no longer
in the request path.

**Migrate the V1 events** — `npm run db:import:events` (idempotent; `--draft` /
`--no-media`). Mirrors `db:import:org`: re-runs create 0; a partial run resumes.

**Concurrency:** event writes are DB-serialized (the `content_item_slug_uq` /
one-published partial uniques), so simultaneous creates/publishes can't corrupt —
a loser gets a friendly 409 (`SLUG_TAKEN` / `ONE_PUBLISHED`). No app-level locking.

## Resources & Media (Session 7)

**Resources** (`content_type='resource'`, org-bound) are **just CMS content**, like
events — create/publish them through the Session-3 CMS service. The payload is
`{ resourceKind: 'pdf'|'link'|'drive'|'file', fileMediaId?, externalUrl?, description? }`
(`resourceKind` required). A resource gets its **own** content lineage — do NOT pass
the unit's `lineageKey` (that would trip `content_item`'s
`UNIQUE(content_type, year, lineage_key)` and cap a unit at one resource).

```js
import { createDraft, publish } from "./lib/cms/content.mjs";
const { item } = await createDraft({
  contentType: "resource", academicYearId, orgUnitId: unit.id, slug: "hostel-infra",
  title: "Hostel Infrastructure & Details",
  payload: { resourceKind: "pdf", fileMediaId, externalUrl: driveUrl, description: "…" },
}, actor);
await publish(item.id, {}, actor);
```

- **Public reads** — `lib/resources/public.mjs#listResourcesForUnit(orgUnitId, { yearId })`
  (published, current-year/archive, not-archived; file URL resolved). The org unit
  view (`lib/org/public.mjs#getPublicOrgUnit`) now returns `resources`, rendered by
  the **client** `app/components/ResourcesSection.jsx` — a `pdf` resource shows via
  `<PdfSlideshow>` (real pages + a Drive "View in Detail" button), a link/drive
  falls back to a card+button.
- **Migrate the V1 resources** — `npm run db:import:resources` (run `db:import:org`
  first; idempotent; absent-unit rows are skipped, counted `missingUnit`).

**Media** (`lib/media/`):

- `lib/media/service.mjs` — curated `media_asset` CRUD: `createMediaAsset` /
  `updateMediaAsset` / `archiveMediaAsset` go through `auditedMutation` (one
  semantic audit row; authorize `media.upload`/`media.update`/`media.delete`).
  `listMediaAssets` / `getMediaAsset` read + resolve the delivery URL.
  `findOrCreateInventoryAsset(ref, { cache })` is the **bulk, audit-bypassing**
  (`prismaBase`) helper the importers reuse (classify + dedup by natural key).
- `lib/media/cloudinary.mjs` — PURE helpers: `cloudinaryUrl`, `publicIdFromPath`
  (deterministic `/public`→public_id), `signUploadParams` (SHA-1 signed upload),
  `resolveDeliveryUrl(asset)` (the single delivery-URL resolver), plus the one
  impure `uploadFileToCloudinary` (injected so tests use a fake).
- `lib/media/migrate.mjs` — the **Admin Media Migration Tool**: `migratePublicAssets`
  (idempotent — the candidate query excludes rows that already carry a
  `cloudinary_public_id`; reversible — `original_path` is preserved; `dryRun`,
  `filter`, `limit`, `base64Resolver`, injected `uploader`) and `rollbackMigration`
  (restores `storage_provider='local'` + url ← `/public`, clears the cloudinary
  fields; idempotent). It also reconciles the Session-6 base64 placeholders (DL-039);
  without a resolver they are reported `base64Pending` (bytes live in the Session-1
  backup). Bulk writes use `prismaBase`; one semantic audit row per run. CLI:
  `npm run db:migrate:media` (dry-run) / `-- --apply` / `-- --rollback`.

Configure the target account in `.env.local`: `CLOUDINARY_CLOUD_NAME` (enough to
build URLs), plus `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET` for `--apply`
uploads. Every migrated asset resolves through `res.cloudinary.com` — the only
host allowlisted in `next.config.mjs` (and `EventsBoard`).

## Developer Console (Session 8)

`lib/devconsole/` is the **read-mostly** ops layer over the Session 2–7 plumbing. It
adds NO new audit writer / mutation / rollback pipeline — it reads `audit_log`,
`transition_run`, `backup_record` and DELEGATES recovery to the existing services.
Every surface is gated by `authorizeConsole(actor, keys)` — an **any-of** check
(holding any listed key passes; developer/`grants_all` short-circuits; `{system:true}`
bypasses for the CLI/tests).

```js
import { listAuditLog, getAuditStats } from "./lib/devconsole/audit.mjs";
import { getSystemStatus } from "./lib/devconsole/status.mjs";
import { getDevConsoleReports } from "./lib/devconsole/reports.mjs";
import { recordBackup, rollbackMediaMigration, forceTransitionResync } from "./lib/devconsole/backups.mjs";

const actor = { userId: user.id };                       // or { system: true } in a script
const page  = await listAuditLog({ action: "publish", entityType: "content_item", take: 50 }, actor);
const sys   = await getSystemStatus(actor);              // DB health + migrations + transitions + media plan
const recovery = await rollbackMediaMigration({ dryRun: true }, actor); // delegates to lib/media/migrate.mjs
```

- **Audit viewer** (`audit.mjs`, gate `audit.read`): `listAuditLog` (filter by actor /
  entity / action / year / time-range; newest-first **keyset pagination** via the
  BIGSERIAL `id` — pass the returned `nextCursor` back as `cursor`), `getAuditEntry`
  (full before/after), `getEntityTimeline`, `getAuditStats` (counts by action +
  entity). A date-only `?to=YYYY-MM-DD` means the **inclusive** end of that day. List
  rows omit `ip`/`user_agent` (PII) — those show only in the single-entry view.
- **Status** (`status.mjs`, gate `dev.console` on the `getSystemStatus` aggregator):
  `checkDatabase` never throws (a cold/suspended Neon is a reported STATE);
  `getMigrationStatus` diffs on-disk migrations vs `_prisma_migrations`;
  `getMediaMigrationStatus` is a PURE read of the migration plan (reuses
  `selectMigrationCandidates` — it does NOT call the gated migrate tool).
- **Reports** (`reports.mjs`, gate `dev.console`): test-suite catalog, token-usage
  summary from `docs/Token_Usage.md`, indicative build-cost + Neon/Cloudinary
  free-tier estimate.
- **Backups** (`backups.mjs`, gate `backup.*`): the `backup_record` ledger
  (`recordBackup`/`markBackupVerified`/`listBackups`, audited) + the recovery
  delegates `rollbackMediaMigration` (DL-043) and `forceTransitionResync` (DL-031) —
  both gated by the console FIRST, then by the underlying service's own permission.
- **Surfaces:** `GET /api/dev/status` (`dev.console`), `GET /api/dev/audit`
  (`audit.read`), and the CLI `npm run db:console [-- --audit]`. The rich console UI
  is the Session-9 admin panel — these are the backend it renders.

## Admin Panel (Session 9)

The authenticated, RBAC-gated UI at **`/admin`** over everything the prior sessions
built. **It adds NO new mutation/audit/visibility pipeline** — it calls the existing
services. End-user guide (login / roles / URLs): [ADMIN_PANEL_GUIDE.md](ADMIN_PANEL_GUIDE.md).

- **One mutation endpoint.** Every admin write posts `{ action, args }` to
  `POST /api/admin/action`. The route `requireUser()`s (auth + live active check) then
  calls `lib/admin/handlers.mjs#dispatchAdminAction`. To add an operation, add a row to
  the `ADMIN_ACTIONS` registry — `{ permission?, scoped?, console?, run(args, actor) }`:
  - `permission: 'x.y'` → institute-wide; the dispatcher asserts it at global scope.
  - `scoped: true` → content/org/appointment; the route only authenticates, the
    SERVICE authorizes at the item's true `(year, lineage)` scope (it already does).
  - `console: true` → self-gates via `authorizeConsole` (backups).
  Every `run` executes inside `withAuditContext({actorUserId, ip, userAgent})`, so the
  one semantic audit row each service writes is attributed. Errors map via `mapDbError`.
- **Reads are gated Server Components.** Pages call `loadModuleContext(moduleKey)`
  (`lib/admin/server.mjs`) — it returns `unauthenticated|inactive|no-access|ok` and
  never throws — then render readers from `lib/admin/reads.mjs` (each asserts its
  module read permission). After a mutation the client calls `router.refresh()`; there
  is no read API. Revision diffs are computed client-side via the pure
  `lib/admin/view-models.mjs#diffViews`.
- **Pure helpers are client-safe.** `lib/admin/{nav,view-models,forms}.mjs` import NO
  prisma/server-only code (so they bundle into Client Components AND unit-test without
  a DB — `tests/admin.test.mjs`). `nav.mjs#buildAdminNav(resolved)` filters the sidebar
  to modules the viewer can touch. `forms.mjs` validators MIRROR the service validators
  (show inline errors pre-POST; the service stays the authority). `server.mjs`/`reads.mjs`
  ARE server-only (they import prisma — a client bundle would fail).
- **Generic content editor.** The content module edits any `content_type` with no
  per-type screen: it renders scalar payload inputs from
  `lib/cms/content-types.mjs#getContentTypeFieldSpec` and collects a type's REQUIRED
  payload fields on create. (Normalized list children — mission points, meal timings —
  are still edited via the importer/API.)

### Users & Roles — the one net-new backend (`lib/users/admin.mjs`)

Manages `app_user` / `role` / `role_assignment`. Same conventions as every service
(authorize first, one semantic audit row via `auditedMutation` using the
`grant_role`/`revoke_role` actions, friendly mapped errors, JSON-safe SHAPED returns —
never the raw row / `passwordHash`). **Privilege-escalation guards (DL-049) — keep them:**

- Only a **developer** (`app_user.is_developer`) can create/set `is_developer` OR
  grant a `grants_all`/`is_system` role (developer/super_admin). A `grants_all`
  super_admin has every *permission* but is not a developer, so `role.assign` alone
  cannot mint the unrestricted bypass (this was the review's CRITICAL finding —
  guarding the flag but not the equivalent grant).
- New roles can't be `grants_all`; system roles are modification-protected except
  `description`; you can't set your OWN account to a non-active status (self-lockout).

Internal `roleView(id)` (ungated) backs `getRole`/`createRole`/`updateRole`'s return +
audit before/after, so create/update don't require the actor to ALSO hold `role.read`.

## Hardening & deploy (Session 10)

- **CI** — `.github/workflows/ci.yml`: static suite + `npm run lint` + `npm run
  build` on every push/PR; a secret-gated `live-db-tests` job runs the Neon suite
  nightly / on manual dispatch (mirrors the local `RUN_DB_TESTS=1` opt-in). Operator
  procedure: [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md).
- **Write-route guards** — `lib/http/guard.mjs`: `assertSameOrigin(req)` (CSRF —
  rejects a cross-origin / opaque-`null` browser Origin/Referer; allows a genuinely
  header-less non-browser client) and `makeRateLimiter`/`assertWithinRateLimit` (a
  per-process fixed-window limiter, friendly 429 + `Retry-After`). Both are wired
  into `POST /api/admin/action` (60/min/account) and `POST /api/events` (20/min).
  `assertSameOrigin` allows the `NEXTAUTH_URL` host, so set it to the real origin.
  **Any new public write route should wrap both.** Pure parts: `tests/security.test.mjs`.
- **Security headers** — `next.config.mjs#headers()` (nosniff / X-Frame-Options /
  Referrer-Policy / Permissions-Policy / HSTS). CSP is deferred (needs a nonce
  pipeline — KNOWN_ISSUES #33).
- **CWV** — `lib/media/cloudinary.mjs#cloudinaryAutoUrl(url)` injects `f_auto,q_auto`
  into Cloudinary IMAGE URLs (used in `lib/org/public.mjs` + `lib/events/public.mjs`;
  never on PDFs). Set `sizes` on every `next/image fill`.
- **Fonts** — load fonts ONLY via `next/font/google` in `app/layout.js` (exposed as
  `--font-*` CSS variables); never re-introduce a `@import url(fonts.googleapis…)`.
  Brand blue is `#003f87` (`--brand-blue` in `globals.css`).
- **NFT (#32)** — dev-console fs reads are bundled via `outputFileTracingIncludes`;
  the build's NFT over-trace note is benign (accepted, DL-055).

## Member platform — M0: auth, accounts & the PLUGIN (Session 11)

The member platform (Session 11+) ships behind ONE developer-controlled plugin. M0
delivered the plugin control plane + the email+password auth pivot + the
admin-mediated account lifecycle.

- **Plugin / feature flags** — `lib/platform/flags.mjs` + the `feature_flag` table.
  `member_platform` gates the whole program. `isFeatureEnabled(key)` is an ungated,
  **fail-closed**, 10s-cached read (a DB error ⇒ `false`); `assertFeatureEnabled(key)`
  404s when off; `setFeatureFlag(key, enabled, actor)` is **developer-only** + audited.
  Toggle it at **`/admin/plugins`** (DL-058). New optional modules add a `PLUGIN_DEFS`
  row + seed; re-seeding never resets the operator's `enabled`.
- **Auth pivot (DL-059)** — Google is rejected at the `signIn` callback when the plugin
  is on (kept when off); `app_user.must_change_password` forces a first-login change.
  The root **`middleware.js`** (edge) reads ONLY the JWT and redirects a must-change
  user to `/account/password`; the decision is the pure `lib/auth/must-change.mjs#shouldForcePasswordChange`.
  Never read the DB in the middleware (no Prisma on the edge).
- **Account lifecycle (`lib/users/admin.mjs`, DL-061)** — `createUser` (initial
  password ⇒ must-change), `importUsersCsv`/`parseUserCsv` (bulk CSV; existing emails
  skipped), `forcePasswordReset` (generate + must-change; returns the plaintext ONCE),
  `changeOwnPassword` (self only; verifies current; clears must-change), `deleteUser`
  (hard delete; no self-delete; developer-delete is developer-only). Passwords obey
  ONE policy (`lib/auth/password-policy.mjs`, client+server); the CSPRNG generator is
  the server-only `lib/auth/password-generator.mjs`.
- **Request queue (`lib/notifications/service.mjs`, DL-060)** — public
  `createAccountRequest`/`createPasswordResetRequest` (dedup open ones; account
  existence NOT leaked), gated `listNotifications`/`assignNotification`/`resolveNotification`,
  and `lib/auth/password-reset.mjs#fulfilResetRequest` (assign → generate → set → resolve).
  Human ref ids (`AR-/PR-NNNNN`) come from the raw-SQL `notification_ref_seq`. Surfaced
  at **`/admin/requests`** (Password Management). New permissions: `notification.{read,assign,resolve}`, `user.delete`.
- **Public routes** — `POST /api/account/{request,forgot,password}` each wrap
  `assertSameOrigin` + `assertFeatureEnabled` + `accountRequestLimiter`; the forgot
  route always returns a generic success (no existence leak).

**How to check which plugins / modes are currently enabled:**
- **UI:** sign in as a developer/admin and open **`/admin/plugins`** (shows each flag's
  ON/OFF, who changed it, when). The **Developer** chip in the admin topbar means your
  account has `is_developer`.
- **CLI/SQL (no UI):**
  ```bash
  # list every feature flag + state
  dotenv -e .env.local -- node -e "import('@prisma/client').then(async({PrismaClient})=>{const p=new PrismaClient();console.table(await p.featureFlag.findMany({select:{key:1,enabled:1,updatedAt:1}}));await p.\$disconnect()})"
  # who has developer / which roles a user holds
  dotenv -e .env.local -- node -e "import('@prisma/client').then(async({PrismaClient})=>{const p=new PrismaClient();console.table(await p.user.findMany({where:{isDeveloper:true},select:{email:1,isDeveloper:1}}));await p.\$disconnect()})"
  ```
  Or in `npm run db:studio` / psql: `SELECT key, enabled, updated_at FROM feature_flag;`
  and `SELECT email, is_developer FROM app_user WHERE is_developer;`.
- "Admin mode" = the roles/permissions a signed-in account holds (RBAC, resolved live
  per request); see them at `/admin/users` (per user) or via `getEffectivePermissions`.

> **After this migration** run `npm run db:seed` once (idempotent) so the 4 new
> permissions (`notification.*`, `user.delete`) attach to `super_admin` and the
> `member_platform` plugin row is registered. The migration itself is schema-only.

## Member platform — M7/M8: notifications, feedback & the developer dashboard (Session 11)

The M7/M8 SPINE (the foundation M3–M6 consume). Migration `20260630170000_member_platform_m7m8`
(additive: `notification.label` + `feedback` / `page_visit` / `table_threshold` /
`authorized_sender` + `feedback_ref_seq` + CHECK tail). After pulling: `npm run db:migrate`
then `npm run db:seed` (idempotent; +5 permissions → 50).

- **Notifications generalized (M7, DL-069).** `lib/notifications/service.mjs` gains a free-text
  `label`, `listNotificationsPage` (keyset, createdAt+id cursor), and a generic deduped
  `createNotification({ type, label, title, body, entityType, entityId, data, dedupeKey })`
  for system producers. Reuse it for any future queue item — DON'T add a parallel table.
- **Feedback / support tickets (M7, DL-070).** A STANDALONE table (`lib/feedback/{forms,service}.mjs`).
  Public create via `POST /api/feedback` (plugin + CSRF + rate-limit; submitter linked from the
  SESSION, never the body) → `FB-NNNNN` ref id. Triage/assign/resolve gated `feedback.resolve`
  (audited); reads gated `feedback.read` (keyset). Public form `/feedback`; admin `/admin/feedback`.
  The pure `validateFeedbackForm` (lib/feedback/forms.mjs) is the client+server validator.
- **Windowing (M7, DL-074).** `lib/events/public.mjs#groupByWindow(items, { fromKey, untilKey })`
  → `{ upcoming, current, past }` — the shared past/current/upcoming primitive (reuse for M3 club
  announcements).
- **Action Log export (M8, DL-068).** `lib/devconsole/audit.mjs#exportAuditLog(filters, actor, {format})`
  (JSON/CSV, PII-minimized, `audit.read`). Registry action `audit.export`.
- **Usage analytics (M8, DL-071).** `recordPageVisit({path,section,userId})` is best-effort + never
  audited; the `POST /api/usage` beacon records it (NOT yet auto-fired from the client — KNOWN_ISSUES #41).
  `getUsageAnalytics({windowDays}, actor)` (gated `dev.console`) → top sections/paths.
- **Storage monitoring (M8, DL-072).** `lib/devconsole/storage.mjs`: `getTableSizes` (raw SQL),
  `setTableThreshold`/`getStorageReport` (flags over-threshold tables NON-blocking + a deduped
  alert), `exportTable` (any table → download + a GUARANTEED audit row + a best-effort
  `backup_record`), `truncateTable` (allowlist `{page_visit}` + `confirm:true` + a
  validate-against-live-catalog injection guard). All gated `storage.manage` — **developer-only**
  (excluded from `admin`). Surfaced at `/admin/devdash`.
- **Bulk mail (M8, DL-073).** `lib/mail/{progress,service}.mjs`: an `authorized_sender` allowlist
  (`mail.manage`) + `sendBulk(input, actor, { transport, sleep, ratePerMinute, onProgress })`
  (`mail.send`, rate-limited, one accounting-only audit row). nodemailer is LAZY + INJECTABLE — to
  enable real sending: `npm install nodemailer` + set `MAIL_HOST`/`MAIL_PORT`/`MAIL_USER`/`MAIL_PASS`
  (until then `sendBulk` returns a friendly 503; KNOWN_ISSUES #40). Tests inject a fake transport +
  a no-op `sleep`. Surfaced at `/admin/mail`. Initial passwords still go via external institute mail.

## Member platform — M3: club/council pages + memberships (Session 11)

Migration `20260701120000_member_platform_m3` (additive: `club_membership` + FKs/unique/CHECK +
`announcement_payload.sync_to_central`). After pulling: `npm run db:migrate` then `npm run db:seed`
(idempotent; +1 permission → 51, +the `club_doc` content type). **NB:** the Prisma model now selects
`announcement_payload.sync_to_central`, so announcement reads require the migration applied.

- **Club memberships (DL-075).** `lib/memberships/service.mjs` — a STANDALONE M-M (`app_user` ↔
  `org_unit_lineage`, durable across years, `UNIQUE(user, lineage)`). `addMembership({ userId|email,
  orgUnitLineageKey|orgUnitId|slug, role?, status? })` (idempotent upsert — a status-only re-add
  PRESERVES the existing role), `removeMembership`, `setMembershipStatus`, `listMembershipsForUnit`
  (PII roster — gated), `getMembershipCountForUnit` (public aggregate — ungated), `listUserMemberships(userId)`
  ("my clubs" — self). All mutations gate the NEW **`membership.manage`** permission SCOPED to the unit's
  lineage (`assertActorPermission(actor, "membership.manage", { orgUnitLineageKey, academicYearId })`,
  DL-066) BEFORE any disclosure; one semantic audit row each (`ClubMembership` is in `AUTO_AUDIT_SKIP`).
  **Bulk CSV sync:** `importClubMemberships({ orgUnitLineageKey|orgUnitId|slug, csv, defaultRole?, defaultStatus? })`
  — idempotent by `(user, lineage)`, resolves each email→account (missing accounts REPORTED, never
  auto-created), ONE summary audit row. Pure `parseMembershipCsv` (lib/memberships/forms.mjs) mirrors it.
  Registry actions: `membership.{add,remove,setStatus,import}` (scoped) on `POST /api/admin/action`.
- **Club markdown docs + announcements/events (DL-076).** `club_doc` is a content_type reusing
  `page_block_payload` (`blockKind='markdown'`, `body=markdown`) — CRUD via the CMS service scoped to
  the club's lineage (content.*), each doc its own lineage. Club announcements/events = the existing
  types bound to the club via `content_item.orgUnitId`. Public reads: `lib/org/docs.mjs#listClubDocs`,
  `lib/events/public.mjs#listClubEvents/listClubAnnouncements` (archive-like: `enforceWindow:false`).
- **Safe markdown (DL-077).** `lib/markdown/render.mjs#renderMarkdown(md)` — PURE, escape-FIRST (HTML
  escaped before any markup → injection impossible), scheme-validated links (`isSafeHref`). Feed its
  output to `dangerouslySetInnerHTML`. `markdownPreview(md, max)` for card excerpts. Reused by M4.
- **Announcement sync-to-central (DL-078).** Set `payload.syncToCentral = true` on a club announcement
  to also surface it on the central board. `listPublicAnnouncements` filters via the pure
  `isCentralAnnouncement(item, payload)` (central `orgUnitId==null` OR synced). Club listings group
  past/current/upcoming with `groupByWindow` (fromKey `publishFrom`, untilKey `publishUntil`).
- **Tabbed club page (DL-079).** `lib/org/public.mjs#getClubPageView(slug)` aggregates the base view +
  events/announcements/docs/memberCount (concurrently); `app/components/OrgUnitTabs.jsx` (Client) renders
  the tabs. Expanded tabs (Announcements/Upcoming/Past/Achievements-stub/Documents) only for
  `EXPANDED_UNIT_TYPES` (club/council); hostels/messes keep Overview + Resources. `OrgUnitPage` is removed.
  The M8 **usage beacon** is wired in the root layout (`app/components/UsageBeacon.jsx` → `POST /api/usage`).

## Member platform — M4: Wall of Fame / student achievements (Session 11)

Migration `20260701130000_member_platform_m4` (additive: `achievement_payload` + `achievement_credit`
+ FKs/uniques/CHECK). After pulling: `npm run db:migrate` then `npm run db:seed` (idempotent; +the
`achievement` content type — **no new permission**, still 51). Achievements reuse the `content.*` set.

- **Achievement content (DL-080).** A NEW `content_type='achievement'` (year-scoped, **NOT** org-bound)
  driven through the ordinary CMS service (create/edit/publish via the `content.*` admin actions). Own
  payload table `achievement_payload` = typed scalars (`category`, `achievementDate`, `heroMediaId`) + a
  `blocks` **JSONB** of HYBRID ordered blocks. Block kinds: `markdown` (`body`), `markdown_image`
  (`mediaId` + `body?` + `imagePosition`), `banner` (`mediaId` + `caption?`), `link` (`url` + `label?`),
  `gallery` (`mediaIds[]` + `caption?`). The pure client-safe **`lib/achievements/forms.mjs`**
  (`normalizeBlocks`/`normalizeAchievementPayload`/`creditTargetKind`) validates + normalizes and is run
  server-side via the generic handler's NEW `coercePayload` hook (throws 422 on a bad block) — no parallel
  pipeline. Markdown renders via `lib/markdown/render.mjs` (escape-first, DL-077); link urls reuse `isSafeHref`.
- **Credits / mapping (DL-081).** `lib/achievements/credits.mjs#setAchievementCredits(itemId, credits, actor)`
  REPLACES an achievement's credit set (idempotent; audited — ONE summary row). Each credit is
  `{ userId | email | orgUnitLineageKey, role?, sortOrder? }` and targets EXACTLY ONE of a member OR a club
  (a DB CHECK + `creditTargetKind` + two per-target uniques). Missing emails are reported (never
  auto-created). `AchievementCredit` is in `AUTO_AUDIT_SKIP`. Registry action `achievement.credits.set` (scoped).
- **Central curation (DL-082).** Achievements are institute-level (not org-bound), so credit management
  authorizes `content.update` at the achievement's YEAR scope — an UNSCOPED grant (staff/admin) passes; a
  unit-scoped coordinator is 403. Public reads (`lib/achievements/public.mjs`): `listWallOfFame({yearId?, category?})`,
  `getAchievementBySlug`, `listClubAchievements(orgUnitLineageKey)` — all Server-Component, batched, PII-minimized
  (members by display name only). Surfaces: **`/wall-of-fame`** (plugin-gated) + the club page's **Achievements**
  tab (`getClubPageView` → `view.achievements` by the club's durable lineage). Shared renderer:
  `app/components/AchievementCard.jsx` (`compact` for the tab).
- **Shared-handler fix (DL-083).** `writePayload` now uses `UPDATE` (not `upsert`) on a partial edit
  (`isCreate:false`) — the payload row always pre-exists on edit, and Prisma statically requires the
  `upsert.create` branch to carry NOT-NULL columns. Fixes a latent M3 bug the first live run surfaced.

## Member platform — M5: Centralized Event Playground (Session 11)

The event stays a versioned `content_type='event'` content_item (DL-037) — its CONTENT (a markdown
`problemStatement` + `eligibility`, a `category` facet, and a `blocks` JSONB of hybrid ordered blocks)
lives in `event_payload`, normalized by the pure `lib/events/forms.mjs#normalizeEventPayload` through a
`coercePayload` hook that reuses the M4 `normalizeBlocks` (DL-084). Everything operational is standalone
tables keyed on the DURABLE event item; registration CONFIG (capacity / window) is a 1:1 `event_settings`.

- **Authorize event ops via `assertEventManage(actor, eventItemId, { requireGlobal? })`** (`lib/events/authz.mjs`):
  GLOBAL `event.manage` (staff/admin/dev — an UNSCOPED grant) OR SCOPED to any tagged ORGANIZING club
  lineage (a coordinator runs their own event). `requireGlobal:true` = central-only (organizer tagging,
  closure review, custom entities). The RBAC resolver's `inScope()` keeps a club-scoped grant from
  passing the global check — so tagging (which grants scoped access) must be central (DL-086).
- **Organizer tagging** (`lib/events/organizers.mjs#setEventOrganizers`, replace-set, one audit row): each
  tag targets exactly one of {club lineage, `event_entity`, member} (a DB CHECK). Custom entities are
  admin/dev-defined durable stakeholders.
- **Registration** (`lib/events/registration.mjs`): MEMBER self-service is the gated `POST /api/events/participate`
  route (`requireMember` + `assertCanParticipate` — inactive can't participate) — NOT audited (durable row).
  Capacity → waitlist is a service decision backstopped by a DEFERRED trigger (`event_registration_capacity_guard`)
  + a race-retry; cancelling a confirmed spot auto-promotes the earliest waitlisted. Organizer add/setStatus/
  remove ARE audited (`event.registration.*` registry actions).
- **Rounds / scores / attendance** (`lib/events/{rounds,scoring}.mjs`): scores/attendance are per-round
  (`round_id`) or overall (`round_id NULL`), submitted as replace-set SHEETS (one summary audit row).
  RANKING is read-layer only — `rankEntries` (PURE, standard competition rank); overall = sum. The
  playground detail (`lib/events/playground.mjs#getPlaygroundEvent`) builds all rankings from ONE score fetch.
- **CSV downloads**: `GET /api/events/export?eventItemId=&kind=participants|scores|attendance|ranking[&roundId=overall|<uuid>]`
  (`lib/events/downloads.mjs#exportEventCsv`, gated by `assertEventManage`; pure builders in `lib/events/csv.mjs`).
- **Closure** (`lib/events/closure.mjs`): an organizer submits an optional markdown report (role/contribution +
  self-reported budget); a CENTRAL reviewer (`requireGlobal`) adds a comment + corrected budget.
- **"Events Organized"** = `content_type='events_organized'` (page_block markdown) edited through the CMS →
  every edit is audited + version-diffable; the change history is visible + downloadable from the M8
  dev-dashboard (`lib/events/organized.mjs#getEventsOrganizedChangeHistory` / `exportEventsOrganizedHistory`).
- **New content-type reminder:** an `event.manage` permission + the `events_organized` content type are
  seed DATA (`lib/rbac/permissions.mjs` / `lib/cms/content-types.mjs`) — re-seed after pulling.

## Member platform — M6: Member profiles & performance (Session 11)

M6 is a **READ-ONLY aggregation** module over the DURABLE ids M3/M4/M5 store — **NO new table,
permission, migration, or mutation** (DL-090). It has three files + surfaces:

- **`lib/member/profile.mjs`** — `getMemberProfile(userId, { yearId?, scopeEventsToYear?, _achievements? })`
  aggregates identity (`parseInstituteEmail`), roles/category (`role_assignment` + resolved scope-unit
  names), affiliations (`club_membership` + a DERIVED syndicate facet), the member's full EVENT
  involvement, and credited achievements. `getMemberEventHistory` batches registrations ∪ own-scores ∪
  attendance → per-event rows, and computes the member's OVERALL **rank** in-memory from ONE all-scores
  fetch via `rankEntries` (same sum-across-round+overall as M5 `getOverallRanking`, DL-091). Events are
  all-time (durable); achievements follow M4 current-year visibility. **The two profile surfaces call
  `getMemberProfileView(userId)`** — it resolves the current year + hydrates the heavy `listMemberAchievements`
  ONCE and injects both into `getMemberProfile`/`getMemberContribution` (the `_achievements` seam) so the
  page doesn't re-run the heaviest read twice (review fix, DL-093).
- **`lib/member/contribution.mjs`** — `getMemberContribution` / `getClubContribution` /
  `getEntityContribution` (+ `getStakeholderContribution` dispatcher + `listContributionStakeholders`
  picker) aggregate a stakeholder's YEAR contribution by durable id (organized / participated /
  achievements / roles / members / **participants reached** = a PII-minimized distinct COUNT, DL-092),
  reusing `listClub/MemberAchievements` + `getMembershipCountForUnit`.
- **`lib/member/summary.mjs`** — PURE, client-safe (`splitMemberEvents` / `categoryBreakdown` /
  `participationSummary` / `formatIdentity` / `contributionTotals` / `pickSyndicate`), imported by BOTH
  the reads AND the presentation (DL-093/051).
- **Surfaces:** self **`/member/profile`** (gated by `loadMemberContext` — own data), admin
  **`/admin/users/[userId]`** (gated `loadModuleContext('users')` + explicit `hasPerm('user.read')`), and
  **`/admin/contribution`** (member/club/entity explorer, query-param driven — Server-Component GETs, no
  API route) behind the NEW `contribution` nav module (`anyOf:['user.read']`). Rendering is TWO shared
  **Server Components** (`app/components/MemberProfile.jsx` / `ContributionSummary.jsx`) so member PII
  stays server-side; the one client component (`ContributionClient`, the picker) gets only public names.
- **No seed/migration reminder for M6:** it adds no permission, content type, or table — `db:migrate` /
  `db:seed` stay idempotent.

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
- `lib/events/` — Events + Announcements (Session 6): `public.mjs` (read/shape +
  pure `splitEventsByDate`/`filterByAudience`), `data.mjs` + `import.mjs` (V1 migration).
- `lib/resources/` — Resources (Session 7): `public.mjs` (per-unit read),
  `data.mjs` (V1 infra PDFs/links) + `import.mjs` (idempotent importer).
- `lib/media/` — Media (Session 7): `cloudinary.mjs` (pure URL/signature/uploader),
  `service.mjs` (audited `media_asset` CRUD + bulk inventory helper),
  `migrate.mjs` (idempotent + reversible `/public`→Cloudinary migration tool).
- `lib/devconsole/` — Developer Console readers (Session 8): `authorize.mjs`
  (any-of `authorizeConsole`), `audit.mjs`, `status.mjs`, `reports.mjs`, `backups.mjs`.
- `lib/users/admin.mjs` — Users & Roles service (Session 9): the one net-new backend
  (users/roles/grants, audited, escalation-guarded).
- `lib/admin/` — Admin Panel support (Session 9): `nav.mjs` / `view-models.mjs` /
  `forms.mjs` (PURE, client-safe, unit-tested), `handlers.mjs` (the mutation action
  registry + dispatcher), `server.mjs` + `reads.mjs` (server-only gated context/reads).
- `app/admin/` — the RBAC-gated panel: `layout.jsx` (auth + shell), `page.jsx`
  (dashboard), per-module `page.jsx` + `*Client.jsx`, `_components/` (shell + shared
  client toolkit), `admin.css`. `app/api/admin/action/route.js` — the one mutation route.
- `scripts/` — operator entry points: `import-org.mjs`, `import-events.mjs`,
  `import-resources.mjs`, `migrate-media.mjs`, backup tools.
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
