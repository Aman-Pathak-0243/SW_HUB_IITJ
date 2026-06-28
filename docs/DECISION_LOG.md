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

## Session 2 — Database, Prisma, Auth & RBAC decisions

## DL-017 — NextAuth adapter model naming: Prisma models User/Account/VerificationToken mapped to snake_case tables; add app_user.image for adapter compatibility.

- **Decision:** Name the Prisma models `User`, `Account`, `VerificationToken` (so the default `@next-auth/prisma-adapter` resolves `prisma.user/account/verificationToken`) while keeping the snake_case tables `app_user`, `auth_account`, `verification_token` via `@@map`. Add a nullable scalar `image` column to `app_user` (the adapter's OAuth avatar URL), distinct from the curated `avatar_media_id` FK relation.
- **Alternatives considered:** (a) Keep model name `AppUser` and hand-write a custom adapter mapping `prisma.appUser`. (b) Resolve the adapter's `image` solely through `avatar_media_id` (a uuid FK) — impossible, the adapter writes a URL string. (c) Canonical model names + `@@map` + a separate `image` text column.
- **Why this was chosen:** Adopted (c). The default PrismaAdapter is hardcoded to `prisma.user/account/verificationToken`; matching model names avoids a brittle hand-rolled adapter while the tables stay snake_case (SCHEMA_DESIGN intent). The adapter writes `image` (string), so `app_user` needs a real `image` text column; the app resolves the display avatar as `avatar` (media_asset relation) first, falling back to `image`.
- **Trade-offs:** One extra nullable column not in the original SCHEMA_DESIGN dictionary (now documented in the Session-2 addenda there). Model names diverge from the doc's `AppUser` label (table name unchanged).
- **Future impact:** Google + credentials auth work with the canonical adapter out of the box; a curated avatar can later override the OAuth image without schema change.

## DL-018 — audit_log.id as BIGSERIAL (Prisma @default(autoincrement())) rather than GENERATED ALWAYS AS IDENTITY.

- **Decision:** Implement the high-volume `audit_log` PK as `BigInt @id @default(autoincrement())` (emits `BIGSERIAL`).
- **Alternatives considered:** (a) `GENERATED ALWAYS AS IDENTITY` via raw SQL (the SCHEMA_DESIGN note). (b) BIGSERIAL via Prisma autoincrement.
- **Why this was chosen:** Adopted (b). Prisma has no native representation for IDENTITY columns; a raw-SQL `ALTER ... ADD GENERATED ALWAYS AS IDENTITY` would either force every `audit_log.create()` to supply an id (no Prisma default) or create permanent Prisma↔DB drift on `migrate dev`. BIGSERIAL gives the same monotonic bigint PK and is Prisma-native. The append-only guarantee is enforced by the central audit-write service (the only writer) plus the table being insert-only, not by IDENTITY's reject-manual-id property.
- **Trade-offs:** BIGSERIAL permits a manual id insert (IDENTITY ALWAYS would forbid it); acceptable since application code never supplies audit ids.
- **Future impact:** Audit inserts are omittable-id and drift-free; if a stronger guarantee is ever needed it can be added as a controlled migration.

## DL-019 — JWT sessions (24h) with LIVE per-request DB permission resolution; resolves the JWT-revocation open question.

- **Decision:** `session.strategy = 'jwt'`, `maxAge = 24h`. Authorization permissions are resolved LIVE from the DB on every protected action (`lib/rbac/authorize.mjs`), and `requireUser()` re-checks `app_user.status` live. The JWT only carries identity (`uid`) + a coarse `isDeveloper` UI hint.
- **Alternatives considered:** (a) Database sessions for instant server-side revocation. (b) Stuff the permission set into the JWT (fast, but stale until refresh). (c) JWT identity + live DB permission/status checks.
- **Why this was chosen:** Adopted (c). It keeps the simplicity/scalability of stateless JWT while eliminating the usual JWT downside: because permissions and account status are read from the DB per protected request, a revoked role or a suspended account takes effect on the **next request**, not on token refresh. This is the recommended resolution of SCHEMA_DESIGN's "JWT session revocation latency" open question.
- **Trade-offs:** One small DB read per protected action (role_assignment + status). Acceptable and indexed (`role_assignment_active_user_idx`). A stolen-but-valid token remains usable for ≤24h for *authentication* even after sign-out (mitigated by short TTL); all *authorization* is live.
- **Future impact:** No session table to maintain; revocation is effectively immediate for authorization. If instant auth-revocation is ever required, a token denylist or DB sessions can be added.

## DL-020 — Password hashing: argon2id via @node-rs/argon2 (OWASP params).

- **Decision:** Hash passwords with argon2id using `@node-rs/argon2` (m=19456 KiB, t=2, p=1).
- **Alternatives considered:** `node-argon2` (node-gyp native build), `bcrypt`, `scrypt`.
- **Why this was chosen:** `@node-rs/argon2` ships prebuilt binaries (no node-gyp/Vercel build friction), argon2id is the current OWASP first choice, and the chosen parameters are OWASP's recommended baseline. `password_hash` is NULL for OAuth-only accounts.
- **Trade-offs:** A native dependency (prebuilt, low risk). Parameters can be tuned later as hardware improves.
- **Future impact:** Strong, standard credential storage; verify() reads parameters from the encoded hash so params can evolve without breaking existing hashes.

## DL-021 — Roster cardinality: denormalized appointment.is_singleton + partial unique (singletons) AND deferred count trigger (multi-holder).

- **Decision:** Keep DL-009's two-guard design. Because a partial-index predicate cannot read `position.max_holders`, denormalize `appointment.is_singleton` (maintained by the `appointment_type_guard` trigger from `position.max_holders`) and build the concurrency-safe singleton guard as `appointment_singleton_position_uq (academic_year_id, org_unit_id, position_id) WHERE archived_at IS NULL AND status <> 'archived' AND is_singleton`. Keep the deferred `appointment_cardinality_guard` count trigger for bounded multi-holder positions (max_holders > 1).
- **Alternatives considered:** (a) Trigger-only for all cardinality (the initial Session-2 build) — has a TOCTOU/MVCC race under READ COMMITTED: two concurrent inserts of the same singleton can both pass the count check and commit. (b) `pg_advisory_xact_lock` in the trigger. (c) Denormalized flag + partial unique + count trigger.
- **Why this was chosen:** Adopted (c) after the Session-2 adversarial review flagged the race. A real partial UNIQUE index serializes concurrent inserts at the index level regardless of isolation, which is exactly why DL-009 mandated it; the count trigger alone cannot. The denormalized boolean is the only way to express the singleton predicate in a partial index.
- **Trade-offs:** One extra boolean column maintained by a trigger. Negligible.
- **Future impact:** "single secretary/PIC/warden, multiple coordinators" is guaranteed even under concurrent writes.

## DL-022 — Add the org_unit parent-hierarchy guard trigger (same-year + allowed-child-type).

- **Decision:** Add `org_unit_hierarchy_guard` (BEFORE INSERT/UPDATE on org_unit): when `parent_id` is set, the parent must be in the SAME academic year and `(parent_type, child_type)` must exist in `org_unit_type_allowed_child` (also blocks self-parenting).
- **Alternatives considered:** App-layer-only enforcement; or the plain single-column FK alone (the initial Session-2 build).
- **Why this was chosen:** SCHEMA_DESIGN mandates "same-year + allowed-child-type trigger-checked" for `org_unit.parent_id`; the initial build shipped only a single-column FK, leaving cross-year hierarchy contamination and disallowed parent types possible — the same class of bug DL-008's composite FK closed for appointments. The Session-2 review caught the omission.
- **Trade-offs:** A trigger (more moving parts) vs an unenforceable rule. Worth it for the structural backbone.
- **Future impact:** The org hierarchy cannot be corrupted across years or against the allowed-child rules even by direct DB writes; RBAC scope traversal over the hierarchy stays sound.

## DL-023 — ESM `.mjs` for all new server/library modules (no package-wide "type":"module").

- **Decision:** Author Prisma client, auth, RBAC, CMS, seed, and tests as `.mjs` ES modules; do NOT set `"type":"module"` in package.json.
- **Alternatives considered:** Set `"type":"module"` globally; or keep `.js` with CommonJS.
- **Why this was chosen:** `empty-module.js` (referenced by `next.config.mjs`) uses CommonJS `module.exports`, so a package-wide `"type":"module"` would break it. `.mjs` files are unambiguously ESM for node (seed), Vitest, and the Next bundler alike, with no per-file config.
- **Trade-offs:** Explicit `.mjs` extensions in imports; mild inconsistency with V1 `.js` app files (which Next transpiles as ESM regardless).
- **Future impact:** Seed/tests run under plain `node`/Vitest; app code imports the same modules through the bundler. A future migration to `"type":"module"` (after `empty-module.js` is removed) is optional.

## DL-024 — Interim auth gating of legacy V1 surfaces (events API now permission-gated; admin page gated on isDeveloper) pending their rebuilds.

- **Decision:** Gate the legacy `POST /api/events` with `requirePermission('content.create')` now (closing KNOWN_ISSUES #2), and change `app/admin/page.js` from the dead V1 `session.user.isAdmin` flag to `session.user.isDeveloper`. Full rebuilds remain scheduled: events on Postgres in Session 6, the RBAC-gated admin panel in Session 9.
- **Alternatives considered:** Leave the V1 handlers untouched until their rebuild sessions; or fully rebuild now (out of Session-2 scope).
- **Why this was chosen:** KNOWN_ISSUES #2 (unauthenticated event writes) is explicitly assigned to Session 2, and the review confirmed the endpoint was an open write hole. Gating it with the new utility both closes the hole and demonstrates the authorization utility "used by a protected handler" (task #7), without prematurely doing the Session-6 rebuild. The admin page referenced a flag the new session never sets (fail-closed); pointing it at the real `isDeveloper` flag makes it usable in the interim while the real boundary stays server-side.
- **Trade-offs:** The events handler still writes to Mongo until Session 6; the admin UI gate is client-side (UX only). Both are documented interim states.
- **Future impact:** No unauthenticated mutation endpoint remains. Sessions 6/9 replace these with Postgres-backed, server-enforced implementations.

## DL-025 — Defer the central audit-write Prisma extension to Session 3 (CMS Foundation).

- **Decision:** Create the `audit_log` table + indexes now, but implement the single central audit-write Prisma Client extension / service in Session 3, when the first audited mutations (CMS create/update/publish/restore) actually exist. This supersedes DL-012's implicit Session-2 placement for the *writer* only (the *schema* is delivered in Session 2).
- **Alternatives considered:** Build the extension now with nothing to audit; or leave it silently unscheduled.
- **Why this was chosen:** An audit writer with no mutating call sites would be dead, untestable code. Session 3 introduces the mutation pipeline it must wrap, so the choke point is built and tested against real operations there. TODO.md already schedules it under Session 3; this records the rationale so the deferral is explicit, not silent.
- **Trade-offs:** Capability-8 enforcement lands one session later than the schema. No runtime risk (no audited mutations exist yet in the new pipeline).
- **Future impact:** The audit extension is implemented once, against real CMS mutations, with coverage tests — exactly where DL-012 intended a single choke point.

## DL-026 — Confirmed defaults for the SCHEMA_DESIGN "Open questions".

- **Decision:** Adopt these expert defaults: (1) Transition wizard `copy_appointments` defaults OFF (structure copied, rosters re-confirmed). (2) Locked-year errata = controlled unlock→correct→relock OR append a new content_revision; `lock_guard` blocks INSERT/UPDATE/DELETE on org_unit/appointment/content_item and UPDATE/DELETE on content_revision in a locked year (revision INSERT allowed for the append path). (3) `copy_content` with no published source clones the latest revision as a target-year draft. (4) Approval workflow: single-state `review` for now; no reviewer-assignment table until a multi-step sign-off is required. (5) Slug URLs: single canonical current-year URL for now; year-namespacing is a routing concern deferred (constraint already supports both). (6) JWT revocation: handled by live DB permission + status checks (DL-019). (7) `person.email = app_user.email` enforced by trigger when linked. (8) Permissions are additive union with grants_all short-circuit; no negative/deny permissions. (9) Whole-year scoping only; no term/semester table in V2.
- **Alternatives considered:** Per question, recorded inline above; all alternatives were the heavier/over-engineered options.
- **Why this was chosen:** Each default is the least-surprising, lowest-complexity choice that satisfies the current single-institute requirements while leaving the heavier option additive.
- **Trade-offs:** Some conveniences (multi-step review, year-namespaced URLs, term scoping) are deferred; all are additive later.
- **Future impact:** Future sessions implement against these confirmed defaults; revisiting any is an additive change, not a rework.

## DL-027 — Migration delivery: single hand-assembled init migration; evolve the dev DB non-destructively (no `migrate reset`).

- **Decision:** Deliver one init migration = Prisma-generated base DDL (`migrate diff --from-empty`) + a hand-written raw-SQL tail (extension, partial/expression/NULLS-NOT-DISTINCT uniques, GIN/BRIN, CHECKs, triggers), applied via `prisma migrate deploy`. During the Session-2 review fixes, the live dev DB was evolved by applying a non-destructive delta via `prisma db execute` + re-stamping the init checksum (verified by `prisma migrate status`), rather than `prisma migrate reset` (which the Prisma AI-safety guard blocks without explicit user consent, and which destroys data).
- **Alternatives considered:** (a) `migrate dev` (needs a Neon shadow DB / CREATEDB the pooled user lacks). (b) `migrate reset` to re-apply the corrected init (destructive; blocked by the AI guard). (c) Offline `migrate diff` to author the SQL + `migrate deploy`, evolving the existing DB with a checked delta.
- **Why this was chosen:** Adopted (c). It avoids the Neon shadow-DB friction, never runs a destructive op, and keeps a single clean init migration that a fresh `migrate deploy` reproduces exactly. The checksum re-stamp keeps the recorded migration consistent with the corrected file so future `migrate` commands don't flag drift.
- **Trade-offs:** The raw-SQL objects are invisible to Prisma drift detection and must be hand-maintained (catalogued in SCHEMA_DESIGN + covered by `tests/migration.test.mjs`). Never run `prisma db pull` (it would drop them from the schema's view).
- **Future impact:** Future sessions add forward migrations via the same diff+deploy pattern; raw-SQL objects evolve in explicit, reviewed migrations.

---

## Session 3 — CMS Foundation decisions

## DL-028 — Central audit-write as a two-path Prisma Client `$extends` (auto per-statement + semantic per-operation), recursion-safe via the base client, best-effort and after-commit.

- **Decision:** Implement capability-8 / DL-012 as ONE choke point in `lib/cms/audit.mjs`, mounted in `lib/prisma.mjs`, with two complementary paths: (1) an **auto** `$extends` query extension that audits every mutating op (create/update/delete/upsert + `*Many`) on audited models — the safety net + the freebie for future single-statement modules; (2) a **semantic** path used by the CMS service: each multi-step business operation runs inside one transaction with `suppressAuto` set (via an `AsyncLocalStorage` actor context), then writes exactly ONE high-level `audit_log` row (action = publish/unpublish/archive/restore/grant_role/…) AFTER the transaction commits. The audit row and all before-reads use the **un-extended `base` client**, so an audit write never re-enters the extension (recursion-safe). Auditing is **best-effort**: a failed audit write is logged and never rolls back / masks the user's mutation. Actor + ip/user-agent come from the context; explicit fields win.
- **Alternatives considered:** (a) Auto-only per-statement audit — produces 3–5 low-level rows per business action (publish touches 3 tables), which is the wrong grain for a human-readable activity log whose enum is already operation-level. (b) Semantic-only — loses the automatic "future modules audited for free" promise of DL-012. (c) Writing the semantic row INSIDE the transaction (atomic) — rejected for now because a failed/contended audit insert must never roll back a user's content change; the after-commit window is a deliberate trade.
- **Why chosen:** The `audit_action` enum is operation-level, so one semantic row per business action is the right grain; the auto path still gives uniform, automatic coverage for everything else and for future modules. Using `base` for the audit write is the clean way to avoid the classic extension-recursion trap. `suppressAuto` prevents double-counting between the two paths.
- **Trade-offs:** (1) The semantic row is written after commit, so a process crash between COMMIT and the audit insert yields a committed-but-unaudited mutation (one lost row, no integrity impact). (2) The auto path writes on `base`, so if a future caller wraps an auto-audited single-statement write in their own interactive `$transaction` that then rolls back, the audit row would persist (audit-on-rollback). Both are documented (KNOWN_ISSUES #24); atomic multi-step flows use the semantic path and never rely on auto-audit. (3) Auto update/delete costs one extra before-read.
- **Future impact:** New modules are audited automatically; if stronger guarantees are ever needed, the semantic `recordAudit` already accepts a `tx` and can be moved inside the transaction. `Account`/`User`/`VerificationToken` are skipped (auth churn noise); user/role admin actions will be audited semantically by their Session-9 service.

## DL-029 — Honor DB guards; never re-implement them in app code. Translate violations to friendly HTTP-shaped errors via `mapDbError`.

- **Decision:** The CMS service relies entirely on the DB's integrity guards (the one-draft/one-published partial uniques, the `content_item_pointer_guard`, `lock_guard`, and payload CHECK constraints) and honors their required write ORDERING (e.g. publish supersedes the prior published revision before marking the draft published). It does NOT duplicate those rules in JavaScript. When a guard rejects a write, `lib/cms/errors.mjs#mapDbError` maps the Postgres/Prisma error (matched by trigger/constraint name in `err.message`/`err.meta`, plus Prisma codes P2002/P2003/P2025) into a `CmsError` with a stable `code` + HTTP `status` (e.g. `YEAR_LOCKED` 409, `ONE_DRAFT`/`ONE_PUBLISHED` 409, `SLUG_TAKEN` 409, `PUBLISH_WINDOW`/`INVALID_CAPACITY`/`INVALID_MEAL_TIME` 422, `POINTER_GUARD` 500). App-side validation is limited to caller-input concerns (required payload fields → `CmsValidationError` 422, unknown content type, missing year/org binding) that are cheaper to catch before the DB round-trip.
- **Alternatives considered:** (a) Re-check the invariants in app code before writing (TOCTOU-racy, duplicates the DB, drifts). (b) Let raw Prisma errors bubble to callers (leaks internals; no stable contract). 
- **Why chosen:** Single source of truth for integrity (the DB) with a thin, testable translation layer is the most maintainable for rotating students and matches the schema's "structural, not app-discipline" philosophy (DL-015).
- **Trade-offs:** `mapDbError` matches on guard/constraint NAMES, so renaming a constraint without updating the matcher would silently fall through to a generic 500 — mitigated by unit tests over the matcher strings and a live-DB test that provokes a real `YEAR_LOCKED` through the actual trigger.
- **Future impact:** Every future mutating surface wraps its DB block in `withMappedDbErrors` and gets consistent friendly errors for free.

## DL-030 — Content lifecycle & restore semantics; interactive-transaction timeout ceiling for Neon.

- **Decision:** (1) `editDraft` edits the open draft in place when one exists; if the item was published with no open draft, it auto-opens a NEW draft revision cloned from the published (or latest) revision and applies the edits — the live published revision is never touched. (2) `publish` supersedes the prior published revision, marks the draft published, repoints `published_revision_id`, and clears `draft_revision_id`. (3) `unpublish` returns the formerly-published revision to an editable draft when none is open, else supersedes it. (4) `restore` OVERWRITES the open draft in place (reusing that row, honoring the one-open-draft partial unique) and records `is_restore_of_revision_id`; it creates a new draft only when none is open. (5) Every mutating op reuses the Session-2 RBAC util (`assertPermission`) against the item's (year, org-lineage) scope and authorizes BEFORE any state-based precondition (no auth-after-disclosure); a `system` actor bypasses for seeds/migrations. (6) CMS interactive transactions are given a generous `{ timeout: 30000, maxWait: 20000 }` ceiling so a cold/remote Neon compute (observed ~1.5–2.5s per round-trip) does not trip Prisma's default 5s limit (P2028); warm in-region these finish in well under a second, so the ceiling never trips in normal serverless operation.
- **Alternatives considered:** restore as a NEW revision every time (would accumulate draft rows and fight the one-open-draft unique); editing the published revision directly (breaks draft/publish isolation); default tx timeout (fails on cold Neon).
- **Why chosen:** Matches SCHEMA_DESIGN capability 6/7 ("admins edit only the draft", "restore overwrites the open draft in place"); the generous tx ceiling is a safety value, not a behavior change.
- **Trade-offs:** Restore is destructive to the current draft's contents (by design — it's a restore). The tx ceiling masks pathological slowness up to 30s; acceptable for a safety bound.
- **Future impact:** Session-9 admin UI and Session-6 events/announcements build directly on these service functions; the public read path is `lib/cms/visibility.mjs`.

---

*(Session 4+ appends new records below.)*
