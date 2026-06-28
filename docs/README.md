# IIT Jammu Student Affairs Portal — Documentation

This `/docs` directory is the single source of truth for the IIT Jammu Student
Affairs Portal. It documents the project **exactly as it exists today** (the
"as-is" state, extracted from the repository) and lays out the **target design**
and **milestone plan** for Portal V2.0.

> **Status:** V2 is built across **10 sessions** — see
> [SESSION_PROTOCOL.md](SESSION_PROTOCOL.md). **Session 1 (Analysis +
> Documentation + Architecture) is complete.** No application code has been
> changed yet; Session 1 added docs, the verified backup, security scanning, and
> the **verified PostgreSQL schema design**.
>
> **Database:** V2 uses **PostgreSQL (Neon) + Prisma** (V1 used MongoDB/Mongoose).
> The target data model is in [SCHEMA_DESIGN.md](SCHEMA_DESIGN.md).
>
> **Start here if you are a new session:** read [SESSION_PROTOCOL.md](SESSION_PROTOCOL.md),
> then `CURRENT_STATUS.md` / `NEXT_TASK.md` / `TODO.md`.

---

## How this documentation is organized

### Part A — The system as it exists today (facts only)

| Document | What it covers |
|---|---|
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | What the portal is, who it serves, the stack |
| [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md) | Folder structure, routing, rendering, data flow |
| [DATA_INVENTORY.md](DATA_INVENTORY.md) | Every piece of hardcoded data, all assets, Cloudinary usage |
| [API_SPECIFICATION.md](API_SPECIFICATION.md) | The existing HTTP endpoints |
| [DATABASE_DESIGN.md](DATABASE_DESIGN.md) | The current Mongoose/MongoDB schema |
| [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md) | How login works today |
| [COMPONENTS.md](COMPONENTS.md) | Shared and page-level React components |
| [STYLING_THEME_TYPOGRAPHY.md](STYLING_THEME_TYPOGRAPHY.md) | Colors, fonts, styling approach |
| [DEPLOYMENT.md](DEPLOYMENT.md) | How the site is currently built and hosted |
| [SECURITY.md](SECURITY.md) | Current security posture + critical findings |

### Part B — The target system (proposed, pending approval)

| Document | What it covers |
|---|---|
| [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md) | What V2.0 must do (PRD) |
| [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) | V2 architecture: org model, academic-year engine, CMS, admin panel, developer console, media |
| [SCHEMA_DESIGN.md](SCHEMA_DESIGN.md) | **The verified PostgreSQL/Prisma data model — ER diagram, 33 tables, reasoning** |
| [DATA_MIGRATION_REPORT.md](DATA_MIGRATION_REPORT.md) | V1 → V2 item map: what becomes CMS/DB-managed vs static |
| [MIGRATION_PLAN.md](MIGRATION_PLAN.md) | How current data/assets move to V2 safely |
| [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) | Backup, restore, rollback strategy |
| [TESTING_STRATEGY.md](TESTING_STRATEGY.md) | The testing gate every milestone must pass |
| [PERFORMANCE.md](PERFORMANCE.md) | Performance budget and techniques |
| [RESPONSIVE_DESIGN.md](RESPONSIVE_DESIGN.md) | Breakpoints and responsive requirements |

### Part C — Living guides and logs

| Document | What it covers |
|---|---|
| [SESSION_PROTOCOL.md](SESSION_PROTOCOL.md) | **The 10-session model + start/end-of-session checklists (read first)** |
| [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) | How to set up, run, and extend the project |
| [ADMIN_GUIDE.md](ADMIN_GUIDE.md) | How administrators will manage the portal |
| [DECISION_LOG.md](DECISION_LOG.md) | **Detailed decision log (Decision/Alternatives/Why/Trade-offs/Future impact)** |
| [ARCHITECTURAL_DECISIONS.md](ARCHITECTURAL_DECISIONS.md) | Lightweight ADR index (see DECISION_LOG for detail) |
| [Token_Usage.md](Token_Usage.md) | Per-session token usage log (updated every session) |
| [CHANGELOG.md](CHANGELOG.md) | Human-readable change history |
| [MILESTONE_PLAN.md](MILESTONE_PLAN.md) | **The V2.0 roadmap — start here for the plan** |

### Root-level tracking files (live status, updated every milestone)

These live at the **repository root** (not in `/docs`) so they are easy to find:

- `CURRENT_STATUS.md` — where the project stands right now
- `NEXT_TASK.md` — the single next action awaiting execution/approval
- `TODO.md` — backlog grouped by milestone
- `KNOWN_ISSUES.md` — bugs, risks, and tech debt in the current code
- `PROGRESS.md` — milestone-by-milestone completion log

---

## Documentation update protocol

Per the project's master specification, after **every completed milestone** the
following must be updated in the same change set as the code:

1. Affected Part A / Part B documents (architecture, API, database, etc.)
2. `CHANGELOG.md` (a new dated entry)
3. `ARCHITECTURAL_DECISIONS.md` (if a decision was made)
4. Root tracking files: `CURRENT_STATUS.md`, `NEXT_TASK.md`, `TODO.md`,
   `KNOWN_ISSUES.md`, `PROGRESS.md`

A milestone is **not complete** until its documentation and tests are updated.

---

## Conventions

- **Facts vs. proposals:** Part A states only what is in the repository today.
  Anything proposed for V2 is explicitly marked *(proposed)* or lives in Part B.
- **Academic Year:** The current data set belongs to academic year **2025–26**.
- **Accuracy:** If a statement here ever conflicts with the code, the code wins —
  open an issue and correct the doc.
