# Portal V2.0 — Milestone Plan (Living Document)

> **This is a living document.** It is updated at the end of every session. The
> original delivery model was **10 sessions** (see
> [SESSION_PROTOCOL.md](SESSION_PROTOCOL.md)) — **all 10 are now complete.** A new,
> operator-requested **member-platform program (Session 11+)** extends the plan into
> an open-ended series; its durable design is in
> [MEMBER_PLATFORM_PLAN.md](MEMBER_PLATFORM_PLAN.md).

**Legend:** ✅ done · ⏳ next · ⬜ pending

| Session | Theme | Status |
|---|---|---|
| 1 | Analysis + Documentation + Architecture | ✅ |
| 2 | Database + Prisma + RBAC + Authentication | ✅ |
| 3 | CMS Foundation | ✅ |
| 4 | Academic Year Engine | ✅ |
| 5 | Organization Model (Clubs, Councils, Hostels, Mess) | ✅ |
| 6 | Events + Announcements | ✅ |
| 7 | Resources + Media | ✅ |
| 8 | Developer Console | ✅ |
| 9 | Admin Panel | ✅ |
| 10 | Testing + Deployment + Optimization + Handover | ✅ |
| 11 | **Member Platform M0** — auth & account lifecycle (email+password) + the developer-controlled **PLUGIN** control plane (`feature_flag`/`member_platform`) | ✅ |
| 12+ | Member platform remainder — **M2** (RBAC categories + per-email overrides + smart search) next, then M1 status modes, M3 club pages+memberships, M4 Wall of Fame, M5 Event Playground, M6 profiles, M7 notifications/feedback, M8 dev dashboard | ⏳ next (M2) |

Each session must pass the relevant parts of the quality gate
([TESTING_STRATEGY.md](TESTING_STRATEGY.md)) and validate responsiveness
([RESPONSIVE_DESIGN.md](RESPONSIVE_DESIGN.md)) for any UI it ships.

---

## ✅ Session 1 — Analysis + Documentation + Architecture

- **Objective:** Understand the project; document it; design the V2 architecture
  and the **PostgreSQL (Neon) + Prisma** data model; establish the working
  protocol. No application code changed.
- **Delivered:**
  - Full repo analysis + `/docs` (as-is + target).
  - **Security scanning** (gitleaks CI + runbook); secrets owner-owned.
  - **Verified pre-migration backup** including the live Mongo `events` (3) +
    `queries` (1) collections (`backups/…`, VERIFY: PASS).
  - **Database pivot decided:** MongoDB → PostgreSQL on Neon, Mongoose → Prisma.
  - **Normalized schema designed + adversarially verified** →
    [SCHEMA_DESIGN.md](SCHEMA_DESIGN.md) (ER diagram + reasoning).
  - [DATA_MIGRATION_REPORT.md](DATA_MIGRATION_REPORT.md),
    [DECISION_LOG.md](DECISION_LOG.md), [SESSION_PROTOCOL.md](SESSION_PROTOCOL.md).
- **Acceptance:** Docs accurate; schema verified against all 9 capabilities;
  backup verified. ✅

---

## ⏳ Session 2 — Database + Prisma + RBAC + Authentication

- **Objective:** Make the verified schema real and stand up identity/access.
- **Scope:**
  - Add Prisma; translate [SCHEMA_DESIGN.md](SCHEMA_DESIGN.md) into
    `prisma/schema.prisma`; configure Neon (`DATABASE_URL` pooled +
    `DIRECT_URL` unpooled for migrations).
  - First migration; seed: current `AcademicYear` (2025-26), base `Role`s +
    `Permission`s, a bootstrap Developer/Super-Admin.
  - NextAuth with Prisma adapter; **Google + email/password**, one account per
    email (account linking); server-side **dynamic RBAC** enforcement util.
  - Replace the V1 hardcoded email allowlist (KNOWN_ISSUES #8).
- **Depends on:** Session 1.
- **Acceptance:** `prisma migrate` runs on Neon; seeds present; both sign-in
  methods resolve to one user; protected routes enforce roles; auth + permission
  tests pass.
- **Docs to update:** DATABASE_DESIGN, AUTHENTICATION_AND_RBAC, DEVELOPER_GUIDE,
  DECISION_LOG, CHANGELOG, tracking files.

---

## ⬜ Session 3 — CMS Foundation

- **Objective:** The content backbone: draft/publish + version history + audit.
- **Scope:** Implement the content lifecycle (draft → review → published →
  archived), version-history tables/flow (view/diff/restore), audit logging on
  all mutations, and a generic, schema-driven editing layer.
- **Depends on:** Session 2.
- **Acceptance:** A sample content type round-trips draft→publish, versions are
  recorded and restorable, every mutation is audited; tests cover the lifecycle.
- **Docs:** TARGET_ARCHITECTURE (CMS), SCHEMA_DESIGN (if refined), DECISION_LOG,
  CHANGELOG, tracking files.

---

## ⬜ Session 4 — Academic Year Engine

- **Objective:** Year as a first-class dimension + the Transition Wizard.
- **Scope:** Current-year context server-side; history queries; **Transition
  Wizard** (copy a year's structure forward, optionally copy content, edit
  deltas); public year selector; past years read-only.
- **Depends on:** Sessions 2–3.
- **Acceptance:** New year copies structure correctly; prior years immutable;
  tests cover copy + isolation + history.
- **Docs:** TARGET_ARCHITECTURE, ADMIN_GUIDE, DECISION_LOG, CHANGELOG, tracking.

---

## ⬜ Session 5 — Organization Model (Clubs, Councils, Hostels, Mess)

- **Objective:** Generic org units + positions/appointments; migrate hardcoded
  content.
- **Scope:** Org types/units (hierarchical), positions, appointments, people;
  migrate the V1 hardcoded councils/clubs/hostels/messes/team into the DB (per
  [DATA_MIGRATION_REPORT.md](DATA_MIGRATION_REPORT.md)); data-driven public
  pages (one `<OrgUnitPage>` replacing the four near-duplicate Clubs pages).
- **Depends on:** Sessions 2–4.
- **Acceptance:** Create/rename/archive units + positions + appointments with no
  code changes; public pages render from DB with no visual regression; migration
  tests + counts match the inventory; rollback verified.
- **Docs:** DATA_MIGRATION_REPORT, DATA_INVENTORY, SCHEMA_DESIGN, DECISION_LOG,
  CHANGELOG, tracking.

---

## ⬜ Session 6 — Events + Announcements

- **Objective:** Replace the V1 events feature properly.
- **Scope:** Year-scoped, draft/publish, paginated events + announcements
  (schedule/pin/audience); migrate the backed-up Mongo `events` (3) into Postgres
  with `academicYearId=2025-26`; fix the V1 bugs (auth on writes, `/past-events`
  contract, no base64 in DB → Cloudinary refs). Decide disposition of the
  `queries` collection (1 doc) — see DATA_MIGRATION_REPORT.
- **Depends on:** Sessions 2–5.
- **Acceptance:** Events/announcements CRUD with RBAC; migrated events visible;
  pagination + API/DB tests pass; no base64-in-DB.
- **Docs:** API_SPECIFICATION, DATABASE_DESIGN, KNOWN_ISSUES, DECISION_LOG,
  CHANGELOG, tracking.

---

## ⬜ Session 7 — Resources + Media

- **Objective:** Resources + media consolidation.
- **Scope:** `Resource` (PDFs/links per unit + year); `MediaAsset` + validated
  Cloudinary uploads; **Admin Media Migration Tool** (`/public` → Cloudinary,
  reversible, references preserved). `/public` not reorganized outside the tool.
- **Depends on:** Sessions 2–6.
- **Acceptance:** Resources managed per unit/year; media uploads validated; tool
  migrates a sample and reverses it; tests cover upload + migrate + rollback.
- **Docs:** TARGET_ARCHITECTURE (media), MIGRATION_PLAN, ADMIN_GUIDE,
  DECISION_LOG, CHANGELOG, tracking.

---

## ⬜ Session 8 — Developer Console

- **Objective:** Operational visibility/control for the Developer role.
- **Scope:** Health dashboard; infra/DB/storage/app/API monitoring; resource
  usage; logs; **audit trail** viewer; testing reports; deployment status;
  backup/restore/rollback UI; migration tools; documentation viewer;
  diagnostics; **cost/infra estimation** with provider pricing links.
- **Depends on:** Sessions 2–7.
- **Acceptance:** Console surfaces real data; audit trail visible; backup/restore
  operable from UI; access restricted to Developer.
- **Docs:** TARGET_ARCHITECTURE (dev console), DEPLOYMENT, BACKUP_AND_RECOVERY,
  DECISION_LOG, CHANGELOG, tracking.

---

## ⬜ Session 9 — Admin Panel

- **Objective:** Full RBAC-gated admin UI over everything built.
- **Scope:** Modules for users & roles, academic years (+ Wizard), organizations,
  clubs/councils/hostels/messes, events, announcements, resources, media,
  permissions — all gated; usable end-to-end by non-developers.
- **Depends on:** Sessions 2–8.
- **Acceptance:** Admins perform routine changes with no code changes; permission
  tests confirm gating; responsive + manual QA pass.
- **Docs:** ADMIN_GUIDE, TARGET_ARCHITECTURE, DECISION_LOG, CHANGELOG, tracking.

---

## ⬜ Session 10 — Testing + Deployment + Optimization

- **Objective:** Hit the quality bar and ship.
- **Scope:** Full automated test gate (unit/integration/API/DB/permission/auth/
  migration/backup-restore/responsive/cross-browser/performance) + manual QA;
  performance/CWV; deploy hardening (health check, rollback, backup-before-deploy,
  CI); final docs pass + handover.
- **Depends on:** all prior sessions.
- **Acceptance:** Full gate green; CWV budgets met across breakpoints; docs
  complete; a new maintainer can set up/run/extend from docs alone.
- **Docs:** TESTING_STRATEGY, PERFORMANCE, RESPONSIVE_DESIGN, DEPLOYMENT,
  CHANGELOG (release), all final pass.

---

## ⏳ Session 11+ — Member Platform (multi-session program)

- **Objective:** Turn the portal into a member platform: admin-provisioned accounts,
  rich RBAC, club spaces, a Wall of Fame, an advanced event playground, member
  profiles, centralized notifications/feedback, and a fuller developer dashboard.
- **Scope (one module ≈ one session; full design in
  [MEMBER_PLATFORM_PLAN.md](MEMBER_PLATFORM_PLAN.md)):**
  - **M0** Auth pivot — **email+password ONLY** (remove Google), admin-provisioned
    (single + bulk CSV, external-mail delivery, `must_change_password`,
    admin-mediated forgot/reset, account-request flow, user deletion).
  - **M1** User status `active`/`inactive`/`revoked` + public / admin-dash /
    dev-dash surfaces + scoped route RBAC.
  - **M2** RBAC role "categories" + a `user_permission_override` (grant/**deny** —
    revises DL-026) + email-format debounced smart search.
  - **M3** Club detail pages (overview/past-events/achievements/resources/upcoming/
    announcements/misc-markdown + custom roles) + `club_membership` bulk upload.
  - **M4** Wall of Fame (`content_type='achievement'`, hybrid blocks) +
    achievement↔user/club mapping.
  - **M5** Centralized **Event Playground** — any event type by any stakeholder;
    organizers/collaborators/eligibility; rounds + scores + attendance + live
    ranking; hybrid problem statements; registration (dedup/capacity/waitlist);
    category tags; CSV downloads; markdown closure report + admin review; login-only;
    performance-tuned.
  - **M6** Member profiles + participation/achievement/performance tracking.
  - **M7** Centralized notifications (unique ref ids, assignment-tracked) + feedback/
    issues + central & club announcements (sync) + past/current/upcoming listing.
  - **M8** Developer dashboard — cross-domain action + hidden usage tracking
    (download + purge), per-table size thresholds + per-table backup, Neon/Cloudinary
    resource monitoring, nodemailer bulk/rate-limited mail (progress + authorized
    senders).
- **Cross-cutting:** every multi-stakeholder/cross-domain action audited; data +
  service boundaries kept clean for a future AI agent layer.
- **Depends on:** all of Sessions 1–10.
- **Acceptance (per module):** migration(s) + seed; static + live tests; adversarial
  review; responsive + themed UI; docs + decision log updated; clean handoff.
- **Authoritative prompt:** [`NEXT_TASK.md`](../NEXT_TASK.md).

---

## Cross-session invariants

- **Backup before destructive change.** A verified backup must precede any
  migration that alters data ([BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)).
- **Nothing overwritten.** Academic-year history is preserved.
- **No secrets in git.** Credentials live in `.env.local`.
- **Docs never lag code.** End-of-session checklist is mandatory.
- **Record decisions.** Every major decision → [DECISION_LOG.md](DECISION_LOG.md).
