# Session Protocol & 10-Session Roadmap

This project is built across **10 Claude Code sessions** (local, automode,
ultracode). Each session is a self-contained unit of work. This document is the
**contract** every session follows so that any future session — or any future
student developer — can pick up exactly where the last left off, with no loss of
context and no repeated work.

> **Golden rule:** documentation is never allowed to fall behind the code. A
> session is not "done" until its docs and tracking files are updated and a
> commit is prepared.

---

## The 10 sessions

| # | Session | Focus | Status |
|---|---------|-------|--------|
| 1 | **Analysis + Documentation + Architecture** | Repo analysis, full `/docs`, V2 architecture, **PostgreSQL schema design (Prisma/Neon)**, ER diagram, migration report, decision log, backups, security scanning | ✅ **DONE** |
| 2 | **Database + Prisma + RBAC + Authentication** | Schema in Prisma (33 tables/14 enums), first Neon migration (raw-SQL guards + 6 triggers), seed (year/roles/perms/org/positions/content types/bootstrap users), NextAuth (Google + credentials, one-account-per-email, JWT), dynamic server-side RBAC, 50 tests | ✅ **DONE** |
| 3 | **CMS Foundation** | Draft/Publish lifecycle, restore, version history + diff, generic schema-driven editing layer, **central audit-write `$extends`**, public visibility rule, friendly DB-guard errors | ✅ **DONE** |
| 4 | **Academic Year Engine** | Year context (resolve/set-current/list/create), cross-year history + `org_unit_lineage` follow, **Transition Wizard** (idempotent structure/appointments/content/role copy forward), lock/unlock, public year selector; 130 static + 6 live tests; 24-agent review | ✅ **DONE** |
| 5 | **Organization Model** | Org-unit + person + appointment services; V1 dataset (4 councils/30 clubs/6 hostels/5 messes/committee) + idempotent importer; one data-driven `<OrgUnitPage>` (replaces the 4 Clubs pages); honors hierarchy/type/cardinality/lock guards; fixed the `is_singleton` trigger (forward migration); 152 static + 4 live tests; 25-agent review | ✅ **DONE** |
| 6 | **Events + Announcements** | Events + Announcements as CMS `content_type` callers (no new pipeline); idempotent migration of the 3 backed-up Mongo events; pinned/audience/publish-window; V1 Mongo API replaced by a CMS-backed route (Mongoose retired); data-driven `/events` `/past-events` `/announcements`; base64→media placeholders; `queries` decided (not migrated); public audience gating; 171 static + 10 live tests; 64-agent review | ✅ **DONE** |
| 7 | Resources + Media | Resources (PDFs/links); Media assets + Cloudinary; Admin Media Migration Tool (`/public` → Cloudinary) | ⏳ Next |
| 8 | Developer Console | Monitoring, logs, audit trail, testing reports, backups/restore/rollback, migrations, cost estimation | ⬜ Pending |
| 9 | Admin Panel | Full RBAC-gated admin UI over CMS/years/orgs/events/announcements/resources/media/users/roles | ⬜ Pending |
| 10 | Testing + Deployment + Optimization | Full test gate, performance/CWV, responsive/cross-browser, deploy hardening, handover | ⬜ Pending |

Detailed scope, deliverables, dependencies, and acceptance criteria per session
are in [MILESTONE_PLAN.md](MILESTONE_PLAN.md) (the living roadmap).

---

## START-OF-SESSION checklist (do this FIRST, before any work)

1. **Read, in order:**
   - `docs/` — at minimum: [README.md](README.md) (index),
     [SCHEMA_DESIGN.md](SCHEMA_DESIGN.md), [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md),
     [DATA_MIGRATION_REPORT.md](DATA_MIGRATION_REPORT.md),
     [DECISION_LOG.md](DECISION_LOG.md), and this file.
   - [`CURRENT_STATUS.md`](../CURRENT_STATUS.md) — where things stand.
   - [`NEXT_TASK.md`](../NEXT_TASK.md) — the single next action.
   - [`TODO.md`](../TODO.md) — the backlog and what's checked off.
   - [`KNOWN_ISSUES.md`](../KNOWN_ISSUES.md) — open bugs/risks.
   - [`docs/CHANGELOG.md`](CHANGELOG.md) — what shipped in prior sessions.
2. **Understand the current implementation** before changing anything.
3. **Do not repeat completed work.** Trust the tracking files; verify against the
   code if in doubt.
4. **Continue only from the next pending task** (per `NEXT_TASK.md` / `TODO.md`).
5. Confirm prerequisites (e.g. `.env.local` has `DATABASE_URL`; run `npm install`).

## END-OF-SESSION checklist (do this BEFORE finishing — non-negotiable)

1. Update [`CURRENT_STATUS.md`](../CURRENT_STATUS.md).
2. Update [`NEXT_TASK.md`](../NEXT_TASK.md).
3. Update [`TODO.md`](../TODO.md) (check off done; add new).
4. Update [`docs/CHANGELOG.md`](CHANGELOG.md) (a new dated, specific entry).
5. Update the [Developer Guide](DEVELOPER_GUIDE.md) if setup/workflow changed.
6. **Record every architectural decision** in [`DECISION_LOG.md`](DECISION_LOG.md)
   (Decision / Alternatives / Why / Trade-offs / Future impact).
7. Update [`KNOWN_ISSUES.md`](../KNOWN_ISSUES.md) and this file's status table.
8. **Update [`Token_Usage.md`](Token_Usage.md)** — record each Workflow run's
   measured subagent tokens and paste the `/cost` session total.
9. **Prepare one commit** of all changes (the operator pushes manually). Use a
   specific, descriptive commit message — never "update / changes / fixes".
10. Output the **session-handoff prompt** for the next session.

## Automode / ultracode expectations

- Each session runs in **automode at ultracode**: take all reasonable expert
  decisions autonomously; do not stall on choices a senior engineer would just
  make. Record material decisions in the Decision Log.
- Prefer multi-agent workflows for substantial design/implementation/review.
- Bias toward correctness, normalization, and long-term maintainability by future
  students over shortcuts.

## Session completion output (what the operator expects at the end)

1. `Done master`
2. A single, specific **commit message** for GitHub.
3. A **ready-to-paste prompt** to start the next local Claude session.
