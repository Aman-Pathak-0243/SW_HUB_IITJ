# Data Migration Report (V1 → V2)

> **Purpose:** the authoritative, item-by-item map of everything in V1 and where
> it goes in V2 — and whether it becomes CMS-managed, database-managed, stays
> static, or is retired. This guides the migration sessions (org content →
> Session 5, events → Session 6, media → Session 7).
>
> **DB pivot:** V1 MongoDB/Mongoose → V2 **PostgreSQL (Neon) + Prisma**. Target
> tables are defined in [SCHEMA_DESIGN.md](SCHEMA_DESIGN.md). All V1 data was
> captured in a verified backup in Session 1 ([BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md))
> before any change.

## 1. Existing hardcoded data (in React source)

Almost all V1 content was hardcoded in page components (see
[DATA_INVENTORY.md](DATA_INVENTORY.md) for the exhaustive inventory):

- **Councils** (4: General, Academic, Cultural, Sports).
- **Clubs** (30 total) — name, logo, Instagram link, vision, mission list.
- **Club people** — Professors-in-Charge (~19), coordinators (~36), secretaries.
- **Hostels** (6) — building image, warden/secretary/caretaker(s)/wellness
  warden/attendant, institutional emails/phones.
- **Messes** (5) — name, location, capacity, image; meal timings (4);
  committee (16 members).
- **Team directory** (~37 people across 7 groups).
- **Flagship events** (6 recurring fests) — title, image, description.
- **Home page** — hero image sets, Dean's message, vision/mission, quotes.
- **Contacts** — Contact-Us card + footer phone numbers + social links.

## 2. Existing MongoDB collections

Database `test` (captured in the Session-1 backup):

- **`events`** — 3 documents (`title`, `description`, `date`, `image`, `createdAt`).
- **`queries`** — 1 document. **Not referenced anywhere in the V1 source** —
  discovered only via the full Mongo dump; likely a contact/enquiry submission or
  a manual test. Disposition decided below.

## 3. Existing public assets

- `/public` — **105 files (~77 MB)**: 100 raster images + 5 SVGs. Naming is
  human-readable with spaces. **Not moved in V2** until the Admin Media Migration
  Tool (Session 7) uploads them to Cloudinary and updates references.
- **Cloudinary** — two accounts (`dveqd1vm1`, `dabviijid`) referenced in code:
  people photos, logos, the flag GIF, and four infrastructure PDFs.

## 4. Existing JSON / config files

- `package.json`, `package-lock.json`, `next.config.mjs`, `jsconfig.json`,
  `postcss.config.mjs`, `eslint.config.mjs`, `env.example`, `empty-module.js`.
- **No data/seed JSON files** exist — there is no JSON content store in V1; all
  content is either hardcoded in JSX or in the `events` collection.

## 5. Existing routes

App Router routes (see [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md)):
`/`, `/Clubs/{Academic,Cultural,General,Sports}`, `/hostels`, `/messes`,
`/Team`, `/Contact-Us`, `/Flagship-events`, `/announcements`, `/past-events`,
`/admin`, plus API routes `/api/events` and `/api/auth/*`. (Dead/unrouted:
`app/page1.js`, `app/admin/page2.js`.)

## 6. Existing static pages

Every page above except `/announcements` and `/past-events` is **fully static**
(hardcoded, no data fetching). `/announcements` and `/past-events` fetch
`/api/events`; `/admin` is the only authenticated page.

---

## 7. What becomes CMS-managed

Editable through the Admin Panel (draft/publish + version history + year scope):

- **Mongo 'Event' collection (title, description, date, image, createdAt)**
  → `content_item (content_type='event') + content_revision + event_payload (body, event_date, cover_media_id) + media_asset (from image)` _(CMS-managed)_
- **Hardcoded React: Councils (4: General, Academic, Cultural, Sports)**
  → `org_unit_lineage (one per council) + org_unit (type=council, one per year) + content_item (content_type='council_profile') + content_revision + club_profile_payload` _(CMS-managed)_
- **Hardcoded React: Clubs (30) name/logo/instagram/vision/mission**
  → `org_unit_lineage (one per club) + org_unit (type=club, parent=council) + content_item (content_type='club_profile') + club_profile_payload (vision, instagram_url, logo) + club_mission_point (mission list)` _(CMS-managed)_
- **Hardcoded React: club PIC (faculty), coordinators (students), secretary (student)**
  → `person + position (pic/coordinator/secretary) + appointment (per club org_unit per year)` _(CMS-managed)_
- **Hardcoded React: Hostels (6) building image, institutional emails/phones**
  → `org_unit_lineage + org_unit (type=hostel) + content_item (content_type='hostel_profile') + hostel_profile_payload` _(CMS-managed)_
- **Hardcoded React: hostel warden/secretary/caretaker/wellness-warden/attendant**
  → `person + position + appointment (per hostel org_unit per year)` _(CMS-managed)_
- **Hardcoded React: Messes (5) name/location/capacity/image**
  → `org_unit_lineage + org_unit (type=mess) + content_item (content_type='mess_profile') + mess_profile_payload` _(CMS-managed)_
- **Hardcoded React: mess meal timings (breakfast/lunch/snacks/dinner ranges)**
  → `mess_meal_timing (1 row per meal per mess_profile revision; wraps_midnight for late windows)` _(CMS-managed)_
- **Hardcoded React: mess committee (titles + people)**
  → `person + position + appointment (title_override for ad-hoc titles like 'AD Mess Management')` _(CMS-managed)_
- **Hardcoded React: Team directory (dean, associate deans, wardens, assistant registrar, admin staff, caretakers, council secretaries, website developers)**
  → `person + position + appointment (institute-level positions, applies_to_type_id NULL); optional content_item (content_type='team_page')/page_block for layout` _(CMS-managed)_
- **Hardcoded React: Flagship events (6: Anhad, Nexus, Convoquer, Pragyaan, Udyamitsav, Pravaah) title/image/description**
  → `content_item (content_type='flagship_event') + content_revision + flagship_event_payload` _(CMS-managed)_
- **Hardcoded React: Announcements (title/body/date/audience/pinned/windows)**
  → `content_item (content_type='announcement', pinned flag) + content_revision + announcement_payload (body, audience, publish_from/until) — OWN payload table, no longer shares event_payload` _(CMS-managed)_
- **Hardcoded React: Resources (infrastructure PDFs, Drive links) per org unit**
  → `content_item (content_type='resource', org_unit-bound) + resource_payload (resource_kind, file_media_id/external_url)` _(CMS-managed)_
- **Hardcoded home-page sections (hero, dean's message, quotes, council heroImages set)**
  → `content_item (content_type='page_block') + page_block_payload (block_kind, data jsonb) + content_media (hero image sets, role=hero/hero_primary)` _(CMS-managed)_

## 8. What becomes database-managed

System/structural data managed in the DB (seeded/managed, not free-form CMS content):

- **V1 implicit 'current year' (no year concept)**
  → `academic_year (seed one current year, is_current=true, status='active'); all migrated content scoped to it` _(database-managed)_
- **Cross-year logical unit identity (did not exist in V1)**
  → `org_unit_lineage (one row per logical council/club/hostel/mess/office, reused across years)` _(database-managed)_
- **Content type registry (did not exist in V1)**
  → `content_type_def lookup rows (one per content_type: club_profile, council_profile, hostel_profile, mess_profile, event, announcement, flagship_event, resource, team_page, page_block)` _(database-managed)_
- **V1 auth (none / hardcoded admin)**
  → `app_user + auth_account + verification_token (NextAuth v4 PrismaAdapter, JWT sessions) + role/permission/role_assignment seed (Developer grants_all, Admin)` _(database-managed)_

## 9. What remains static (for now) / is retired

**Static (then migrated later):**

- **/public static assets (PIC photos, club logos, coordinator photos, hostel/mess images, flagship images, ~105 files)**
  → `media_asset (storage_provider='local' initially, original_path='/public/...'); migrated to Cloudinary later (storage_provider='cloudinary', migrated_at set)` _(static (then CMS-managed after Cloudinary migration))_

**Retired (logic replaced, no data table):**

- **V1 routes/pages (/Clubs, /hostels, /messes, /Flagship-events, /Team, /announcements, /past-events, /Contact-Us)**
  → `Next.js App Router pages reading content_item by content_type + current academic_year; no DB table — render layer` _(retired (logic moves to data-driven rendering))_
- **V1 Mongoose models/connection (mongoose dependency)**
  → `none — replaced by Prisma Client over Postgres/Neon` _(retired)_

---

## Full mapping table

| V1 source | V2 target | Disposition |
|---|---|---|
| Mongo 'Event' collection (title, description, date, image, createdAt) | content_item (content_type='event') + content_revision + event_payload (body, event_date, cover_media_id) + media_asset (from image) | CMS-managed |
| Hardcoded React: Councils (4: General, Academic, Cultural, Sports) | org_unit_lineage (one per council) + org_unit (type=council, one per year) + content_item (content_type='council_profile') + content_revision + club_profile_payload | CMS-managed |
| Hardcoded React: Clubs (30) name/logo/instagram/vision/mission | org_unit_lineage (one per club) + org_unit (type=club, parent=council) + content_item (content_type='club_profile') + club_profile_payload (vision, instagram_url, logo) + club_mission_point (mission list) | CMS-managed |
| Hardcoded React: club PIC (faculty), coordinators (students), secretary (student) | person + position (pic/coordinator/secretary) + appointment (per club org_unit per year) | CMS-managed |
| Hardcoded React: Hostels (6) building image, institutional emails/phones | org_unit_lineage + org_unit (type=hostel) + content_item (content_type='hostel_profile') + hostel_profile_payload | CMS-managed |
| Hardcoded React: hostel warden/secretary/caretaker/wellness-warden/attendant | person + position + appointment (per hostel org_unit per year) | CMS-managed |
| Hardcoded React: Messes (5) name/location/capacity/image | org_unit_lineage + org_unit (type=mess) + content_item (content_type='mess_profile') + mess_profile_payload | CMS-managed |
| Hardcoded React: mess meal timings (breakfast/lunch/snacks/dinner ranges) | mess_meal_timing (1 row per meal per mess_profile revision; wraps_midnight for late windows) | CMS-managed |
| Hardcoded React: mess committee (titles + people) | person + position + appointment (title_override for ad-hoc titles like 'AD Mess Management') | CMS-managed |
| Hardcoded React: Team directory (dean, associate deans, wardens, assistant registrar, admin staff, caretakers, council secretaries, website developers) | person + position + appointment (institute-level positions, applies_to_type_id NULL); optional content_item (content_type='team_page')/page_block for layout | CMS-managed |
| Hardcoded React: Flagship events (6: Anhad, Nexus, Convoquer, Pragyaan, Udyamitsav, Pravaah) title/image/description | content_item (content_type='flagship_event') + content_revision + flagship_event_payload | CMS-managed |
| Hardcoded React: Announcements (title/body/date/audience/pinned/windows) | content_item (content_type='announcement', pinned flag) + content_revision + announcement_payload (body, audience, publish_from/until) — OWN payload table, no longer shares event_payload | CMS-managed |
| Hardcoded React: Resources (infrastructure PDFs, Drive links) per org unit | content_item (content_type='resource', org_unit-bound) + resource_payload (resource_kind, file_media_id/external_url) | CMS-managed |
| /public static assets (PIC photos, club logos, coordinator photos, hostel/mess images, flagship images, ~105 files) | media_asset (storage_provider='local' initially, original_path='/public/...'); migrated to Cloudinary later (storage_provider='cloudinary', migrated_at set) | static (then CMS-managed after Cloudinary migration) |
| Hardcoded home-page sections (hero, dean's message, quotes, council heroImages set) | content_item (content_type='page_block') + page_block_payload (block_kind, data jsonb) + content_media (hero image sets, role=hero/hero_primary) | CMS-managed |
| V1 implicit 'current year' (no year concept) | academic_year (seed one current year, is_current=true, status='active'); all migrated content scoped to it | database-managed |
| Cross-year logical unit identity (did not exist in V1) | org_unit_lineage (one row per logical council/club/hostel/mess/office, reused across years) | database-managed |
| Content type registry (did not exist in V1) | content_type_def lookup rows (one per content_type: club_profile, council_profile, hostel_profile, mess_profile, event, announcement, flagship_event, resource, team_page, page_block) | database-managed |
| V1 routes/pages (/Clubs, /hostels, /messes, /Flagship-events, /Team, /announcements, /past-events, /Contact-Us) | Next.js App Router pages reading content_item by content_type + current academic_year; no DB table — render layer | retired (logic moves to data-driven rendering) |
| V1 auth (none / hardcoded admin) | app_user + auth_account + verification_token (NextAuth v4 PrismaAdapter, JWT sessions) + role/permission/role_assignment seed (Developer grants_all, Admin) | database-managed |
| V1 Mongoose models/connection (mongoose dependency) | none — replaced by Prisma Client over Postgres/Neon | retired |

## Migration sequencing & rules

- **Backup first** — done (Session 1, verified). No destructive change precedes a
  verified backup.
- **Org/people/content** → Session 5; **events** (migrate the 3 backed-up docs to
  Postgres, scope to 2025-26) → Session 6; **media (/public → Cloudinary)** →
  Session 7.
- **`queries` collection (1 doc):** review the document; if it is a real enquiry,
  model it as a simple `enquiry`/`contact_message` table (a future module via
  `content_type_def`); if it is test data, archive it in the backup and do not
  migrate. **Decide in Session 6.**
- Every migration is idempotent, dry-run-able, has a rollback, and ships with
  migration tests (see [MIGRATION_PLAN.md](MIGRATION_PLAN.md), [TESTING_STRATEGY.md](TESTING_STRATEGY.md)).
