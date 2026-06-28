# Target Architecture (V2.0 — Proposed)

> **Status:** Proposed design, pending approval. Nothing here is implemented.
> Detailed designs for each subsystem will be finalized in their milestone (see
> [MILESTONE_PLAN.md](MILESTONE_PLAN.md)) and documented before coding that
> milestone. This is the overview that ties the subsystems together.

## Design principles

1. **Data over code.** Content and structure live in the database, edited through
   the portal — not hardcoded. (Today, only `Event` is dynamic.)
2. **Historize everything.** Every content entity carries an `academicYearId`;
   transitions copy structure forward. **Nothing is overwritten.**
3. **Flexible, not enumerated.** Organization types/positions/roles are data, so
   new kinds can be added without schema changes.
4. **Server-authoritative.** Authentication/authorization enforced on the server
   for every mutation.
5. **Reuse first.** Refactor the existing pages into data-driven components rather
   than rewriting; keep the existing visual design and brand.
6. **Document + test as you go.** Each milestone updates docs and passes the test
   gate.

## System overview

```
                         ┌──────────────────────────────┐
   Public visitors  ───► │  Public site (Server Components,│
                         │  reads published content)      │
                         └───────────────┬────────────────┘
                                         │ reads
   Administrators ─────► ┌───────────────▼────────────────┐
                         │  Admin Panel (RBAC-gated CMS)   │
                         └───────────────┬────────────────┘
                                         │ writes (authz)
   Developers ────────► ┌───────────────▼────────────────┐
                         │  Developer Console (ops/monitoring)│
                         └───────────────┬────────────────┘
                                         │
                         ┌───────────────▼────────────────┐
                         │  API layer (validated, versioned,│
                         │  role-checked route handlers)    │
                         └───────────────┬────────────────┘
                                         │
                ┌────────────────────────┼────────────────────────┐
                ▼                        ▼                        ▼
        PostgreSQL on Neon        Cloudinary (media)        Audit / Backups
          (via Prisma)
```

> **Database:** V2 uses **PostgreSQL (Neon) + Prisma**, replacing V1's
> MongoDB/Mongoose. The complete, normalized, adversarially-verified schema —
> with ER diagram and reasoning — is in [SCHEMA_DESIGN.md](SCHEMA_DESIGN.md). The
> entity sketch below is the conceptual summary; **SCHEMA_DESIGN.md is
> authoritative.**

## Proposed data model (entities)

All content entities below include `academicYearId`, `createdAt`, `updatedAt`,
`createdBy`, `status` (`draft|published|archived`), and a soft-delete flag.

### Identity & access
- **User** — `{ email (unique), name, image, passwordHash?, providers[], status }`.
  One account per email; Google and Credentials both resolve here.
- **Role** — `{ key, label, description, permissions[] }` (data-driven).
- **Permission** — `{ key, label }` (e.g. `club.edit`, `user.manage`).
- **Membership** — `{ userId, roleId, scope (orgUnitId?), academicYearId }`
  → enables multiple roles per user, scoped per year/unit.

### Academic year
- **AcademicYear** — `{ label ("2025-26"), startDate, endDate, isCurrent, status }`.
  Drives the Academic Year Engine + Transition Wizard.

### Organization (flexible)
- **OrganizationType** — `{ key, label }` (e.g. Council, Club, Committee, Hostel,
  Mess, Office, …). New types are rows, not code.
- **OrganizationUnit** — `{ typeId, name, slug, parentId?, description, logo,
  academicYearId, status }` (hierarchical: Council → Club, etc.).
- **Position** — `{ unitId, title (e.g. Coordinator/Secretary/Warden), order }`.
- **Appointment** — `{ positionId, personId, role, academicYearId }`
  (who holds which position, per year — historized).
- **Person** — `{ name, photo, email?, phone?, profileUrl?, type (faculty/student/staff) }`.

### Content
- **Club / Hostel / Mess / Council** — modeled as `OrganizationUnit` subtypes
  plus type-specific attributes (e.g. Hostel: building image, wardens; Mess:
  location, capacity, timings; Club: Instagram link, vision/mission).
- **Event** — the existing model, extended with `academicYearId`, author,
  status, and a Cloudinary image reference instead of base64.
- **Announcement** — `{ title, body, audience, publishAt, expireAt, pinned }`.
- **Resource** — `{ title, type (pdf/link/doc), url, unitId?, academicYearId }`.
- **FlagshipEvent** — `{ title, image, description, academicYearId }`.
- **MediaAsset** — `{ cloudinaryId, url, originalPath?, alt, uploadedBy }`
  (tracks `/public` → Cloudinary migration; preserves original references).

### Operations
- **AuditLog** — `{ actorId, action, entity, entityId, before, after, at }`.
- **Backup** — `{ createdAt, scope, format, location, checksum, verified }`.

> These are **proposed shapes** informed directly by the de-facto schemas in
> [DATA_INVENTORY.md](DATA_INVENTORY.md). Exact fields are finalized per milestone.

## Academic Year Engine (proposed)

- Every historized entity references an `AcademicYear`.
- **Transition Wizard:** an admin picks a source year and a new label; the system
  **copies the organization structure** (units, positions) into the new year,
  optionally copies content (people/appointments/resources), then lets admins
  edit only what changed. Past years remain read-only and viewable.
- Public pages default to the current year, with a year selector to browse history.

## Flexible Organization Model (proposed)

- Org **types**, **units**, **positions**, and **roles** are all stored as data.
- Admins can create/rename/archive/remove them in the Admin Panel without code
  changes; archiving preserves history rather than deleting.
- Schema is additive (new optional fields/types) so existing data never breaks.

## Authentication & RBAC (proposed)

See [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md). Summary: NextAuth
with the **Prisma adapter (PostgreSQL/Neon)**, Google + Credentials providers
keyed by email, DB-backed roles/permissions, multi-role memberships, and a single
server-side authorization utility used by all protected handlers.

## CMS design (proposed)

- A generic, schema-driven editing layer: each content type registers fields,
  validation (Zod), and list/detail/edit views.
- Public pages become **data-driven**: e.g. one `<CouncilPage>` renders any
  council from data, replacing the four near-duplicate Clubs pages.
- Draft → review → publish workflow; everything year-scoped.

## Admin Panel (proposed)

Modules: Users & Roles, Academic Years (+ Transition Wizard), Organizations
(units/positions/appointments), Clubs, Councils, Hostels, Messes, Events,
Announcements, Resources, Permissions, Media. All gated by RBAC.

## Developer Console (proposed)

Unrestricted (Developer role). Modules: infrastructure/DB/storage/app/API
monitoring, resource usage, health dashboard, logs, audit trail, testing reports,
deployment status, backup/restore/rollback, migration tools, documentation
viewer, diagnostics, and **cost/infra estimation** (recommended VM/DB/storage/
media upgrades with links to provider pricing/docs).

## Media management (proposed)

- Keep `/public` **unchanged** for now (per spec).
- Build an **Admin Media Migration Tool** that uploads local media to Cloudinary,
  records a `MediaAsset`, and safely updates references (with rollback).
- New uploads go straight to Cloudinary with validation/size limits — **no more
  base64 in the DB**.

## Backup & recovery (proposed)

See [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md). A verified backup precedes
any migration; backups are produced in JSON/CSV/Markdown and packaged as ZIP.

## Rendering & performance (proposed)

- Move static/public content to **Server Components**; fetch via the data layer.
- Add caching, pagination, responsive images (Cloudinary transforms), skeleton
  loaders, and lazy loading. See [PERFORMANCE.md](PERFORMANCE.md).

## Compatibility & migration

- The existing brand, layout, and `/public` assets are preserved.
- The current `Event` collection is migrated in place (add fields; backfill
  `academicYearId = 2025-26`).
- See [MIGRATION_PLAN.md](MIGRATION_PLAN.md) for the data path and rollback.

> Each subsystem above gets a dedicated, detailed design section/document at the
> start of its milestone — **after** approval — so we don't pre-commit
> architecture before it's needed.
