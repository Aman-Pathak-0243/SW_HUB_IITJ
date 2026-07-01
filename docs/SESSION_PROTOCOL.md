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
| 7 | **Resources + Media** | Resources as CMS `content_type='resource'` callers (own lineage) + idempotent importer + data-driven per-unit view (PDF slideshow); Media service (`media_asset` CRUD + one shared inventory writer) + Cloudinary URL/upload layer; idempotent + reversible Admin Media Migration Tool (`/public`→Cloudinary, base64 reconcile); pdfjs pin (#4) + host narrowing (#17); 219 static + 7 live tests; 10-lens review (14 confirmed → all addressed) | ✅ **DONE** |
| 8 | **Developer Console** | Read-mostly `lib/devconsole/*` over the audit/migration/backup plumbing: audit-log viewer (`audit.read`, PII-minimized, keyset paging), monitoring/status (DB health + migration diff + transition history + media-plan, resilient), testing+cost reports, `backup_record` ledger + recovery delegates (media rollback / transition force); gated routes + `db:console` CLI; 258 static + 10 live; 43-agent review | ✅ **DONE** |
| 9 | **Admin Panel** | RBAC-gated admin UI over CMS/years/orgs/events/announcements/resources/media + the dev-console readers; NEW `lib/users/admin.mjs` (users/roles/grants, audited, escalation guards); ONE registry-driven `POST /api/admin/action`; pure client-safe helpers; 285 static + 6 live; 45-agent review (CRITICAL grant-escalation fixed) | ✅ **DONE** |
| 10 | **Testing + Deployment + Optimization + Handover** | Full test gate (307 static + 344 live) + CI workflow; public CWV (Cloudinary f_auto/q_auto, next/image sizes, font consolidation #12, brand-blue #11); responsive (admin mobile sidebar); deploy hardening (security headers, CSRF + rate-limit on the write routes, NFT #32 decision); pruned V1 leftovers (#10/#13 + Header `/org` cutover); operator runbook + full docs sweep; 13-agent review | ✅ **DONE** |

> **The original 10-session plan is complete.** A **Session 11+ member-platform
> program** (multi-session, one module per session — DL-057) is **COMPLETE (M0–M8)** on the
> existing spine. Shipped: the developer-controlled **plugin** control plane,
> **M0** (auth & account lifecycle), **M2** (RBAC categories + per-email permission
> overrides + smart search), **M1** (user status active/inactive/revoked + the three
> surfaces + scoped route RBAC), the **M7/M8 spine** (centralized notifications +
> feedback/support tickets + the developer dashboard: action-log export, usage
> analytics, per-table storage thresholds, and bulk mail), **M3** (club/council
> tabbed pages + `club_membership` M-M + bulk CSV importer + markdown docs + club
> announcements/events + the wired usage beacon), **M4** (Wall of Fame:
> `content_type='achievement'` with hybrid JSONB blocks + the `achievement_credit`
> member-or-club mapping + public `/wall-of-fame` + the per-club Achievements tab), and
> **M5** (Centralized Event Playground: the `event` content_item enriched with a markdown
> problem statement + hybrid blocks, PLUS a relational subsystem — organizer/collaborator
> tagging + custom entities, rounds, capacity→waitlist registration, round+overall scores/
> ranking, attendance, CSV downloads, closure reports, and a curated "Events Organized" doc
> with an audited change-history dev-dashboard tab; the `event.manage` seam + login-only
> participation), and **M6** (Member profiles & performance: a READ-ONLY aggregation over the
> durable M4/M5 ids — a member profile (identity/roles/affiliations/category-mapped events +
> rank/achievements) with self + admin views, and per-stakeholder institute contribution for a
> member/club/entity; no new table/permission/migration). **The M0–M8 program is complete —
> next is a consolidation / deploy-hardening pass** (see NEXT_TASK.md).
> Durable design: [MEMBER_PLATFORM_PLAN.md](MEMBER_PLATFORM_PLAN.md); execution prompt:
> [NEXT_TASK.md](../NEXT_TASK.md). The same protocol applies (start/end checklists,
> reuse the spine, multi-agent review).
>
> **Session 12 (2026-07-01) — consolidation / deploy-hardening (no new module):** the full
> four-layer test gate (517 static + lint + build; every live suite per-file/single-fork on warm
> Neon), single-fork nightly CI, a reusable route-render smoke (`scripts/route-smoke.mjs`), the
> repeatable per-mode [WEBSITE_TESTING_SOP.md](WEBSITE_TESTING_SOP.md), a logged-in-member nav, and
> **11 bug fixes** from a full-site per-role audit ([CONSOLIDATION_BUGLOG.md](CONSOLIDATION_BUGLOG.md),
> DL-094/095).
>
> **Session 13 (2026-07-01) — scoped-coordinator surface + client delivery docs (DL-096):** built the one
> remaining OPTIONAL dev item — a STANDALONE **`/coordinator`** back office (its own scope-aware
> `loadCoordinatorContext`, NOT under the global `/admin` gate) that closes KNOWN_ISSUES #43: a club-scoped
> coordinator SEES and runs their unit's events / members / contribution, driven by a NEW inverse-of-the-
> resolver scoped-grant discovery (`lib/rbac/grants.mjs`, reusing `resolveEffectivePermissions`) + the
> existing `assertEventManage` / `assertActorPermission` seams — no new permission/table/migration
> (permissions 52, content types 13). 530 static + `coordinator.db` 5/5. Also produced the full
> client-facing **delivery documentation set** (see [DELIVERABLES_INDEX.md](../DELIVERABLES_INDEX.md)).
> **The product is now feature-complete, hardened, and delivery-documented; remaining work is
> operator/owner-owned.**
>
> **Session 14 (2026-07-02) — quick-wins bundle + VM hosting spec:** shipped the root
> **`systemRequirements.md`** (single-VM hosting spec: Docker **Postgres 16** on the same VM, nginx/Caddy +
> TLS, PM2, backups, two sizing tiers — **self-hosted SSE + Redis** chosen for the future live-quiz path) and
> **six scoped enhancements** to the existing platform: per-event **allowed registrant roles** (DL-097, one
> additive migration `event_settings.allowed_registrant_roles`), **scheduled go-live + a live countdown**
> register button (DL-098), **multi-club event listing** (DL-099), **all-data-type responsive resource cards**
> (DL-100), a **Wall-of-Fame credits admin UI** (DL-101), and a **bulk grant/deny permission-override checkbox
> grid** (DL-102). 536 static + lint + build green; a 4-lens adversarial review found + fixed one authz-downgrade
> (admin event-settings form now preloads). **Deferred (operator's build-order choice):** the inline
> edit-on-public-page surface and the live-quiz + real-time (SSE + Redis) subsystem — see `NEXT_TASK.md`.

There is a **THREE-surface** logged-in model (Session 11–13): the public **member** view (`/member`,
plugin-gated, admits inactive), the global **admin/developer** back office (`/admin`, active-only, global
RBAC), and the scoped **coordinator** back office (`/coordinator`, active-only, driven by SCOPED grants via
`lib/rbac/grants.mjs`). The mutation authority is unchanged — every write still goes through the one
`/api/admin/action` registry (or a gated route) and re-authorizes at the true scope.

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
