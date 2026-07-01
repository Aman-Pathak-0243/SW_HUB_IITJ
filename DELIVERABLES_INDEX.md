# Deliverables Index — every Markdown document in the project

This is the master map of **all** Markdown documents shipped with the IIT Jammu Student
Affairs **Member Platform**, grouped by audience, each with a one-line description of what
it contains. Start here to find the right document.

> **New to the project?** Read, in order: **[Notebook.md](Notebook.md)** (the whole platform),
> **[USER_MANUAL.md](USER_MANUAL.md)** (how to use it), **[CLIENT_INSTRUCTIONS.md](CLIENT_INSTRUCTIONS.md)**
> (how to take delivery + go live). Investors: **[INVESTOR_EMAIL.md](INVESTOR_EMAIL.md)**.

---

## 1. Client-facing delivery set (repo root) — produced for hand-over

| File | What it is |
|------|------------|
| [Notebook.md](Notebook.md) | **Everything about the website** — the comprehensive technical + product notebook: architecture, the full data model, RBAC, every module (Sessions 1–10 + M0–M8 + the coordinator surface), the three logged-in surfaces, audit/observability, operations, testing, and known limitations. |
| [USER_MANUAL.md](USER_MANUAL.md) | The end-user + stakeholder manual — features, the **11-role × 3-status access matrix**, step-by-step how-to guides per role, and the detailed **event-organizing engine** help guide. |
| [RESOURCES.md](RESOURCES.md) | Infrastructure resources + **capacity** + the **sizing rationale** (why that much of each) + free-tier headroom + **where to see live prices** (official pricing URLs) + how to monitor usage. |
| [INVESTOR_EMAIL.md](INVESTOR_EMAIL.md) | A ready-to-send email to a prospective **investor/buyer** — the problem, the full feature set, engineering quality that de-risks the purchase, the AI-ready data design, the low operating cost, and next steps. |
| [ANNOUNCEMENT_EMAIL.md](ANNOUNCEMENT_EMAIL.md) | A ready-to-send **announcement email** to the institute community — the portal is now a full member platform (accounts, event playground, wall of fame, profiles, coordinator tools) and how to get started. |
| [CLIENT_INSTRUCTIONS.md](CLIENT_INSTRUCTIONS.md) | The **hand-over / go-live runbook** — what's delivered, prerequisites, exact setup commands, the go-live checklist, operator/owner tasks, day-2 operations, and the final acceptance checklist. |
| [DELIVERABLES_INDEX.md](DELIVERABLES_INDEX.md) | **This file** — the index of every Markdown document with a short description. |

---

## 2. Live project tracking (repo root)

| File | What it is |
|------|------------|
| [README.md](README.md) | Repository entry point / project overview. *(Note: contains V1 leaked secrets pending owner rotation — see KNOWN_ISSUES #1.)* |
| [CURRENT_STATUS.md](CURRENT_STATUS.md) | Where things stand right now — the per-session "what is done" log; the single source of current truth. |
| [NEXT_TASK.md](NEXT_TASK.md) | The single next action + the authoritative program prompt; the operator/owner backlog. |
| [TODO.md](TODO.md) | The backlog, grouped by session, with done/pending checkboxes. |
| [KNOWN_ISSUES.md](KNOWN_ISSUES.md) | Every defect, risk, and accepted limitation, with severity and resolution status. |
| [PROGRESS.md](PROGRESS.md) | High-level progress notes across the build. |

## 3. Working notes / prompts (repo root — historical, not client docs)

| File | What it is |
|------|------------|
| [MASTER_PROMPT.md](MASTER_PROMPT.md) | The originating master build prompt. |
| [CEO_Suggestions.md](CEO_Suggestions.md) | Stakeholder suggestions captured during the build. |
| [session11starter.md](session11starter.md) | The Session-11 (member-platform program) kickoff prompt. |
| [M1session.md](M1session.md) | Working notes for the M1 (user status) module session. |

---

## 4. Engineering & architecture docs (`docs/`)

| File | What it is |
|------|------------|
| [docs/README.md](docs/README.md) | Index of the `docs/` documentation set. |
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | High-level overview of the project and its goals. |
| [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md) | The multi-session build contract + the session roadmap/status table (start/end checklists). |
| [docs/MILESTONE_PLAN.md](docs/MILESTONE_PLAN.md) | The living roadmap of sessions/milestones. |
| [docs/MEMBER_PLATFORM_PLAN.md](docs/MEMBER_PLATFORM_PLAN.md) | The durable design for the Session-11+ member-platform program (M0–M8). |
| [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md) | The product requirements (PRD) for V2. |
| [docs/CURRENT_ARCHITECTURE.md](docs/CURRENT_ARCHITECTURE.md) | The as-is (V1) architecture at analysis time. |
| [docs/TARGET_ARCHITECTURE.md](docs/TARGET_ARCHITECTURE.md) | The V2 target architecture (Next 16 / Neon / Prisma / NextAuth / Cloudinary). |
| [docs/ARCHITECTURAL_DECISIONS.md](docs/ARCHITECTURAL_DECISIONS.md) | Architecture decision records (companion to the decision log). |
| [docs/DECISION_LOG.md](docs/DECISION_LOG.md) | The full decision log (DL-001 … DL-096) — decision / alternatives / why / trade-offs / future impact. |
| [docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md) | The PostgreSQL/Prisma schema design + ER reasoning (the durable-lineage + CMS-spine patterns). |
| [docs/DATABASE_DESIGN.md](docs/DATABASE_DESIGN.md) | Database design notes (tables, indexes, guards). |
| [docs/DATA_INVENTORY.md](docs/DATA_INVENTORY.md) | Inventory of the V1 data that was analyzed/migrated. |
| [docs/DATA_MIGRATION_REPORT.md](docs/DATA_MIGRATION_REPORT.md) | The V1→V2 data-migration report. |
| [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md) | The migration plan/strategy. |
| [docs/AUTHENTICATION_AND_RBAC.md](docs/AUTHENTICATION_AND_RBAC.md) | Authentication (NextAuth JWT) + the live per-request RBAC model (roles, permissions, scopes, overrides). |
| [docs/API_SPECIFICATION.md](docs/API_SPECIFICATION.md) | The API surface (routes, the one mutation registry, gated endpoints). |
| [docs/COMPONENTS.md](docs/COMPONENTS.md) | The UI component inventory. |
| [docs/STYLING_THEME_TYPOGRAPHY.md](docs/STYLING_THEME_TYPOGRAPHY.md) | Styling, theme (brand blue `#003f87`), and typography. |
| [docs/RESPONSIVE_DESIGN.md](docs/RESPONSIVE_DESIGN.md) | Responsive-design approach. |
| [docs/PERFORMANCE.md](docs/PERFORMANCE.md) | Performance strategy (keyset pagination, Server Components, Cloudinary f_auto/q_auto, indexes). |
| [docs/SECURITY.md](docs/SECURITY.md) | Security posture, the secret-scanning setup, and security decisions. |

## 5. Operations, testing & guides (`docs/`)

| File | What it is |
|------|------------|
| [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md) | The operator runbook — deploy, setup, the live-data imports, media migration, backups, recovery. |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment guide (Vercel / institute VM, env vars, headers). |
| [docs/ADMIN_PANEL_GUIDE.md](docs/ADMIN_PANEL_GUIDE.md) | How to use the admin panel — sign-in, URLs, roles, bootstrap. |
| [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md) | Administrator guide (companion to the panel guide). |
| [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md) | Developer setup + workflow guide. |
| [docs/DEV_CLI.md](docs/DEV_CLI.md) | The developer CLI (`npm run cli` / `db:console`) reference. |
| [docs/BACKUP_AND_RECOVERY.md](docs/BACKUP_AND_RECOVERY.md) | Backup + recovery procedures (the `backup_record` ledger + delegates). |
| [docs/TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md) | The automated test strategy (static + live DB suites + CI). |
| [docs/WEBSITE_TESTING_SOP.md](docs/WEBSITE_TESTING_SOP.md) | The repeatable full-site, per-mode functional test procedure (the 11-role × 3-status matrix + four layers). |
| [docs/CONSOLIDATION_BUGLOG.md](docs/CONSOLIDATION_BUGLOG.md) | The Session-12 full-site bug audit log (21 findings → 11 fixed / 10 accepted). |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | The dated changelog of what shipped each session. |
| [docs/Token_Usage.md](docs/Token_Usage.md) | Per-session measured subagent-token usage + `/cost` totals. |
| [docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md) | The owner runbook for purging the V1 leaked secrets from git history (KNOWN_ISSUES #1). |

---

*Generated in Session 13 (2026-07-01). If a document is added or renamed, update this index.*
