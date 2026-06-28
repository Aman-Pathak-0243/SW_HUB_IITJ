# Architectural Decision Records (ADRs)

> **This is the lightweight index.** The **detailed** decision log — with
> Alternatives / Trade-offs / Future-impact for every major decision (including
> all Session-1 schema decisions) — is in [DECISION_LOG.md](DECISION_LOG.md).
> Keep ADRs here as short pointers; record full reasoning in the Decision Log.

Append-only log of significant decisions. Each entry: context → decision →
consequences. Add a new numbered record; never rewrite history (correct with a
follow-up record instead).

---

## ADR-0001 — Documentation-first, milestone-gated delivery
**Date:** 2026-06-28 · **Status:** Accepted

**Context:** The master specification mandates analyzing the project, producing
documentation, designing architecture, and obtaining approval **before** writing
production code, then delivering **one milestone at a time** with tests and doc
updates.

**Decision:** Adopt this workflow. Phase 0 (this work) produces `/docs` + root
tracking files + a milestone plan and changes **no** production code. Each later
milestone is approved individually and ends only when tests + docs are updated.

**Consequences:** Slower start, but a maintainable, well-documented system that
future students can own. Tracking files (`CURRENT_STATUS`, `NEXT_TASK`, `TODO`,
`KNOWN_ISSUES`, `PROGRESS`) are kept current every milestone.

---

## ADR-0002 — Keep the current stack (Next.js App Router + MongoDB/Mongoose)
**Date:** 2026-06-28 · **Status:** Accepted

**Context:** The project already uses Next.js 16 (App Router), React 19, Tailwind
v4, NextAuth 4, and Mongoose 8. The spec favors reuse over rewrites.

**Decision:** Build V2 on the existing stack rather than re-platforming. Refactor
toward data-driven Server Components and a proper data/auth layer within it.

**Consequences:** Lower risk and continuity for maintainers. We inherit current
constraints (e.g. NextAuth 4 patterns) and must address known issues in place.

---

## ADR-0003 — Academic year as a first-class dimension on all content
**Date:** 2026-06-28 · **Status:** Accepted (design intent)

**Context:** The spec requires full historical preservation — nothing ever
overwritten — across clubs, councils, hostels, messes, events, etc.

**Decision:** Every historized entity carries an `academicYearId`; year
transitions copy structure forward (Transition Wizard). Public pages default to
the current year with a history selector.

**Consequences:** Slightly more complex queries and writes; enables a core
product requirement. Existing `Event` data is backfilled to `2025-26`.

---

## ADR-0004 — Flexible, data-driven organization model (no enumerations in code)
**Date:** 2026-06-28 · **Status:** Accepted (design intent)

**Context:** Org structures (council/club/committee/hostel/mess/office and future
types) must be created/renamed/archived without code changes.

**Decision:** Model organization **types**, **units**, **positions**, and
**roles** as data with an additive schema; manage them via the Admin Panel.

**Consequences:** Greater flexibility; requires careful generic CMS/validation
design. Avoids hardcoded structures that V1 suffered from.

---

## ADR-0005 — Media stays local for now; migrate via a dedicated tool later
**Date:** 2026-06-28 · **Status:** Accepted

**Context:** The spec says do **not** move `/public` images now; build an Admin
Media Migration Tool later to move them to Cloudinary and update references.

**Decision:** Leave `/public` untouched during early milestones. New uploads go to
Cloudinary (no base64-in-DB). A later milestone delivers the reversible migration
tool.

**Consequences:** Temporary coexistence of local + Cloudinary media; clean,
reversible path to consolidated media management.

---

## ADR-0006 — Adopt PostgreSQL (Neon) + Prisma; retire MongoDB/Mongoose
**Date:** 2026-06-28 · **Status:** Accepted · **Supersedes:** the MongoDB part of ADR-0002

**Context:** V2's nine core capabilities (academic-year history, generic orgs,
dynamic roles/positions, draft/publish, version history, audit) are inherently
relational and require real referential integrity, composite/partial unique
constraints, and append-only audit — which MongoDB does not enforce.

**Decision:** Use **PostgreSQL on Neon** with **Prisma** as the ORM. Keep the rest
of the stack (Next.js App Router, React 19, Tailwind, NextAuth). The full
reasoning, alternatives, and trade-offs are in [DECISION_LOG.md](DECISION_LOG.md)
(DL "Postgres-over-Mongo / Prisma-over-Mongoose"); the schema is in
[SCHEMA_DESIGN.md](SCHEMA_DESIGN.md).

**Consequences:** ADR-0002's "keep MongoDB" no longer holds. V1 Mongo data is
backed up and migrated to Postgres (Sessions 5–7). Some Postgres power lives in
raw-SQL migration objects outside Prisma's drift detection (documented in
SCHEMA_DESIGN.md → Prisma notes).

---

## ADR-0007 — Build V2 across 10 sessions with living documentation
**Date:** 2026-06-28 · **Status:** Accepted

**Context:** The project is delivered by rotating student developers over many
sessions; context must survive handoffs.

**Decision:** Adopt the [SESSION_PROTOCOL.md](SESSION_PROTOCOL.md) (10 sessions,
start-by-reading / end-by-updating checklists). Full reasoning in
[DECISION_LOG.md](DECISION_LOG.md).

**Consequences:** Predictable handoffs; mandatory doc/tracking updates each
session; no repeated work.

---

*(Add ADR-0008+ as decisions are made during implementation.)*
