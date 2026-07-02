# Database Schema Design — V2.0 (PostgreSQL / Prisma / Neon)

> **Authoritative target data model.** Designed in Session 1 via a multi-agent
> workflow: three independent schema proposals (temporal, identity/org,
> content/audit lenses) → synthesized → adversarially verified by four reviewers
> (normalization, feature-coverage, Prisma/Postgres/Neon feasibility,
> extensibility-vs-over-engineering) → finalized with all critical/major issues
> resolved. **No Prisma migrations are written yet** — that is **Session 2**.
> This document is the spec Session 2 implements.
>
> Related: [DATA_MIGRATION_REPORT.md](DATA_MIGRATION_REPORT.md) (V1→V2 mapping) ·
> [DECISION_LOG.md](DECISION_LOG.md) (why) · [DATABASE_DESIGN.md](DATABASE_DESIGN.md) (V1 as-is).

## The core idea — three orthogonal axes

The schema separates **stable identity** from **per-year content**, and applies
three orthogonal axes only to content/structure rows so they compose without
contradiction:

1. **Academic-year scope** — an immutable `academic_year_id` FK on every
   year-varying row ("which year's reality is this?").
2. **Draft/Publish lifecycle** — `content_status` + a live/draft revision pointer
   pair ("which revision is public?").
3. **Version history** — an immutable, append-only `content_revision` chain per
   content item ("what did it look like at each edit?").

**Public visibility rule:** an item is public iff `status='published'` **AND**
`academic_year_id = the current year` (and, for events/announcements, within the
publish window). The data-access layer always filters by the current year, so
next-year published content is structurally hidden until its year becomes current.

Identity rows (`person`, `role`, `position`, `org_unit_type`, `org_unit_lineage`)
are **not** versioned; cross-year continuity comes from `org_unit_lineage`.

## Entity-relationship diagram

```mermaid
erDiagram
    academic_year ||--o{ org_unit : scopes
    academic_year ||--o{ appointment : scopes
    academic_year ||--o{ content_item : scopes
    academic_year ||--o{ role_assignment : scopes
    academic_year ||--o{ audit_log : context
    academic_year ||--o{ transition_run : source_target
    academic_year ||--o| academic_year : transitioned_from
    academic_year ||--o{ org_unit_lineage : first_seen

    app_user ||--o{ auth_account : has
    app_user ||--o{ role_assignment : granted
    app_user ||--o| person : may_link
    app_user ||--o{ audit_log : actor
    app_user ||--o{ media_asset : uploaded
    app_user ||--o{ backup_record : created

    role ||--o{ role_permission : has
    permission ||--o{ role_permission : in
    role ||--o{ role_assignment : assigned
    role_assignment }o--|| app_user : for_user
    role_assignment }o--o| org_unit_lineage : scoped_to

    org_unit_type ||--o{ org_unit : typed_as
    org_unit_type ||--o{ position : applies_to
    org_unit_type ||--o{ org_unit_type_allowed_child : parent
    org_unit_type ||--o{ org_unit_type_allowed_child : child

    org_unit_lineage ||--o{ org_unit : identity
    org_unit ||--o{ org_unit : parent_of
    org_unit ||--o{ appointment : hosts
    org_unit ||--o{ content_item : owns

    position ||--o{ appointment : filled_by
    person ||--o{ appointment : holds
    org_unit_type ||--o{ appointment : type_echo

    content_type_def ||--o{ content_item : defines
    content_item ||--o{ content_revision : has_versions

    content_revision ||--o| club_profile_payload : payload
    content_revision ||--o{ club_mission_point : list
    content_revision ||--o| hostel_profile_payload : payload
    content_revision ||--o| mess_profile_payload : payload
    content_revision ||--o{ mess_meal_timing : list
    content_revision ||--o| event_payload : payload
    content_revision ||--o| announcement_payload : payload
    content_revision ||--o| flagship_event_payload : payload
    content_revision ||--o| resource_payload : payload
    content_revision ||--o| page_block_payload : payload
    content_revision ||--o{ content_media : gallery
    content_revision ||--o| content_revision : restore_of

    media_asset ||--o{ content_media : referenced
    media_asset ||--o{ club_profile_payload : logo_hero
    media_asset ||--o{ hostel_profile_payload : building_pdf
    media_asset ||--o{ mess_profile_payload : image_pdf
    media_asset ||--o{ event_payload : cover
    media_asset ||--o{ announcement_payload : cover
    media_asset ||--o{ flagship_event_payload : image
    media_asset ||--o{ resource_payload : file
    media_asset ||--o{ page_block_payload : primary
    media_asset ||--o{ person : photo
    media_asset ||--o{ org_unit_type : icon
    media_asset ||--o{ app_user : avatar

    academic_year {
        uuid id PK
        text label UK
        date start_date
        date end_date
        academic_year_status status
        boolean is_current
        uuid transitioned_from_year_id FK
    }
    app_user {
        uuid id PK
        citext email UK
        text password_hash
        text display_name
        timestamptz email_verified_at
        uuid avatar_media_id FK
        boolean is_developer
        user_status status
    }
    auth_account {
        uuid id PK
        uuid user_id FK
        text provider
        text provider_account_id
    }
    verification_token {
        text identifier
        text token UK
        timestamptz expires
    }
    role {
        uuid id PK
        text key UK
        text name
        boolean is_system
        boolean grants_all
        entity_status status
    }
    permission {
        uuid id PK
        text key UK
        text module
    }
    role_permission {
        uuid role_id PK_FK
        uuid permission_id PK_FK
    }
    org_unit_lineage {
        uuid lineage_key PK
        text canonical_name
        uuid first_seen_year_id FK
    }
    role_assignment {
        uuid id PK
        uuid user_id FK
        uuid role_id FK
        uuid org_unit_lineage_key FK
        uuid academic_year_id FK
        timestamptz revoked_at
    }
    org_unit_type {
        uuid id PK
        text key UK
        text name
        uuid icon_media_id FK
        entity_status status
    }
    org_unit_type_allowed_child {
        uuid parent_type_id PK_FK
        uuid child_type_id PK_FK
    }
    org_unit {
        uuid id PK
        uuid academic_year_id FK
        uuid org_unit_type_id FK
        uuid parent_id FK
        uuid lineage_key FK
        text slug
        text name
        content_status status
        timestamptz archived_at
    }
    person {
        uuid id PK
        text full_name
        person_type person_type
        citext email
        uuid photo_media_id FK
        uuid app_user_id FK
    }
    position {
        uuid id PK
        text key UK
        text name
        uuid applies_to_type_id FK
        person_type holder_kind
        int max_holders
        boolean is_lead
    }
    appointment {
        uuid id PK
        uuid academic_year_id FK
        uuid org_unit_id FK
        uuid org_unit_type_id FK
        uuid position_id FK
        uuid person_id FK
        text title_override
        content_status status
        timestamptz archived_at
    }
    content_type_def {
        text content_type PK
        text label
        boolean is_year_scoped
        boolean is_org_bound
        text payload_table
    }
    content_item {
        uuid id PK
        text content_type FK
        uuid academic_year_id FK
        uuid org_unit_id FK
        uuid lineage_key
        text slug
        content_status status
        uuid published_revision_id
        uuid draft_revision_id
        boolean pinned
        timestamptz archived_at
    }
    content_revision {
        uuid id PK
        uuid content_item_id FK
        int revision_no
        revision_status revision_status
        text title
        text change_note
        uuid is_restore_of_revision_id FK
        uuid created_by FK
    }
    club_profile_payload {
        uuid revision_id PK_FK
        text vision
        text instagram_url
        uuid logo_media_id FK
        uuid hero_media_id FK
        text detail_drive_url
    }
    club_mission_point {
        uuid id PK
        uuid revision_id FK
        int sort_order
        text text
    }
    hostel_profile_payload {
        uuid revision_id PK_FK
        uuid building_media_id FK
        citext office_email
        text office_phone
        uuid infrastructure_pdf_media_id FK
    }
    mess_profile_payload {
        uuid revision_id PK_FK
        text location
        int capacity
        uuid image_media_id FK
        uuid infrastructure_pdf_media_id FK
    }
    mess_meal_timing {
        uuid id PK
        uuid revision_id FK
        meal_type meal
        time start_time
        time end_time
        boolean wraps_midnight
    }
    event_payload {
        uuid revision_id PK_FK
        text body
        timestamptz event_date
        audience_type audience
        timestamptz publish_from
        timestamptz publish_until
        uuid cover_media_id FK
    }
    announcement_payload {
        uuid revision_id PK_FK
        text body
        audience_type audience
        timestamptz publish_from
        timestamptz publish_until
        uuid cover_media_id FK
    }
    flagship_event_payload {
        uuid revision_id PK_FK
        text description
        uuid image_media_id FK
        text category
    }
    resource_payload {
        uuid revision_id PK_FK
        resource_kind resource_kind
        uuid file_media_id FK
        text external_url
    }
    page_block_payload {
        uuid revision_id PK_FK
        text block_kind
        text body
        jsonb data
        uuid primary_media_id FK
    }
    content_media {
        uuid id PK
        uuid revision_id FK
        uuid media_id FK
        media_role role
        int sort_order
    }
    media_asset {
        uuid id PK
        storage_provider storage_provider
        text cloudinary_public_id
        text url
        text original_path
        media_kind kind
        timestamptz migrated_at
    }
    audit_log {
        bigint id PK
        uuid actor_user_id FK
        audit_action action
        text entity_type
        uuid entity_id
        jsonb before
        jsonb after
        timestamptz created_at
    }
    transition_run {
        uuid id PK
        uuid source_year_id FK
        uuid target_year_id FK
        boolean copy_structure
        boolean copy_content
        transition_status status
        jsonb counts
    }
    backup_record {
        uuid id PK
        text scope
        text format
        text location
        boolean verified
    }
```

## Normalization notes

Target is 3NF throughout; every non-key attribute depends on the whole key and nothing but the key. KEY NORMALIZATION CHOICES: (1) Identity vs per-year content is split so attributes that don't vary by year (person.full_name, role.key, position.key, org_unit_type.key) live in timeless tables, while year-varying facts (appointment, org_unit, content_item) carry academic_year_id. (2) Cross-year unit identity is now a FIRST-CLASS table org_unit_lineage (lineage_key PK); org_unit.lineage_key and role_assignment.org_unit_lineage_key are REAL FKs into it — the prior 'logical FK to a non-unique column' is gone, so security-critical RBAC scope can never dangle. (3) The content body is split into a header (content_item) + immutable revision (content_revision) + per-type 1:1 payload tables. (4) List-valued fields are normalized into child tables: club mission -> club_mission_point; mess meal timings -> mess_meal_timing. (5) The org-unit hierarchy rule is normalized: org_unit_type_allowed_child (parent_type_id, child_type_id) junction with real FKs REPLACES the prior allowed_child_type_ids uuid[] (a 1NF / FK-integrity violation). (6) RBAC is fully decomposed: role, permission, role_permission (M:N), role_assignment. (7) content_type is a text-PK LOOKUP TABLE (content_type_def), not an enum, eliminating the ALTER-TYPE-in-one-migration hazard. JUSTIFIED DENORMALIZATIONS (kept, now DB-GUARDED): (a) appointment.org_unit_id is denormalized for the hot per-unit-per-year roster read; a COMPOSITE FK (org_unit_id, academic_year_id) -> org_unit(id, academic_year_id) guarantees the cached unit and the appointment's year cannot disagree, and org_unit_type_id + a trigger ties position type-compatibility — no more app-only integrity. (b) content_item.published_revision_id / draft_revision_id are PLAIN non-FK cache columns (the prior circular DEFERRABLE FK was REMOVED to kill the single most student-hostile piece of the schema). Their integrity is backed by: partial-unique indexes on content_revision (at most one draft AND at most one published per item) PLUS a trigger asserting each pointer references a same-item revision of the matching status; they are always rebuildable from content_revision via WHERE content_item_id=? AND revision_status=?. (c) org_unit is year-scoped (duplicated per year) rather than identity-row + per-year-profile, to avoid a mandatory join on every structural read; org_unit_lineage provides the cross-year identity. JSONB is deliberately confined to genuinely schemaless / write-once data: page_block_payload.data, audit_log.before/after, transition_run.counts. EAV (content_field_value) and snapshot-only versioning were rejected; every known content shape uses typed columns + FKs. SELF-PROVENANCE CYCLES are blocked by CHECKs: academic_year.transitioned_from_year_id <> id and transition_run.source_year_id <> target_year_id.

## Feature coverage — how each required capability is met

#### 1. Academic Year Engine

- **Tables:** academic_year, transition_run, org_unit, org_unit_lineage, appointment, content_item
- **How it is supported:** academic_year is the temporal spine; org_unit, appointment, content_item all carry academic_year_id (ON DELETE RESTRICT so years are never lost). Exactly-one-current enforced by PARTIAL UNIQUE (is_current) WHERE is_current=true. status='locked' is STRUCTURALLY read-only: a BEFORE INSERT/UPDATE/DELETE lock_guard trigger rejects writes to any row whose resolved academic_year.status='locked' (errata path = unlock-correct-relock or an append-only new revision, never an in-place mutation of locked rows). transition_run records each wizard copy (source/target, options, counts) with CHECK(source<>target); structure is copied as new rows REUSING the org_unit_lineage row; content optionally cloned as new draft revisions. transitioned_from_year_id (CHECK <> id) records provenance. Nothing overwritten.

#### 2. Generic Organization Units

- **Tables:** org_unit_type, org_unit_type_allowed_child, org_unit, org_unit_lineage
- **How it is supported:** org_unit_type (council/club/committee/hostel/mess/office/+future as DATA) + org_unit_type_allowed_child (hierarchy rules as real-FK rows) + org_unit (self-referential parent_id, same-year+allowed-child-type trigger-checked). No table-per-type. Descriptive content decoupled into bound content_items so the structural table stays lean.

#### 3. Dynamic Roles

- **Tables:** role, permission, role_permission, role_assignment, org_unit_lineage, app_user, auth_account
- **How it is supported:** role + permission + role_permission (M:N) as data; role_assignment grants a role to a user scoped optionally by org_unit_lineage_key (REAL FK to org_unit_lineage) and/or academic_year_id (NULL=global), multi-role per user, soft-revoked, with a NULLS-NOT-DISTINCT partial unique blocking duplicate active grants. One account per email via app_user.email citext UNIQUE; auth_account links Google + credentials to one app_user. Developer = seeded grants_all role plus app_user.is_developer fast-path short-circuit.

#### 4. Dynamic Positions

- **Tables:** position, appointment, person, org_unit, org_unit_type
- **How it is supported:** position definitions are DATA tied loosely to org_unit_type via applies_to_type_id, with holder_kind, max_holders, is_lead. appointment historizes person-in-position-per-org_unit-per-year. CARDINALITY is DB-enforced: a partial unique covers singleton positions (max_holders=1, e.g. secretary/PIC) and a deferred constraint trigger counts active appointments against position.max_holders for the multi-holder case (coordinators) — max_holders is no longer decorative. position type-compatibility (a Warden cannot be appointed to a club) is trigger-enforced via appointment.org_unit_type_id vs position.applies_to_type_id.

#### 5. Historical Archives

- **Tables:** academic_year, org_unit, org_unit_lineage, appointment, content_item, content_revision
- **How it is supported:** Every structural/content row carries academic_year_id (RESTRICT, incl. appointment.org_unit_id now RESTRICT not CASCADE — no FK path can erase roster history); org_unit_lineage links the same logical unit across years. Querying year Y = filter by academic_year_id and follow published revisions. Past years locked read-only (trigger); soft-delete (archived_at / status='archived') never removes history; no hard deletes of historized data.

#### 6. Draft/Publish CMS

- **Tables:** content_item, content_revision, event_payload, announcement_payload, org_unit, appointment, academic_year
- **How it is supported:** content_status on content_item plus two cache pointers published_revision_id (live) and draft_revision_id (working). PUBLIC VISIBILITY RULE (now explicit and backed): public = status='published' AND academic_year_id = the resolved CURRENT year AND (for event/announcement) within publish_from/publish_until — the data-access layer always filters by the current academic_year_id, so a next-year published item is structurally hidden until its year becomes current. Admins edit only the draft revision with zero effect on the live revision. Publishing marks the prior published revision 'superseded' and repoints published_revision_id; integrity of both pointers is guarded by partial uniques + a same-item/same-status trigger. org_unit and appointment carry their own status for the same gate.

#### 7. Version History

- **Tables:** content_revision, club_profile_payload, club_mission_point, hostel_profile_payload, mess_profile_payload, mess_meal_timing, event_payload, announcement_payload, flagship_event_payload, resource_payload, page_block_payload, content_media
- **How it is supported:** SCOPED EXPLICITLY TO CMS PAYLOADS. content_revision is immutable append-only, UNIQUE(content_item_id, revision_no), capturing created_by/created_at + change_note. Each revision owns a full snapshot via its 1:1 payload table + normalized list children. View=read a revision; diff=compare two revisions' payload columns; RESTORE=overwrite the existing open draft revision's contents in place (honoring the at-most-one-open-draft partial unique; is_restore_of_revision_id recorded on that reused row), or create a draft if none is open. NOTE (consistency with cap 6): org_unit and appointment PARTICIPATE in draft/publish but are NOT versioned — their structure/roster history is provided solely by per-year rows (lineage across years) + audit_log, with intra-year edits being audit-only (no restore). This asymmetry is accepted and documented; only CMS payload content is restorable.

#### 8. Audit Logs

- **Tables:** audit_log
- **How it is supported:** audit_log is generic (entity_type text + entity_id uuid, no FK) so it covers all present/future tables and survives entity deletion/archival. Captures actor, action enum (incl. publish/transition/grant_role), before/after JSONB, year context, optional ip(inet)/user_agent, append-only (bigint identity PK). Written CENTRALLY through one Prisma client extension/service wrapper so every mutation is audited automatically and uniformly (no per-route scatter). Indexed for entity-timeline and actor-activity; BRIN on created_at for time-range scans.

#### 9. Future Modules

- **Tables:** content_type_def, content_item, content_revision, page_block_payload, org_unit_type, permission, audit_log, media_asset
- **How it is supported:** Adding a module = insert one content_type_def ROW (text PK + payload_table mapping + flags) + create one *_payload table 1:1 with content_revision (+ optional permission rows). There is NO 'ALTER TYPE' anymore (content_type is a lookup table), so module addition is data + one new table in a single ordinary migration — no enum-in-transaction hazard. Core tables (content_item, content_revision, audit_log, media_asset, org_unit) are untouched and immediately grant year-scope, draft/publish, versioning, media, and audit to the new module. org_unit_type lets new org kinds appear as pure data. page_block_payload.data JSONB is the escape hatch for genuinely schemaless presentation content; a small in-code config map routes content_type->payload table (a startup test asserts every content_type_def row has a handler).


## Entity dictionary (33 tables)

### `academic_year`

Temporal spine (capability 1). Every year-scoped structure/content row references exactly one academic_year. Exactly one row is current; past years are status='locked' and write-protected by the lock_guard trigger. The Transition Wizard reads a source year and writes a target year.

**Columns**

```
id : uuid PK default gen_random_uuid()
label : text NOT NULL UNIQUE; CHECK (label ~ '^[0-9]{4}-[0-9]{2}$')
start_date : date NOT NULL
end_date : date NOT NULL; CHECK (end_date > start_date)
status : academic_year_status NOT NULL default 'planning' (planning|active|locked)
is_current : boolean NOT NULL default false
transitioned_from_year_id : uuid NULL; CHECK (transitioned_from_year_id IS NULL OR transitioned_from_year_id <> id)
created_at : timestamptz NOT NULL default now()
updated_at : timestamptz NOT NULL default now()
created_by : uuid NULL
updated_by : uuid NULL
```

**Relationships**

- FK transitioned_from_year_id -> academic_year.id (ON DELETE SET NULL)
- FK created_by -> app_user.id (ON DELETE SET NULL)
- FK updated_by -> app_user.id (ON DELETE SET NULL)

**Indexes / constraints**

- UNIQUE (label)
- PARTIAL UNIQUE (is_current) WHERE is_current = true -- exactly one current year
- INDEX (status)
- INDEX (transitioned_from_year_id)

### `app_user`

One account per email (capability 3). Google OAuth and email/password both resolve here via auth_account. Holds the Developer super-role fast-path flag. Mapped to the NextAuth Adapter User shape via Prisma @map (emailVerified, image). Named app_user to avoid the reserved word 'user'. Session strategy is JWT (no DB session table) — see decision records.

**Columns**

```
id : uuid PK default gen_random_uuid()
email : citext NOT NULL UNIQUE (case-insensitive single-account guarantee; adapter User.email)
email_verified_at : timestamptz NULL (Prisma field emailVerified @map("email_verified_at"))
password_hash : text NULL (argon2id; NULL when OAuth-only)
display_name : text NOT NULL (Prisma field name @map("display_name"))
avatar_media_id : uuid NULL (adapter User.image resolved from media_asset; Prisma image relation)
is_developer : boolean NOT NULL default false (super-role short-circuit; also granted via Developer role)
status : user_status NOT NULL default 'active' (active|suspended|invited|disabled)
last_login_at : timestamptz NULL
created_at : timestamptz NOT NULL default now()
updated_at : timestamptz NOT NULL default now()
```

**Relationships**

- FK avatar_media_id -> media_asset.id (ON DELETE SET NULL)
- Back-relations to AppUser are enumerated up front (see prismaNotes) — every inbound *_by FK declares an explicit @relation name.

**Indexes / constraints**

- UNIQUE (email)
- INDEX (status)
- INDEX (is_developer) WHERE is_developer = true

### `auth_account`

NextAuth v4 PrismaAdapter Account table: external OAuth identities (google) and credentials map to one app_user, enforcing one-account-per-email account linking. Prisma fields use adapter-canonical names (userId, providerAccountId) with @map to snake_case columns.

**Columns**

```
id : uuid PK default gen_random_uuid()
user_id : uuid NOT NULL (Prisma userId @map)
type : text NOT NULL ('oauth'|'credentials'|'oidc')
provider : text NOT NULL ('google'|'credentials')
provider_account_id : text NOT NULL (Prisma providerAccountId @map)
refresh_token : text NULL
access_token : text NULL
expires_at : bigint NULL (Prisma Int/BigInt @db.BigInt)
token_type : text NULL
scope : text NULL
id_token : text NULL
session_state : text NULL
created_at : timestamptz NOT NULL default now()
```

**Relationships**

- FK user_id -> app_user.id (ON DELETE CASCADE)

**Indexes / constraints**

- UNIQUE (provider, provider_account_id)
- INDEX (user_id)

### `verification_token`

REQUIRED by the NextAuth v4 PrismaAdapter contract (createVerificationToken/useVerificationToken). Backs email verification and magic-link flows even though session strategy is JWT. Adopts the canonical adapter model shape verbatim.

**Columns**

```
identifier : text NOT NULL
token : text NOT NULL
expires : timestamptz NOT NULL
```

**Indexes / constraints**

- UNIQUE (identifier, token) -- adapter @@unique([identifier, token])
- UNIQUE (token)

### `role`

Dynamic role as DATA (capability 3). Bundles permissions via role_permission. 'Developer'/'Admin' are seeded is_system rows. grants_all short-circuits permission checks for Developer.

**Columns**

```
id : uuid PK
key : text NOT NULL UNIQUE (machine key e.g. 'developer','council_admin','club_editor')
name : text NOT NULL
description : text NULL
is_system : boolean NOT NULL default false (undeletable built-ins)
grants_all : boolean NOT NULL default false (Developer super-role)
status : entity_status NOT NULL default 'active' (active|archived)
created_at : timestamptz NOT NULL default now()
updated_at : timestamptz NOT NULL default now()
created_by : uuid NULL
updated_by : uuid NULL
```

**Relationships**

- FK created_by -> app_user.id (ON DELETE SET NULL)
- FK updated_by -> app_user.id (ON DELETE SET NULL)

**Indexes / constraints**

- UNIQUE (key)
- INDEX (status)

### `permission`

Atomic capability catalog as DATA (capability 3). Dotted verb.resource grain (e.g. 'content.publish','org_unit.update','year.transition'). Future modules register permissions without touching RBAC core.

**Columns**

```
id : uuid PK
key : text NOT NULL UNIQUE (e.g. 'content.publish')
label : text NOT NULL
description : text NULL
module : text NULL (UI grouping, e.g. 'org','cms','users')
created_at : timestamptz NOT NULL default now()
```

**Indexes / constraints**

- UNIQUE (key)
- INDEX (module)

### `role_permission`

M:N junction role<->permission. Defines what each role can do; editable as data.

**Columns**

```
role_id : uuid NOT NULL
permission_id : uuid NOT NULL
PRIMARY KEY (role_id, permission_id)
```

**Relationships**

- FK role_id -> role.id (ON DELETE CASCADE)
- FK permission_id -> permission.id (ON DELETE CASCADE)

**Indexes / constraints**

- PK (role_id, permission_id)
- INDEX (permission_id) -- reverse lookup 'who has permission X'

### `org_unit_lineage`

FIRST-CLASS cross-year identity for a logical org unit (the same Coding Club across all years). Owns the lineage identity so org_unit.lineage_key and role_assignment.org_unit_lineage_key are REAL enforceable FKs (security-critical scope must not rely on app-layer integrity). One row per logical unit; the Transition Wizard reuses an existing lineage row rather than copying a bare uuid.

**Columns**

```
lineage_key : uuid PK default gen_random_uuid()
canonical_name : text NULL (latest/display name across years; informational)
first_seen_year_id : uuid NULL (the year this logical unit first appeared)
created_at : timestamptz NOT NULL default now()
created_by : uuid NULL
```

**Relationships**

- FK first_seen_year_id -> academic_year.id (ON DELETE SET NULL)
- FK created_by -> app_user.id (ON DELETE SET NULL)

**Indexes / constraints**

- PK (lineage_key)
- INDEX (first_seen_year_id)

### `role_assignment`

Grants a role to a user, OPTIONALLY scoped to an org_unit_lineage and/or academic_year (capabilities 3,5). NULL scope = global. Multiple rows per user = multiple roles. Soft-revoked (revoked_at) so past grants persist. Scope key is now a REAL FK to org_unit_lineage (ON DELETE RESTRICT), so a unit-scoped grant can never dangle.

**Columns**

```
id : uuid PK
user_id : uuid NOT NULL
role_id : uuid NOT NULL
org_unit_lineage_key : uuid NULL (scope to a logical unit across years; NULL = all units)
academic_year_id : uuid NULL (scope to a year; NULL = all years / standing role)
granted_at : timestamptz NOT NULL default now()
granted_by : uuid NULL
revoked_at : timestamptz NULL (soft-revoke)
revoked_by : uuid NULL
```

**Relationships**

- FK user_id -> app_user.id (ON DELETE CASCADE)
- FK role_id -> role.id (ON DELETE RESTRICT)
- FK org_unit_lineage_key -> org_unit_lineage.lineage_key (ON DELETE RESTRICT)
- FK academic_year_id -> academic_year.id (ON DELETE RESTRICT)
- FK granted_by -> app_user.id (ON DELETE SET NULL)
- FK revoked_by -> app_user.id (ON DELETE SET NULL)

**Indexes / constraints**

- INDEX (user_id) WHERE revoked_at IS NULL -- hot path: effective roles on session load
- INDEX (org_unit_lineage_key)
- INDEX (academic_year_id)
- INDEX (role_id)
- UNIQUE (user_id, role_id, org_unit_lineage_key, academic_year_id) NULLS NOT DISTINCT WHERE revoked_at IS NULL -- no duplicate active grant; requires Neon PG>=15; raw-SQL partial index (invisible to Prisma)

### `org_unit_type`

The KINDS of org units as DATA (capabilities 2,9): council, club, committee, hostel, mess, office, plus future unknown types. Avoids a table-per-type. Hierarchy rules are normalized into org_unit_type_allowed_child (real FKs), not an array column.

**Columns**

```
id : uuid PK
key : text NOT NULL UNIQUE (e.g. 'council','club','hostel','mess','committee','office')
name : text NOT NULL
description : text NULL
icon_media_id : uuid NULL
sort_order : int NOT NULL default 0
is_system : boolean NOT NULL default false
status : entity_status NOT NULL default 'active'
created_at : timestamptz NOT NULL default now()
updated_at : timestamptz NOT NULL default now()
```

**Relationships**

- FK icon_media_id -> media_asset.id (ON DELETE SET NULL)

**Indexes / constraints**

- UNIQUE (key)
- INDEX (status)

### `org_unit_type_allowed_child`

Junction normalizing the org-unit hierarchy rule (e.g. council MAY contain club) into rows with REAL FKs and referential integrity — replaces the prior org_unit_type.allowed_child_type_ids uuid[] (a 1NF / FK-integrity violation). Matches the normalization pattern used elsewhere.

**Columns**

```
parent_type_id : uuid NOT NULL
child_type_id : uuid NOT NULL
PRIMARY KEY (parent_type_id, child_type_id)
```

**Relationships**

- FK parent_type_id -> org_unit_type.id (ON DELETE CASCADE)
- FK child_type_id -> org_unit_type.id (ON DELETE RESTRICT)

**Indexes / constraints**

- PK (parent_type_id, child_type_id)
- INDEX (child_type_id)

### `org_unit`

Generic, self-referential, YEAR-SCOPED structural org node (capabilities 2,5): a specific Council/Club/Hostel/Mess/Office in a specific year. Hierarchy via parent_id (same year). lineage_key is a REAL FK to org_unit_lineage giving stable identity across years (reused, not copied, by the wizard). Lean structural skeleton: editable descriptive content (vision/mission/logo) lives in a bound content_item, NOT here. Structural fields (name/slug/parent) are intra-year mutable with audit-only history (NOT versioned — see capability 7 scope).

**Columns**

```
id : uuid PK
academic_year_id : uuid NOT NULL
org_unit_type_id : uuid NOT NULL
parent_id : uuid NULL (self-ref hierarchy; same-year + allowed-child-type enforced by trigger)
lineage_key : uuid NOT NULL (REAL FK to org_unit_lineage)
slug : text NOT NULL (URL key within year, e.g. 'coding-club')
name : text NOT NULL
sort_order : int NOT NULL default 0
status : content_status NOT NULL default 'draft' (units participate in draft/publish gate)
archived_at : timestamptz NULL (soft-delete)
created_at : timestamptz NOT NULL default now()
updated_at : timestamptz NOT NULL default now()
created_by : uuid NULL
updated_by : uuid NULL
```

**Relationships**

- FK academic_year_id -> academic_year.id (ON DELETE RESTRICT)
- FK org_unit_type_id -> org_unit_type.id (ON DELETE RESTRICT)
- FK parent_id -> org_unit.id (ON DELETE RESTRICT)
- FK lineage_key -> org_unit_lineage.lineage_key (ON DELETE RESTRICT)
- FK created_by -> app_user.id (ON DELETE SET NULL)
- FK updated_by -> app_user.id (ON DELETE SET NULL)

**Indexes / constraints**

- UNIQUE (id, academic_year_id) -- composite target enabling appointment's year-agreement composite FK
- UNIQUE (academic_year_id, slug)
- UNIQUE (academic_year_id, lineage_key) -- one instance of a logical unit per year
- INDEX (academic_year_id, org_unit_type_id)
- INDEX (parent_id)
- INDEX (lineage_key) -- follow a unit across years
- INDEX (academic_year_id, status) WHERE archived_at IS NULL

### `person`

Directory of humans referenced by appointments/content: faculty (Dean, Associate Deans, PICs, Wardens), students (secretaries, coordinators), staff (caretakers, sports officer, assistant registrar), website developers. Year-agnostic stable identity; their per-year role is an appointment. Optionally linked to an app_user login (most people never log in). When app_user_id is set, person.email must equal app_user.email (trigger-enforced) to prevent identity drift.

**Columns**

```
id : uuid PK
full_name : text NOT NULL
person_type : person_type NOT NULL (faculty|student|staff|external)
email : citext NULL
phone : text NULL
profile_url : text NULL (faculty profile / external)
photo_media_id : uuid NULL
app_user_id : uuid NULL (optional link to login account)
archived_at : timestamptz NULL
created_at : timestamptz NOT NULL default now()
updated_at : timestamptz NOT NULL default now()
created_by : uuid NULL
updated_by : uuid NULL
```

**Relationships**

- FK photo_media_id -> media_asset.id (ON DELETE SET NULL)
- FK app_user_id -> app_user.id (ON DELETE SET NULL)
- FK created_by -> app_user.id (ON DELETE SET NULL)
- FK updated_by -> app_user.id (ON DELETE SET NULL)

**Indexes / constraints**

- INDEX (person_type)
- INDEX (app_user_id)
- INDEX (lower(full_name)) -- directory search (raw-SQL expression index)
- UNIQUE (email) WHERE email IS NOT NULL

### `position`

Dynamic position DEFINITIONS as DATA (capability 4): Coordinator, Co-Coordinator, Secretary, PIC, Warden, Caretaker, Wellness Warden, Attendant, Dean, etc. Year-agnostic concept tied loosely to an org_unit_type (a 'Warden' applies to every hostel). max_holders cardinality is enforced by a deferred constraint trigger on appointment (singleton case also has a partial unique). Table name 'position' is quoted in raw SQL; @@map("position") in Prisma.

**Columns**

```
id : uuid PK
key : text NOT NULL UNIQUE (e.g. 'coordinator','secretary','pic','warden','caretaker')
name : text NOT NULL
applies_to_type_id : uuid NULL (position valid for this org_unit_type; NULL = institute-level like Dean)
holder_kind : person_type NULL (expected occupant type; soft hint)
max_holders : int NULL; CHECK (max_holders IS NULL OR max_holders >= 1) (NULL = unlimited)
rank : int NOT NULL default 0 (seniority / display order)
is_lead : boolean NOT NULL default false (Secretary/Coordinator = unit lead)
status : entity_status NOT NULL default 'active'
created_at : timestamptz NOT NULL default now()
updated_at : timestamptz NOT NULL default now()
```

**Relationships**

- FK applies_to_type_id -> org_unit_type.id (ON DELETE RESTRICT)

**Indexes / constraints**

- UNIQUE (key)
- INDEX (applies_to_type_id)
- INDEX (status)

### `appointment`

Historization core (capabilities 4,5): person P holds position X in org_unit U during academic_year Y. Covers multiple coordinators per club, secretary, PIC, warden/caretaker/wellness-warden/attendant per hostel, mess committee titles (title_override), and the team directory. Never overwritten; each year is a new row. Intra-year edits are audit-only history (NOT versioned). org_unit_id denormalization is now DB-guarded: a composite FK ties (org_unit_id, academic_year_id) to org_unit(id, academic_year_id) so year cannot drift; position/type compatibility is trigger-enforced via org_unit_type_id.

**Columns**

```
id : uuid PK
academic_year_id : uuid NOT NULL
org_unit_id : uuid NOT NULL (denormalized for hot per-unit roster reads; DB-guarded by composite FK below)
org_unit_type_id : uuid NULL (echoed for position-type compatibility trigger)
position_id : uuid NOT NULL
person_id : uuid NOT NULL
title_override : text NULL (free-text refinement, e.g. 'Co-Coordinator','AD Mess Management')
status : content_status NOT NULL default 'draft' (roster can be drafted before publish)
published_at : timestamptz NULL
sort_order : int NOT NULL default 0
start_date : date NULL
end_date : date NULL
archived_at : timestamptz NULL
created_at : timestamptz NOT NULL default now()
updated_at : timestamptz NOT NULL default now()
created_by : uuid NULL
updated_by : uuid NULL
```

**Relationships**

- FK academic_year_id -> academic_year.id (ON DELETE RESTRICT)
- FK (org_unit_id, academic_year_id) -> org_unit (id, academic_year_id) (ON DELETE RESTRICT) -- composite FK guarantees year agreement; changed from CASCADE to honor no-orphan-history policy
- FK position_id -> position.id (ON DELETE RESTRICT)
- FK person_id -> person.id (ON DELETE RESTRICT)
- FK org_unit_type_id -> org_unit_type.id (ON DELETE RESTRICT)
- FK created_by -> app_user.id (ON DELETE SET NULL)
- FK updated_by -> app_user.id (ON DELETE SET NULL)

**Indexes / constraints**

- INDEX (org_unit_id, academic_year_id, status) -- hot public roster path
- INDEX (person_id, academic_year_id) -- 'what did this person hold this year'
- INDEX (position_id)
- INDEX (academic_year_id)
- UNIQUE (academic_year_id, org_unit_id, position_id, person_id) WHERE archived_at IS NULL -- no duplicate active appointment
- PARTIAL UNIQUE (academic_year_id, org_unit_id, position_id) WHERE archived_at IS NULL AND status <> 'archived' AND <position.max_holders=1 sentinel> -- singleton positions (secretary/PIC) enforced at DB level; non-singleton max_holders enforced by deferred count trigger

### `content_type_def`

LOOKUP TABLE (text PK) for content types (capability 9) — replaces the prior Postgres enum so module addition is pure DATA + a new payload table, with NO ALTER TYPE (which cannot add-and-use a value in one migration). content_item.content_type FKs here. Stores per-type metadata flags. field_schema/generic-editor abstraction was DROPPED; payload routing keys off the text discriminator via a small in-code config map (a startup test asserts every content_type has a handler).

**Columns**

```
content_type : text PK (e.g. 'club_profile','event','announcement')
label : text NOT NULL
is_year_scoped : boolean NOT NULL default true
supports_publish : boolean NOT NULL default true
is_org_bound : boolean NOT NULL default false (true => content_item must reference an org_unit)
payload_table : text NOT NULL (explicit discriminator->table mapping, e.g. 'event_payload')
status : entity_status NOT NULL default 'active'
created_at : timestamptz NOT NULL default now()
updated_at : timestamptz NOT NULL default now()
```

**Indexes / constraints**

- PK (content_type)
- INDEX (status)

### `content_item`

THE CONTENT SPINE — header (capabilities 1,5,6,7,9). One row per logical CMS document of any content_type. Holds year scope, optional org binding, lifecycle status, and TWO plain non-FK cache columns pointing at the live published and working draft revisions. The circular deferrable FK was REMOVED for maintainability; pointers are a denormalized cache rebuildable from content_revision, guarded by partial-unique indexes on content_revision (one draft, one published per item) plus a trigger asserting each pointer references a same-item revision of the matching status. lineage_key gives cross-year continuity. Public visibility = status='published' AND academic_year_id = current year (event windows for events).

**Columns**

```
id : uuid PK
content_type : text NOT NULL
academic_year_id : uuid NULL (NOT NULL unless content_type_def.is_year_scoped=false; trigger-enforced)
org_unit_id : uuid NULL (owning unit; NULL for institute-wide content)
lineage_key : uuid NOT NULL (stable cross-year identity for the document)
slug : text NULL (public URL key within type+year)
status : content_status NOT NULL default 'draft' (draft|review|published|archived)
published_revision_id : uuid NULL (PLAIN cache column, NOT an FK; the LIVE public revision)
draft_revision_id : uuid NULL (PLAIN cache column, NOT an FK; working copy admins edit)
published_at : timestamptz NULL
published_by : uuid NULL
pinned : boolean NOT NULL default false (announcements)
archived_at : timestamptz NULL (soft-delete; never hard-deleted)
created_at : timestamptz NOT NULL default now()
updated_at : timestamptz NOT NULL default now()
created_by : uuid NULL
updated_by : uuid NULL
```

**Relationships**

- FK content_type -> content_type_def.content_type (ON DELETE RESTRICT)
- FK academic_year_id -> academic_year.id (ON DELETE RESTRICT)
- FK org_unit_id -> org_unit.id (ON DELETE SET NULL)
- FK published_by -> app_user.id (ON DELETE SET NULL)
- FK created_by -> app_user.id (ON DELETE SET NULL)
- FK updated_by -> app_user.id (ON DELETE SET NULL)
- NOTE: published_revision_id / draft_revision_id are intentionally NOT FKs (no circular FK, no deferrable migration). A trigger asserts each references a content_revision whose content_item_id = this id and whose revision_status matches (published/draft). Rebuildable from content_revision.

**Indexes / constraints**

- UNIQUE (content_type, academic_year_id, slug) NULLS NOT DISTINCT WHERE slug IS NOT NULL -- NULLS NOT DISTINCT closes the academic_year_id IS NULL slug-collision hole (Neon PG>=15)
- UNIQUE (content_type, academic_year_id, lineage_key) -- one item per logical doc per year
- INDEX (content_type, academic_year_id, status) WHERE archived_at IS NULL -- public listing hot path; current-year filter applied in data-access layer
- INDEX (org_unit_id)
- INDEX (lineage_key)
- INDEX (published_revision_id)
- INDEX (draft_revision_id)
- INDEX (pinned) WHERE pinned = true

### `content_revision`

THE CONTENT SPINE — immutable versioned body (capabilities 6,7). Every edit appends a new revision (monotonic revision_no per item) capturing who/when + change_note. Typed *_payload tables reference revision_id 1:1. Publishing marks the prior published revision 'superseded' and points content_item.published_revision_id here. RESTORE semantics: restore OVERWRITES the contents of the existing open draft revision (and its payload/list children) in place rather than inserting a second draft row — honoring the at-most-one-open-draft partial unique; is_restore_of_revision_id is set on that reused draft row. If no open draft exists, one draft row is created. UNIQUE(id, content_item_id) provides the composite target used by the content_item pointer-integrity trigger.

**Columns**

```
id : uuid PK
content_item_id : uuid NOT NULL
revision_no : int NOT NULL (1,2,3... per item)
revision_status : revision_status NOT NULL default 'draft' (draft|review|published|superseded)
title : text NOT NULL (shared field across all content types)
summary : text NULL
change_note : text NULL (author's note for this version)
is_restore_of_revision_id : uuid NULL (provenance when created/overwritten via restore)
created_at : timestamptz NOT NULL default now()
created_by : uuid NULL (the who)
```

**Relationships**

- FK content_item_id -> content_item.id (ON DELETE CASCADE)
- FK is_restore_of_revision_id -> content_revision.id (ON DELETE SET NULL)
- FK created_by -> app_user.id (ON DELETE SET NULL)

**Indexes / constraints**

- UNIQUE (content_item_id, revision_no)
- UNIQUE (id, content_item_id) -- composite target for content_item pointer-integrity trigger / same-item guarantee
- PARTIAL UNIQUE (content_item_id) WHERE revision_status = 'draft' -- at most one open draft, matches draft_revision_id
- PARTIAL UNIQUE (content_item_id) WHERE revision_status = 'published' -- at most one live published revision, symmetric guard for published_revision_id
- INDEX (content_item_id, created_at DESC) -- version timeline
- INDEX (content_item_id, revision_status) -- derive published/draft without the cache if needed
- INDEX (revision_status)

### `club_profile_payload`

Typed payload for content_type='club_profile' and 'council_profile' (the 4 councils + 30 clubs). 1:1 with a content_revision so it is versioned + year-scoped via the spine. vision is text; mission is a LIST normalized into club_mission_point (3NF, not a JSON array). The club/council org_unit and its PIC/coordinators/secretary are referenced via the parent item's org_unit + appointments, not duplicated here.

**Columns**

```
revision_id : uuid PK (1:1 with content_revision)
vision : text NULL
instagram_url : text NULL
logo_media_id : uuid NULL
hero_media_id : uuid NULL
detail_drive_url : text NULL ('View in Detail' Google Drive link)
```

**Relationships**

- FK revision_id -> content_revision.id (ON DELETE CASCADE)
- FK logo_media_id -> media_asset.id (ON DELETE SET NULL)
- FK hero_media_id -> media_asset.id (ON DELETE SET NULL)

**Indexes / constraints**

- PK (revision_id)
- INDEX (logo_media_id)
- INDEX (hero_media_id)

### `club_mission_point`

Normalizes the club mission LIST (V1 mission string[]) into ordered rows attached to a club_profile_payload revision. Keeps 3NF and enables per-point editing/versioning. Reusable pattern for any list-valued field.

**Columns**

```
id : uuid PK
revision_id : uuid NOT NULL (the club_profile revision)
sort_order : int NOT NULL default 0
text : text NOT NULL
```

**Relationships**

- FK revision_id -> content_revision.id (ON DELETE CASCADE)

**Indexes / constraints**

- INDEX (revision_id, sort_order)

### `hostel_profile_payload`

Typed payload for content_type='hostel_profile' (6 hostels). Building image, institutional emails/phones, infrastructure PDF, detail link. People (warden/secretary/caretaker/wellness-warden/attendant) are APPOINTMENTS on the hostel org_unit, not columns here.

**Columns**

```
revision_id : uuid PK (1:1)
building_media_id : uuid NULL
office_email : citext NULL
office_phone : text NULL
infrastructure_pdf_media_id : uuid NULL
detail_drive_url : text NULL
```

**Relationships**

- FK revision_id -> content_revision.id (ON DELETE CASCADE)
- FK building_media_id -> media_asset.id (ON DELETE SET NULL)
- FK infrastructure_pdf_media_id -> media_asset.id (ON DELETE SET NULL)

**Indexes / constraints**

- PK (revision_id)
- INDEX (building_media_id)
- INDEX (infrastructure_pdf_media_id)

### `mess_profile_payload`

Typed payload for content_type='mess_profile' (5 messes). Scalar attributes (location, capacity, image). Meal timings normalized into mess_meal_timing; mess committee = appointments on the mess org_unit.

**Columns**

```
revision_id : uuid PK (1:1)
location : text NULL
capacity : int NULL CHECK (capacity IS NULL OR capacity >= 0)
image_media_id : uuid NULL
infrastructure_pdf_media_id : uuid NULL
detail_drive_url : text NULL
```

**Relationships**

- FK revision_id -> content_revision.id (ON DELETE CASCADE)
- FK image_media_id -> media_asset.id (ON DELETE SET NULL)
- FK infrastructure_pdf_media_id -> media_asset.id (ON DELETE SET NULL)

**Indexes / constraints**

- PK (revision_id)
- INDEX (image_media_id)
- INDEX (infrastructure_pdf_media_id)

### `mess_meal_timing`

Normalizes meal timings (breakfast/lunch/snacks/dinner with time ranges) per mess_profile revision. Native time columns for validation/sorting. wraps_midnight flag handles late-night windows that would otherwise violate end_time > start_time.

**Columns**

```
id : uuid PK
revision_id : uuid NOT NULL
meal : meal_type NOT NULL (breakfast|lunch|snacks|dinner)
start_time : time NOT NULL
end_time : time NOT NULL
wraps_midnight : boolean NOT NULL default false
CHECK (wraps_midnight OR end_time > start_time) -- allow cross-midnight windows when flagged
sort_order : int NOT NULL default 0
```

**Relationships**

- FK revision_id -> content_revision.id (ON DELETE CASCADE)

**Indexes / constraints**

- INDEX (revision_id, sort_order)
- UNIQUE (revision_id, meal)

### `event_payload`

Typed payload for content_type='event' ONLY (announcement now has its own table — see announcement_payload). Date-bound with audience, publish/expire windows, rich body. Migrates the V1 Mongo Event collection. Public event visibility additionally honors publish_from/publish_until.

**Columns**

```
revision_id : uuid PK (1:1)
body : text NULL (rich text / markdown)
event_date : timestamptz NULL
location : text NULL
audience : audience_type NOT NULL default 'public' (public|students|faculty|staff|internal)
publish_from : timestamptz NULL (visibility window start)
publish_until : timestamptz NULL CHECK (publish_until IS NULL OR publish_from IS NULL OR publish_until > publish_from)
cover_media_id : uuid NULL
```

**Relationships**

- FK revision_id -> content_revision.id (ON DELETE CASCADE)
- FK cover_media_id -> media_asset.id (ON DELETE SET NULL)

**Indexes / constraints**

- PK (revision_id)
- INDEX (event_date)
- INDEX (cover_media_id)

### `announcement_payload`

Typed payload for content_type='announcement' — given its OWN table (no longer sharing event_payload) to honor the one-shape-one-table principle and avoid the latent divergence trap of two discriminators sharing a table. Announcement pinning lives on content_item.pinned; body + audience + visibility window here.

**Columns**

```
revision_id : uuid PK (1:1)
body : text NOT NULL (rich text / markdown)
audience : audience_type NOT NULL default 'public'
publish_from : timestamptz NULL
publish_until : timestamptz NULL CHECK (publish_until IS NULL OR publish_from IS NULL OR publish_until > publish_from)
cover_media_id : uuid NULL
```

**Relationships**

- FK revision_id -> content_revision.id (ON DELETE CASCADE)
- FK cover_media_id -> media_asset.id (ON DELETE SET NULL)

**Indexes / constraints**

- PK (revision_id)
- INDEX (cover_media_id)

### `flagship_event_payload`

Typed payload for content_type='flagship_event' (6 recurring fests: Anhad, Nexus, Convoquer, Pragyaan, Udyamitsav, Pravaah). NOT date-bound — distinct shape from event_payload justifies a separate table.

**Columns**

```
revision_id : uuid PK (1:1)
description : text NULL
image_media_id : uuid NULL
category : text NULL ('techno-cultural','technical','sports','academic','entrepreneurship')
```

**Relationships**

- FK revision_id -> content_revision.id (ON DELETE CASCADE)
- FK image_media_id -> media_asset.id (ON DELETE SET NULL)

**Indexes / constraints**

- PK (revision_id)
- INDEX (image_media_id)

### `resource_payload`

Typed payload for content_type='resource' (PDFs/links e.g. infrastructure PDFs, Google Drive links) tied to an org_unit + year via the spine. Either a media file or an external link.

**Columns**

```
revision_id : uuid PK (1:1)
resource_kind : resource_kind NOT NULL (pdf|link|drive|file)
file_media_id : uuid NULL
external_url : text NULL
description : text NULL
```

**Relationships**

- FK revision_id -> content_revision.id (ON DELETE CASCADE)
- FK file_media_id -> media_asset.id (ON DELETE SET NULL)

**Indexes / constraints**

- PK (revision_id)
- INDEX (file_media_id)

### `page_block_payload`

Capability 9 escape hatch. Typed payload for content_type='page_block'/'team_page'/home-page sections (hero, dean's message, quotes). The ONLY sanctioned JSONB content store (data) for genuinely open-ended, admin-defined presentation blocks; everything with a known shape gets a dedicated payload table.

**Columns**

```
revision_id : uuid PK (1:1)
block_kind : text NOT NULL (e.g. 'hero','dean_message','quote','section')
body : text NULL
data : jsonb NULL (schemaless extras for genuinely open-ended blocks)
primary_media_id : uuid NULL
```

**Relationships**

- FK revision_id -> content_revision.id (ON DELETE CASCADE)
- FK primary_media_id -> media_asset.id (ON DELETE SET NULL)

**Indexes / constraints**

- PK (revision_id)
- INDEX (primary_media_id)
- INDEX USING gin (data) jsonb_path_ops -- raw-SQL GIN index

### `content_media`

M:N junction attaching multiple media assets to a content_revision with a role + order (galleries, hero image sets like the 4 council heroImages). role is a media_role enum (not free text) so the unique constraint is meaningful and typos cannot create phantom roles. A single-primary-hero rule is enforced by a partial unique per (revision_id) where role='hero_primary'.

**Columns**

```
id : uuid PK
revision_id : uuid NOT NULL
media_id : uuid NOT NULL
role : media_role NOT NULL default 'gallery' (gallery|hero|hero_primary|attachment)
sort_order : int NOT NULL default 0
alt_text_override : text NULL
```

**Relationships**

- FK revision_id -> content_revision.id (ON DELETE CASCADE)
- FK media_id -> media_asset.id (ON DELETE RESTRICT)

**Indexes / constraints**

- INDEX (revision_id, role, sort_order)
- INDEX (media_id)
- UNIQUE (revision_id, media_id, role)
- PARTIAL UNIQUE (revision_id) WHERE role = 'hero_primary' -- at most one primary hero per revision

### `media_asset`

Tracked uploads (Cloudinary + legacy /public). Year-agnostic, reusable. original_path preserves the legacy /public path for the later /public -> Cloudinary migration; cloudinary fields fill in after. Referenced by people photos, org/club logos, payload media, galleries, and app_user avatars.

**Columns**

```
id : uuid PK
storage_provider : storage_provider NOT NULL default 'cloudinary' (cloudinary|local|external)
cloudinary_public_id : text NULL
url : text NOT NULL (resolved delivery URL)
original_path : text NULL (legacy /public path pre-migration, e.g. '/coding coordinator.jpg')
mime_type : text NULL
kind : media_kind NOT NULL default 'image' (image|pdf|svg|gif)
width : int NULL
height : int NULL
bytes : bigint NULL
alt_text : text NULL
checksum : text NULL (dedupe)
uploaded_by : uuid NULL
migrated_at : timestamptz NULL (set when /public -> Cloudinary done)
archived_at : timestamptz NULL
created_at : timestamptz NOT NULL default now()
```

**Relationships**

- FK uploaded_by -> app_user.id (ON DELETE SET NULL)

**Indexes / constraints**

- INDEX (storage_provider)
- INDEX (uploaded_by)
- UNIQUE (cloudinary_public_id) WHERE cloudinary_public_id IS NOT NULL
- INDEX (original_path) -- migration lookup/dedupe
- INDEX (checksum)

### `audit_log`

Capability 8 — append-only audit of every create/update/delete/publish/transition/role-grant. Generic (entity_type text + entity_id uuid, no FK) so it covers ALL current and future tables with no schema change AND survives entity deletion/archival. Written centrally via ONE Prisma client extension/service wrapper (not scattered per-route) so coverage is uniform and automatic for new modules. before/after JSONB snapshots; never updated/deleted.

**Columns**

```
id : bigint PK GENERATED ALWAYS AS IDENTITY (monotonic, high-volume)
actor_user_id : uuid NULL (NULL for system/cron actions)
action : audit_action NOT NULL (create|update|delete|publish|unpublish|archive|restore|login|transition|grant_role|revoke_role)
entity_type : text NOT NULL (model name, e.g. 'content_item','org_unit')
entity_id : uuid NULL (PK of affected row; NULL for bulk/login)
academic_year_id : uuid NULL (scope context)
before : jsonb NULL (prior state snapshot)
after : jsonb NULL (new state snapshot)
summary : text NULL (human-readable)
ip_address : inet NULL
user_agent : text NULL
created_at : timestamptz NOT NULL default now()
```

**Relationships**

- FK actor_user_id -> app_user.id (ON DELETE SET NULL)
- FK academic_year_id -> academic_year.id (ON DELETE SET NULL)
- polymorphic (entity_type, entity_id) intentionally has NO FK so logs survive entity deletion/archival

**Indexes / constraints**

- INDEX (entity_type, entity_id, created_at DESC) -- entity timeline
- INDEX (actor_user_id, created_at DESC) -- actor activity
- INDEX (action)
- BRIN (created_at) -- cheap time-range scans on append-only log
- INDEX USING gin (after) jsonb_path_ops

### `transition_run`

Capability 1 — records each Transition Wizard execution that copies a source year's STRUCTURE (org_units reusing their lineage rows, appointments) forward and optionally clones content_items into the target year (new lineage-preserving rows). Auditable, idempotent provenance. CHECK prevents self-transition.

**Columns**

```
id : uuid PK
source_year_id : uuid NOT NULL
target_year_id : uuid NOT NULL; CHECK (source_year_id <> target_year_id)
copy_structure : boolean NOT NULL default true
copy_appointments : boolean NOT NULL default false (people change; default OFF)
copy_content : boolean NOT NULL default false
copy_role_assignments : boolean NOT NULL default false
status : transition_status NOT NULL default 'pending' (pending|running|completed|failed)
counts : jsonb NULL (per-entity copied counts report)
started_at : timestamptz NULL
completed_at : timestamptz NULL
run_by : uuid NULL
created_at : timestamptz NOT NULL default now()
```

**Relationships**

- FK source_year_id -> academic_year.id (ON DELETE RESTRICT)
- FK target_year_id -> academic_year.id (ON DELETE RESTRICT)
- FK run_by -> app_user.id (ON DELETE SET NULL)

**Indexes / constraints**

- INDEX (target_year_id)
- PARTIAL UNIQUE (source_year_id, target_year_id) WHERE status = 'completed' -- one successful transition per pair

### `backup_record`

Backup & Recovery tracking: each produced backup (pre-migration, scheduled) with scope, format, location, checksum, verification status.

**Columns**

```
id : uuid PK
scope : text NOT NULL (e.g. 'full','events','pre-migration')
format : text NOT NULL (json|csv|markdown|zip)
location : text NOT NULL (storage URI)
checksum : text NULL (sha256)
bytes : bigint NULL
verified : boolean NOT NULL default false
verified_at : timestamptz NULL
created_at : timestamptz NOT NULL default now()
created_by : uuid NULL
```

**Relationships**

- FK created_by -> app_user.id (ON DELETE SET NULL)

**Indexes / constraints**

- INDEX (scope, created_at DESC)
- INDEX (verified)

## Enumerated types (15)

- academic_year_status: planning | active | locked — lifecycle of a year; planning=being built by wizard, active=live editable (exactly one is_current), locked=read-only past (write-protected by lock_guard trigger). Enum (fixed, code-gated).
- user_status: active | suspended | invited | disabled — Enum.
- entity_status: active | archived — generic soft-delete/lifecycle for IDENTITY/config rows (role, org_unit_type, person, position, media, content_type_def). Kept DISTINCT from content_status so identity rows never carry a meaningless 'draft' state.
- content_status: draft | review | published | archived — draft/publish lifecycle for CONTENT/structure rows (content_item, org_unit, appointment). Enum (fixed lifecycle, app-enforced transitions).
- revision_status: draft | review | published | superseded — per-revision state; a revision becomes 'superseded' when a newer revision is published. Enum.
- person_type: faculty | student | staff | external — stable taxonomy. Enum.
- meal_type: breakfast | lunch | snacks | dinner — Enum.
- audience_type: public | students | faculty | staff | internal — Enum.
- resource_kind: pdf | link | drive | file — Enum.
- storage_provider: cloudinary | local | external — supports /public -> Cloudinary migration. Enum.
- media_kind: image | pdf | svg | gif — Enum.
- media_role: gallery | hero | hero_primary | attachment — role of a media asset on a revision; enum (not free text) so content_media uniqueness is meaningful and typos cannot mint phantom roles. Enum.
- audit_action: create | update | delete | publish | unpublish | archive | restore | login | transition | grant_role | revoke_role — Enum.
- transition_status: pending | running | completed | failed — Enum.
- NOTE on enum vs lookup table: org_unit_type, role, permission, position, AND content_type are LOOKUP TABLES because they are admin/developer-extensible at runtime and/or relationally referenced by FK (capabilities 2/3/4/9). content_type was DEMOTED from an enum to a text-PK lookup table (content_type_def) specifically so adding a module is pure DATA + a new payload table with NO 'ALTER TYPE ADD VALUE' (which Postgres cannot add and use in one transaction/migration). Small, fixed, code-coupled sets (all *_status, person_type, meal_type, audience_type, resource_kind, media_kind, media_role, audit_action, storage_provider, transition_status) remain native Postgres ENUMs for integrity, index efficiency, and Prisma type-safety.

## Open questions (decide in / before Session 2)

These are deliberate "confirm before building" points — sensible defaults are
chosen, but product confirmation is wise:

- Locked-year errata path: confirmed mechanism is the lock_guard trigger (rejects writes to rows whose resolved academic_year.status='locked'); the agreed correction path is a controlled unlock->correct->relock OR an append-only new revision, never an in-place mutation. Product still needs to confirm WHO may unlock and whether unlock itself is audited as a distinct action.
- Transition Wizard appointment copy default: copy_appointments defaults OFF (structure + positions copied, rosters left empty for explicit re-confirmation of returning officers). Confirm this is the desired default vs copying prior appointments as drafts.
- copy_content with no published source revision: recommended behavior is to clone the latest revision as a new draft in the target year. Confirm (vs skipping items that were never published).
- Approval workflow depth: 'review' exists in content_status/revision_status but no reviewer-assignment table is modeled. If multi-step sign-off with named reviewers/comments is required, add content_review (reviewer_id, decision, comment). Confirm whether single-state 'review' suffices for now.
- Slug URL namespacing: slug uniqueness is per (content_type, academic_year_id) with NULLS NOT DISTINCT. Confirm public URLs are year-namespaced (e.g. /2025-26/clubs/coding) vs a single canonical current-year URL — affects routing only, not the constraint.
- JWT session revocation latency: with JWT sessions chosen, a revoked role takes effect on next token refresh; sensitive actions re-check role_assignment.revoked_at live. Confirm token TTL and whether any action needs instant server-side revocation (which would argue for DB sessions).
- person.email vs app_user.email: when app_user_id is set, a trigger enforces person.email = app_user.email. Confirm this is acceptable vs dropping person.email entirely for linked persons and reading through the link.
- audit_log / content_revision growth: BRIN on created_at chosen. Decide whether monthly RANGE partitioning of audit_log and a revision retention/pruning policy are needed before launch or deferred.
- Semester/term scoping: model is whole-year. If semester-level scoping is later needed, add a child 'term' table under academic_year (additive). Confirm not needed for V2.
- Permission resolution semantics: effective permissions are additive (union) with grants_all short-circuit, computed in app code; no DENY/negative permissions. Confirm no negative-permission requirement ever arises.
- person.email PII/visibility: institutional emails were public in V1; V2 may want per-field visibility/consent flags. Flag for SECURITY review.

## Prisma / Postgres / Neon implementation notes (for Session 2)

> These notes carry the hard-won feasibility details from the adversarial review.
> Read them before writing `prisma/schema.prisma`.

Models map 1:1 to tables; use snake_case @@map on models and @map on fields (camelCase in Prisma Client). Enable extensions in the FIRST migration: CREATE EXTENSION IF NOT EXISTS citext; use the native gen_random_uuid() (PG13+) so pgcrypto is NOT required. PIN Neon PostgreSQL >= 15 (required for the role_assignment and content_item NULLS NOT DISTINCT partial uniques). Configure datasource with both url (pooled/PgBouncer, pgbouncer=true) for the Client and directUrl (non-pooled) for migrations; use the @neondatabase/serverless driver adapter in serverless functions.

ENUMS -> Prisma enums (AcademicYearStatus, UserStatus, EntityStatus, ContentStatus, RevisionStatus, PersonType, MealType, AudienceType, ResourceKind, StorageProvider, MediaKind, MediaRole, AuditAction, TransitionStatus). content_type is NOT an enum — it is the text PK of content_type_def (ContentTypeDef); ContentItem.contentType is a String with a relation to ContentTypeDef and an in-code config map for payload routing (add a unit test asserting every content_type_def row has a handler).

CIRCULAR FK REMOVED. ContentItem.publishedRevisionId / draftRevisionId are PLAIN String? @db.Uuid scalar fields (NOT Prisma relations, NO FK, NO deferrable migration). Their integrity is enforced by raw-SQL: two partial unique indexes on content_revision (one WHERE revision_status='draft', one WHERE revision_status='published') plus a trigger asserting each pointer references a same-item revision of matching status. content_revision has UNIQUE(id, content_item_id) as the composite same-item target. Document these as a denormalized cache rebuildable from content_revision.

NextAuth v4 PrismaAdapter: adopt canonical model shape. AppUser maps to Adapter User (fields: email, emailVerified @map("email_verified_at"), image resolved from avatar_media_id, name @map("display_name")). AuthAccount uses adapter field names userId @map("user_id"), providerAccountId @map("provider_account_id"), with @@unique([provider, providerAccountId]). ADD a VerificationToken model (identifier, token, expires, @@unique([identifier, token])). Session strategy is JWT — there is NO Session model/table. expires_at is Int? (or BigInt @db.BigInt).

RAW-SQL OBJECTS invisible to Prisma (declare in raw migrations; never overwrite via db pull): all PARTIAL uniques (is_current; archived_at IS NULL roster/grant uniques; draft/published revision uniques; hero_primary; transition completed; NULLS NOT DISTINCT slug+grant uniques), the EXPRESSION index lower(full_name), the COMPOSITE FK appointment(org_unit_id, academic_year_id) -> org_unit(id, academic_year_id) (Prisma can model composite relations via @relation references/fields, but verify the generated FK), all TRIGGERS (lock_guard for locked years, max_holders cardinality, position-type compatibility, content_item pointer same-item/same-status, person.email=app_user.email), GIN indexes (page_block_payload.data, audit_log.after) and BRIN (audit_log.created_at) via @@index(type: Gin)/(type: Brin) where supported else raw SQL, and the bigint identity audit_log.id (GENERATED ALWAYS AS IDENTITY via raw SQL; BigInt in Prisma).

TYPE ANNOTATIONS: citext -> @db.Citext; time -> @db.Time; inet -> @db.Inet; uuid -> @db.Uuid; jsonb -> Json @db.JsonB; bigint -> BigInt @db.BigInt.

POLYMORPHIC fields have NO Prisma relation: audit_log.entityType/entityId are scalars (intentional, integrity in the central audit extension). org_unit_lineage_key IS now a real relation (FK to OrgUnitLineage).

APP_USER BACK-RELATIONS — enumerate ALL up front so `prisma validate` passes; every inbound FK to AppUser needs an explicit unique @relation name AND a declared back-relation field. To cut the surface, prune low-value updated_by where created_by + the central audit_log already capture provenance (keep updated_by only on academic_year, org_unit, person, role, content_item; rely on audit_log elsewhere). Enumerated AppUser back-relations: academicYearsCreated/Updated, rolesCreated/Updated, orgUnitsCreated/Updated, personsCreated/Updated, orgUnitLineagesCreated, roleAssignmentsGranted/Revoked, appointmentsCreated/Updated, contentItemsCreated/Updated/Published, contentRevisionsCreated, mediaUploaded, auditLogs (actor), transitionRunsRun, backupRecordsCreated, avatar (media), personLink. Name each relation consistently (e.g. @relation("ContentItemCreatedBy")).

AUDIT: implement one Prisma Client extension (or a single audited-mutation service) that captures before/after and writes audit_log on every create/update/delete/publish/transition/grant — do not scatter audit calls.

SEED: one academic_year (is_current, active); system roles (Developer grants_all, Admin) + permission catalog + role_permission; org_unit_type rows (council/club/committee/hostel/mess/office) + org_unit_type_allowed_child edges (council->club, etc.); base position rows (coordinator/co-coordinator/secretary/pic/warden/caretaker/wellness_warden/attendant/dean/...); content_type_def rows for all content types with payload_table mapping; org_unit_lineage + org_unit per logical unit; media_asset rows for /public assets (storage_provider='local', original_path set). Quote "position" in raw SQL; Prisma model Position { @@map("position") }.

## Session 2 implementation addenda (what shipped vs this spec)

The schema was implemented in `prisma/schema.prisma` + the init migration in
Session 2. These intentional refinements (each with a DECISION_LOG record) keep
this document in sync with the code:

- **Prisma enums = 14** (this doc's "15" counted `content_type`, which is a
  text-PK lookup table `content_type_def`, not an enum — see DL-006/DL-014). The
  14 native enums are exactly the list in "Enumerated types".
- **NextAuth model names** are `User` / `Account` / `VerificationToken` (so the
  default PrismaAdapter resolves them) mapped to `app_user` / `auth_account` /
  `verification_token` (DL-017).
- **`app_user.image` (text, NULL)** added for the NextAuth adapter's OAuth avatar
  URL, distinct from the curated `avatar_media_id` relation (DL-017).
- **`appointment.is_singleton` (boolean)** added: a denormalized flag maintained
  by `appointment_type_guard` from `position.max_holders`, so the **singleton
  partial unique** `appointment_singleton_position_uq` can express the
  `max_holders=1` predicate at the index level (concurrency-safe). The deferred
  count trigger remains for bounded multi-holder positions (DL-009/DL-021).
- **`org_unit_hierarchy_guard` trigger** implements the mandated "same-year +
  allowed-child-type" rule on `org_unit.parent_id` (DL-022). Total raw-SQL trigger
  functions: **6** (lock_guard, org_unit_hierarchy_guard, appointment_type_guard,
  appointment_cardinality_guard, content_item_pointer_guard, person_email_link_guard).
- **`audit_log.id` = BIGSERIAL** (`@default(autoincrement())`) rather than
  `GENERATED ALWAYS AS IDENTITY` — Prisma-native, drift-free; append-only is
  enforced by the central audit writer (DL-018).
- **`auth_account.expires_at` = Int** (canonical NextAuth adapter shape; the
  adapter writes a JS number). Widen to BigInt only if Y2038 matters.
- **content_item public-listing index** is the raw-SQL partial
  `content_item_listing_idx (… WHERE archived_at IS NULL)`; the redundant
  non-partial Prisma index was removed.
- **Central audit-write extension** is delivered in **Session 3** with the CMS
  mutation pipeline; the table + indexes ship in Session 2 (DL-025).

### Session 5 schema addendum (forward migration)

- **`appointment_type_guard` `is_singleton` fix** — the Session-2 trigger set
  `NEW.is_singleton := (max_holders = 1)`, which is **NULL** for unlimited
  positions (`max_holders IS NULL`) and violated the `is_singleton NOT NULL`
  column. Latent until Session 5 created the first multi-holder appointment.
  Fixed with `COALESCE(max_holders = 1, false)` in the forward migration
  `20260628130000_fix_appointment_singleton_guard` (`CREATE OR REPLACE FUNCTION`,
  idempotent; the `appointment_type_guard_trg` trigger binding is unchanged).
  Applied to Neon via `prisma migrate deploy`. No table/column change (DL-036).
  Raw-SQL trigger functions remain **6** (this only corrects one body).

### Session 16 schema addendum — live quizzes & leaderboards (forward migration)

`20260702130000_member_platform_quiz` (additive; applied + validated on the local
Docker Postgres). Four STANDALONE operational tables keyed on the DURABLE event
`content_item` id — part of an event's operational subsystem (like the M5
`event_*` tables), gated by the SAME `event.manage` seam, so **NO new permission
and NO new content type** (permissions stay **52**, content types **13**; DL-104):

- **`quiz_question`** — an event's question bank: `prompt`, `options` JSONB
  (`[{id,text}]`), `correct_option_ids` `TEXT[]`, `points`, `time_limit_seconds`,
  `sort_order`. CHECKs: `points >= 0`, `0 < time_limit_seconds <= 3600`. FK →
  `content_item` ON DELETE CASCADE.
- **`quiz_session`** — one live run: `status` CHECK(`pending|active|reveal|ended`),
  `current_question_id` (FK → `quiz_question` ON DELETE SET NULL), the
  **server-authoritative** `question_started_at`, `started_at`, `ended_at`. A
  **partial unique** `quiz_session_one_live_uq (event_item_id) WHERE status <> 'ended'`
  allows at most one non-ended session per event (DL-105).
- **`quiz_participant`** — lobby membership, `UNIQUE(session_id, user_id)`; durable,
  not audited.
- **`quiz_answer`** — one answer per `(session_id, question_id, user_id)` (a UNIQUE
  makes each answer one-shot), server-scored (`is_correct`, `points_awarded`,
  `response_ms`); durable, not audited.

All four are registered in `TABLE_BY_MODEL` + `AUTO_AUDIT_SKIP` (organizer
question/session mutations are audited SEMANTICALLY by `lib/quiz/*`; member
joins/answers are durable rows). No raw-SQL trigger added (trigger functions remain
**6**). Real-time fan-out is an in-process broadcaster with OPTIONAL Redis pub/sub
(`lib/realtime/*`, DL-107) — no schema coupling.

---

*Generated from the Session-1 schema-design workflow (9 agents, all adversarial
reviewers' critical/major issues resolved in the finalize stage). If you change
the schema, update this document and add a [DECISION_LOG.md](DECISION_LOG.md) entry.*
