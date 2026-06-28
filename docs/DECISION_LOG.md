# Decision Log

Every **major technical decision** is recorded here so future student developers
understand not just *what* the system does but *why*. Append-only: add new
records; correct an old one with a follow-up record rather than rewriting it.
Each entry follows: **Decision · Alternatives considered · Why chosen ·
Trade-offs · Future impact**.

> Updated at the end of **every session** (per [SESSION_PROTOCOL.md](SESSION_PROTOCOL.md)).
> The lighter, narrative ADRs in [ARCHITECTURAL_DECISIONS.md](ARCHITECTURAL_DECISIONS.md)
> remain as a quick index; this is the detailed log.

---

## Session 1 — Architecture & schema decisions

## DL-001 — Deliver V2 across 10 structured Claude Code sessions, with documentation as a living, always-current artifact.

- **Decision:** Deliver V2 across 10 structured Claude Code sessions, with documentation as a living, always-current artifact.
- **Alternatives considered:** One long build; or ad-hoc sessions without a fixed handoff protocol.
- **Why this was chosen:** A rotating, single-institute team needs a deterministic handoff: each session reads the tracking files, continues from the next pending task, and updates docs before ending. See SESSION_PROTOCOL.md.
- **Trade-offs:** Upfront protocol overhead and discipline to keep docs in lockstep with code.
- **Future impact:** Any future student can resume mid-project with zero tribal knowledge; sessions never repeat completed work.

---

## DL-002 — Store all credentials (Neon DATABASE_URL, Mongo URI, OAuth secrets) only in git-ignored .env.local; redact them in all tracked docs.

- **Decision:** Store all credentials (Neon DATABASE_URL, Mongo URI, OAuth secrets) only in git-ignored .env.local; redact them in all tracked docs.
- **Alternatives considered:** Commit a configured .env; paste connection strings into docs/runbooks.
- **Why this was chosen:** Secrets must never enter version control (the V1 README leak is the cautionary tale). .env* is git-ignored; env.example holds placeholders only.
- **Trade-offs:** Each environment must be configured out-of-band; onboarding needs the secret-sharing step documented.
- **Future impact:** Eliminates a whole class of leaks; the gitleaks CI (Session 1) enforces it.

---

## DL-003 — Produce a verified, self-contained backup (source + /public + full Mongo dump) BEFORE any migration, and re-verify by re-extraction.

- **Decision:** Produce a verified, self-contained backup (source + /public + full Mongo dump) BEFORE any migration, and re-verify by re-extraction.
- **Alternatives considered:** Trust git + Atlas as the backup; skip a pre-migration snapshot.
- **Why this was chosen:** The master spec forbids modifying data before a verified backup. The Mongo dump also captured a previously-undocumented `queries` collection that git could not have preserved.
- **Trade-offs:** A ~73MB local artifact per run (git-ignored); the live DB dump needs credentials.
- **Future impact:** Migrations (Sessions 5–7) can proceed safely with a known-good restore point.

---

## DL-004 — Composition rule for the three orthogonal axes (academic-year scope x draft/publish x version history), and the explicit scope of versioning.

- **Decision:** Composition rule for the three orthogonal axes (academic-year scope x draft/publish x version history), and the explicit scope of versioning.
- **Alternatives considered:** (a) Generic content_entity + content_field_value EAV + two version pointers. (b) Polymorphic content_version holding a full JSONB snapshot keyed by (entity_type, entity_id). (c) content_item header + immutable content_revision body + per-type *_payload tables 1:1 with revision.
- **Why this was chosen:** Adopted (c). Composition rule: YEAR scopes the header (academic_year_id on content_item/org_unit/appointment); LIFECYCLE (content_status) lives on the header plus two cache pointers; VERSIONS are immutable children of the header. Versioning (capability 7) is EXPLICITLY scoped to CMS payload content only. org_unit and appointment participate in the draft/publish gate but are NOT versioned: their cross-year history is per-year rows tied by org_unit_lineage, and their intra-year edit history is audit_log only (no restore). This removes the prior asymmetry/contradiction where structural rows had a status but no revision lineage.
- **Trade-offs:** Structural/roster edits within a year are not point-in-time restorable (only audited). Per-type payload tables mean a 1:1 index-only join per content read.
- **Future impact:** New module = one content_type_def row + one payload table; the spine grants year-scope, draft/publish, versioning, media, and audit for free. Maintainers have one clear rule for what is versioned vs audit-only.

---

## DL-005 — Remove the circular content_item<->content_revision deferrable FK; make published_revision_id / draft_revision_id PLAIN non-FK cache columns guarded by partial uniques + a trigger.

- **Decision:** Remove the circular content_item<->content_revision deferrable FK; make published_revision_id / draft_revision_id PLAIN non-FK cache columns guarded by partial uniques + a trigger.
- **Alternatives considered:** (a) Keep the circular FK as DEFERRABLE INITIALLY DEFERRED (Prisma-hostile raw migration). (b) Derive published/draft purely via indexed queries with no cache columns. (c) Plain cache columns, no FK, integrity via constraints+trigger.
- **Why this was chosen:** Adopted (c). The circular deferrable FK was the single most student-hostile, Prisma-invisible piece of the schema. Plain uuid cache columns avoid the deferrable migration entirely; correctness is backed by content_revision partial uniques (at most one draft AND one published per item) and a trigger asserting each pointer references a same-item revision of the matching status. The pointers are always rebuildable from content_revision (WHERE content_item_id=? AND revision_status=?).
- **Trade-offs:** Two cache columns can in principle be stale if the trigger is dropped; mitigated by a rebuild script and the documented derive-from-revision fallback. The cache is not a real FK so Prisma models them as scalar uuids.
- **Future impact:** A rotating undergraduate never meets a deferred constraint. The content-spine maintainer doc explains item vs revision vs payload and the pointer semantics in ~10 lines + a diagram.

---

## DL-006 — content_type as a text-PK LOOKUP TABLE (content_type_def), NOT a Postgres enum.

- **Decision:** content_type as a text-PK LOOKUP TABLE (content_type_def), NOT a Postgres enum.
- **Alternatives considered:** (a) Postgres enum content_type (type-safe, but ALTER TYPE ADD VALUE cannot be added AND used in one transaction/migration). (b) Enum + mandatory two-step migration. (c) Lookup table keyed by text.
- **Why this was chosen:** Adopted (c). content_type is relationally referenced by content_item, so by the schema's own enum-vs-table rule (relationally-referenced/extensible sets => tables) it must be a table. This makes capability-9 module addition pure DATA + a new payload table in a single ordinary migration, eliminating the enum-in-transaction failure that would break the headline extensibility story.
- **Trade-offs:** Loses compile-time enum exhaustiveness in Prisma; mitigated by an in-code config map (content_type -> payload table + handler) plus a startup test asserting every content_type_def row is handled. Payload routing keys off the text discriminator.
- **Future impact:** Adding 'gallery' or 'notice_board' is an admin/dev data insert + one table, never a type migration. Removes the most fragile feasibility blocker.

---

## DL-007 — Cross-year org-unit identity via a first-class org_unit_lineage table; org_unit.lineage_key and role_assignment.org_unit_lineage_key are REAL FKs.

- **Decision:** Cross-year org-unit identity via a first-class org_unit_lineage table; org_unit.lineage_key and role_assignment.org_unit_lineage_key are REAL FKs.
- **Alternatives considered:** (a) 'Logical FK' to org_unit.lineage_key (non-unique per-year column, no real FK, app-enforced). (b) org_unit as timeless identity + org_unit_year_profile per year. (c) Dedicated org_unit_lineage identity table.
- **Why this was chosen:** Adopted (c). The prior logical FK referenced a non-unique column and could never be a real constraint, leaving security-critical RBAC scope (role_assignment) able to dangle. A tiny org_unit_lineage table (lineage_key PK) owns the identity; every org_unit row and every unit-scoped grant FK into it (ON DELETE RESTRICT). The Transition Wizard reuses an existing lineage row rather than copying a bare uuid.
- **Trade-offs:** One lightweight insert per genuinely new logical unit in the wizard; one extra small table. Negligible at this scale (≈40 units).
- **Future impact:** Converts a class of silent app-layer bugs (typo'd / orphaned lineage_key, wizard mis-copy) into database-enforced integrity — a major maintainability win for rotating maintainers. Real Prisma relations for cross-year queries.

---

## DL-008 — DB-guard the appointment.org_unit_id denormalization (composite FK + type trigger) and change it to ON DELETE RESTRICT.

- **Decision:** DB-guard the appointment.org_unit_id denormalization (composite FK + type trigger) and change it to ON DELETE RESTRICT.
- **Alternatives considered:** (a) Plain FK to org_unit.id with app-only year/type agreement and ON DELETE CASCADE. (b) Fully normalized (derive unit via position). (c) Composite FK enforcing year agreement + type-compatibility trigger + RESTRICT.
- **Why this was chosen:** Adopted (c). org_unit gains UNIQUE(id, academic_year_id) so appointment FK(org_unit_id, academic_year_id) guarantees the cached unit and the appointment's year cannot disagree. appointment.org_unit_type_id + a trigger ties position.applies_to_type_id so a Warden cannot be appointed to a club. CASCADE was changed to RESTRICT to honor the no-orphan-history policy that every other historized FK follows.
- **Trade-offs:** Slightly wider appointment row (echoed academic_year_id/org_unit_type_id) and a trigger for type-compat. Acceptable for the integrity gained on the hottest roster path.
- **Future impact:** The denormalized hot-read column can no longer drift; roster history is structurally un-erasable.

---

## DL-009 — Enforce roster cardinality (position.max_holders) at the DB level.

- **Decision:** Enforce roster cardinality (position.max_holders) at the DB level.
- **Alternatives considered:** (a) max_holders advisory / app-only. (b) Partial unique for the singleton case only. (c) Partial unique for singletons + deferred constraint trigger counting active appointments for multi-holder positions.
- **Why this was chosen:** Adopted (c). Singleton positions (secretary, PIC, warden) get a partial UNIQUE(academic_year_id, org_unit_id, position_id) WHERE active. Multi-holder positions (coordinators) are bounded by a deferred constraint trigger comparing the active-appointment count against position.max_holders. max_holders is therefore enforced, not decorative.
- **Trade-offs:** A trigger is more moving parts than a constraint; documented as trigger-enforced in the maintainer doc.
- **Future impact:** Capability-4 cardinality rules ('single secretary, multiple coordinators') are guaranteed even against direct DB writes.

---

## DL-010 — Give announcement its own announcement_payload table (do not share event_payload).

- **Decision:** Give announcement its own announcement_payload table (do not share event_payload).
- **Alternatives considered:** (a) Two discriminators (event, announcement) sharing event_payload. (b) Collapse to one 'post' content_type with a sub-kind. (c) Separate announcement_payload table.
- **Why this was chosen:** Adopted (c) to honor the schema's own one-shape-one-table principle and avoid the latent divergence trap of two content_types sharing one payload table (the worst of both worlds). Each content_type now maps 1:1 to a payload table, keeping the capability-9 routing function clean.
- **Trade-offs:** A near-duplicate small table now; if events and announcements truly never diverge this is mild redundancy.
- **Future impact:** When announcements gain unique fields (e.g. severity, acknowledgement) no painful table split or meaningless nullable columns are needed.

---

## DL-011 — Drop content_type_def.field_schema / the generic field-driven editor abstraction.

- **Decision:** Drop content_type_def.field_schema / the generic field-driven editor abstraction.
- **Alternatives considered:** (a) Keep field_schema JSONB (a Zod-like mini-framework) + a generic form renderer. (b) Drop it; use a small in-code config map and typed per-type editors.
- **Why this was chosen:** Adopted (b). The generic field_schema editor was speculative generality for a ~12-type single-institute portal and a third source of truth (enum/def/code) prone to drift. content_type_def keeps only the small behavioral flags (is_year_scoped, supports_publish, is_org_bound) + payload_table; payload shape lives in the typed payload tables and an in-code routing/handler map.
- **Trade-offs:** No runtime-defined arbitrary content forms; adding a module needs a dev (a new payload table + handler), which is the correct safety boundary anyway.
- **Future impact:** Two sources of truth (def row + code handler), reconciled by a startup test asserting every content_type_def row has a handler. Much lower cognitive load for maintainers.

---

## DL-012 — Centralize audit_log writing in one Prisma client extension / service wrapper.

- **Decision:** Centralize audit_log writing in one Prisma client extension / service wrapper.
- **Alternatives considered:** (a) Per-route/per-service audit calls scattered across the codebase. (b) A single Prisma client extension (or one audited-mutation service) that records before/after for every create/update/delete/publish/transition/grant.
- **Why this was chosen:** Adopted (b). Scattered audit calls inevitably get half-implemented (some tables audited, some not), which is worse than a clear policy. One choke point makes capability-8 coverage uniform and automatic for future modules.
- **Trade-offs:** The extension must capture before-images (an extra read on update/delete) and is a single point that must be maintained.
- **Future impact:** New modules are audited 'for free'; the audited-action list is documented once in the maintainer doc.

---

## DL-013 — NextAuth v4 PrismaAdapter contract: add VerificationToken, adopt canonical adapter model shape, choose JWT session strategy (drop the DB session table).

- **Decision:** NextAuth v4 PrismaAdapter contract: add VerificationToken, adopt canonical adapter model shape, choose JWT session strategy (drop the DB session table).
- **Alternatives considered:** (a) Custom adapter over bespoke app_user/auth_account/auth_session. (b) Canonical @next-auth/prisma-adapter models (User/Account/VerificationToken) with @map to snake_case + JWT sessions. (c) Database session strategy.
- **Why this was chosen:** Adopted (b). next-auth@4.24.14 requires a VerificationToken model (createVerificationToken/useVerificationToken) and adapter-canonical Prisma field names (userId, providerAccountId). app_user maps to the Adapter User (email, emailVerified via @map, image via avatar_media_id). Session strategy is JWT, so the auth_session table is DROPPED as dead weight; auth_account uses adapter-canonical fields incl. session_state/refresh_token.
- **Trade-offs:** JWT sessions cannot be server-revoked instantly (mitigated by short token TTL + the role_assignment revoked_at check on sensitive actions). Adapter field names diverge from pure snake_case, bridged by @map.
- **Future impact:** The first migration produces a valid, adapter-compatible auth surface; Google OAuth + credentials + email verification all work out of the box.

---

## DL-014 — Enum vs lookup table policy (with content_type re-classified).

- **Decision:** Enum vs lookup table policy (with content_type re-classified).
- **Alternatives considered:** All enums; all lookup tables; or a mixed rule.
- **Why this was chosen:** Rule: admin/dev-extensible OR relationally-FK-referenced sets => LOOKUP TABLES (org_unit_type, role, permission, position, content_type_def). Small, fixed, code-coupled, non-FK-referenced sets => Postgres ENUMs (all *_status, person_type, meal_type, audience_type, resource_kind, media_kind, media_role, audit_action, storage_provider, transition_status). content_type moved to the table side because it is FK-referenced by content_item.
- **Trade-offs:** Lookup tables need seed rows and lose compile-time exhaustiveness; enums need a migration to extend.
- **Future impact:** Capabilities 2/3/4/9 (orgs, roles, positions, modules) are pure data with no migrations; only genuinely fixed code-coupled vocabularies stay enums.

---

## DL-015 — Postgres-over-Mongo and Prisma-over-Mongoose.

- **Decision:** Postgres-over-Mongo and Prisma-over-Mongoose.
- **Alternatives considered:** Stay on MongoDB/Mongoose (V1 stack); or Postgres with a query builder / raw SQL.
- **Why this was chosen:** The nine capabilities are relational at their core: multi-axis scoping (year x org x role), referential integrity for RBAC and historized rosters, composite/partial unique constraints, and append-only audit. Postgres gives real FKs, partial/expression/composite uniques, CHECK constraints, triggers, citext, inet, JSONB-where-needed, and BRIN/GIN — none of which Mongo enforces. Prisma gives typed models, migrations, and a single audit choke point via client extensions, and is the idiomatic Next.js 16/React 19 + Neon ORM. Mongoose offers no schema-level integrity for this relational shape.
- **Trade-offs:** Some Postgres power (partial/expression/NULLS-NOT-DISTINCT uniques, deferred-constraint triggers, GIN/BRIN, the lock_guard) lives in raw-SQL migrations invisible to Prisma drift detection and must be hand-maintained and never overwritten by db pull. Pins Neon PG>=15.
- **Future impact:** Integrity is structural rather than app-discipline-dependent — the decisive maintainability factor for a team that turns over every 1-2 years. Raw-SQL objects are catalogued in the maintainer doc.

---

## DL-016 — JSONB usage policy.

- **Decision:** JSONB usage policy.
- **Alternatives considered:** JSONB-first (snapshot/EAV everywhere) vs typed-columns-first with JSONB confined to schemaless cases.
- **Why this was chosen:** Typed columns for every known shape (all payload tables, lists normalized to child tables). JSONB confined to: page_block_payload.data (genuinely open-ended presentation blocks), audit_log.before/after (heterogeneous write-once snapshots), transition_run.counts (a report blob). This preserves queryability, type-safety, and FK integrity while still giving an escape hatch.
- **Trade-offs:** page_block content is not relationally queryable (acceptable for free-form CMS blocks); a GIN index on data/after supports containment queries where needed.
- **Future impact:** The schema stays self-documenting and diffable as modules grow; EAV's loss of constraints is avoided.


---

*(Session 2+ appends new records below.)*
