# The IIT Jammu Student Affairs Portal — Evolution & Feature Overview

*How a hardcoded marketing site became a full, self-managed institute platform — and everything it now does.*

The website currently live at **sw.iitjammu.ac.in** is the **static V1**, built earlier by the
Student Affairs team. **V2 — this portal — is a complete, ground-up rebuild.** It turns a
site that only developers could change into a platform the office runs, edits, and operates
itself: accounts and roles, a content-management system, an events engine with live
leaderboards, live quizzes, and admin/developer back-offices.

---

## 1. The leap: V1 → V2

| | **V1 — static site** | **V2 — the platform** |
|---|---|---|
| Content | Hardcoded in the code | Edited in-browser by staff (CMS, draft → publish, version history) |
| Who can update it | Developers only | Any authorized staff/coordinator, scoped to their unit |
| Accounts | 2 hardcoded admin logins | Full accounts, ~50-permission RBAC, per-email overrides |
| Data | MongoDB, ad-hoc | PostgreSQL 16 + Prisma, 55 tables, migrations, audited |
| Events | A static list | Registration + waitlist, rounds, scoring, live leaderboards, attendance, exports, closure reports |
| Quizzes | — | Live, server-scored quizzes with a real-time leaderboard |
| Structure | Flat pages | Councils / clubs / hostels / messes as a real org model, per academic year |
| Operations | Manual | Developer console: monitoring, audit log, backups, storage, usage |
| Years | — | Academic-year engine + a Transition Wizard to roll year-to-year |

---

## 2. By the numbers

A sense of the scale of the build:

| Metric | Value |
|---|---|
| Development sessions | **16** (≈ 24 milestones) |
| Source files (app / lib / scripts / tests) | **300** |
| Lines of code | **~42,000** |
| Database tables | **55** (across **13** migrations) |
| Public pages + route surfaces | **46** page routes · **15** API routes |
| React components | **27** shared + page-level |
| Domain logic modules (`lib/`) | **103** |
| Automated test files | **63** (**580+** unit tests + live-database suites) |
| End-to-end event simulations | **45 / 45** checks passing |
| Documentation files | **57** (36 in `docs/` + 21 at the root) |
| RBAC catalog | **52** permissions · **11** roles · **13** content types |

Every feature is backed by tests, and the whole product is documented — from architecture and
schema to an operator runbook and this evolution log.

---

## 3. How it was built — the session-by-session evolution

The portal was built in disciplined, self-contained sessions. Each one delivered a working
slice, was reviewed, and was tested before the next began.

| Session | Focus | What shipped |
|---|---|---|
| **1** | Analysis & architecture | Studied V1, wrote the documentation, designed the PostgreSQL/Prisma schema |
| **2** | Foundation | Database + Prisma, NextAuth authentication, dynamic role-based access control |
| **3** | CMS | Draft/publish lifecycle, version history, revision diff, a central audit trail, public-visibility rules |
| **4** | Academic-year engine | Year context & history, the Transition Wizard, lock/unlock, public year selector |
| **5** | Organization model | Councils/clubs/hostels/messes + people + appointments, a V1 importer, data-driven org pages |
| **6** | Events & announcements | CMS-backed events/announcements, importer, data-driven public pages |
| **7** | Resources & media | Resource library, Cloudinary media service, a reversible `/public` → Cloudinary migration tool |
| **8** | Developer console | Audit-log viewer, monitoring/status, cost/test reports, a backup ledger + recovery delegates |
| **9** | Admin panel | An RBAC-gated UI over every service, plus a net-new users/roles management backend |
| **10** | Testing & deployment | CI, performance/brand polish, CSRF + rate-limiting, security headers, the operator runbook |
| **11** | Member platform (M0–M8) | Accounts behind a plugin, RBAC categories + overrides, account status, notifications/feedback + a developer dashboard, club/council pages + memberships, the **Wall of Fame**, the **Events Playground**, and member profiles |
| **12** | Consolidation | A full-site test gate, a per-role audit, and hardening (11 bug fixes) |
| **13** | Coordinator surface | A scoped `/coordinator` back-office + client-delivery docs |
| **14** | Quick wins | Event registration, resources & Wall-of-Fame improvements, RBAC additions, hosting requirements |
| **15** | Inline editing | Edit-on-the-public-page for authorized editors (role + jurisdiction gated) |
| **16** | Real-time | **Live quizzes & live leaderboards** (self-hosted SSE, optional Redis) |

---

## 4. What's inside — feature inventory

### Public website
- Home, Team directory, Hostels & Messes (with PDF galleries), Contact
- Announcements board, past/upcoming events, Flagship Events
- The organization structure — councils, clubs, hostels, messes — as tabbed, data-driven pages
- A Resources library and a **Wall of Fame** for achievements
- Safe, XSS-hardened markdown rendering for club/council documents

### Accounts & security
- Email/password sign-in (Argon2id hashing) with optional Google sign-in
- Password policy, forced first-login password change, account lifecycle (active / inactive / revoked)
- Admin-mediated password resets and an account-request queue
- CSRF protection, rate-limiting, and security headers

### Roles & permissions (RBAC)
- A ~50-permission catalog with 11 seeded roles
- Per-email permission overrides (grant/deny a single permission)
- Jurisdiction-scoped grants so a coordinator manages only their own club

### Content management (CMS)
- 13 schema-driven content types with draft → publish, version history, restore, and diff
- A central audit trail on every change; visibility rules for the public site
- **Inline edit-on-page** for authorized editors, gated by role and jurisdiction

### Events engine
- Self-service registration with **capacity → waitlist → auto-promote**
- Multiple rounds, manual scoring, and a **live overall leaderboard** ranked on cumulative performance
- Attendance (optional per event), CSV exports (participants / ranking / scores / attendance)
- Closure reports with central review; co-organizer / collaborator tagging for joint events

### Live quizzes
- Question bank with an **answer key** (never shown to players)
- A hosted live session (start → question → reveal → …) with a **server-authoritative timer**
- **Automatic scoring** (correctness + speed bonus) and a **real-time leaderboard**

### Back-offices
- **Coordinator** surface — manage your own unit's events, members, and content
- **Admin panel** — RBAC-gated UI over users, roles, content, organization, years, media, mail, feedback
- **Developer console** — system status, audit log, cost/test reports, backups, per-table storage thresholds, usage analytics

### Members
- Member self-profiles showing roles, affiliations, event participation, points, rank, and achievements
- Institute-contribution aggregation per member / club / entity

### Operations
- Academic-year rollover via a Transition Wizard
- Backup & recovery, monitoring, and a documented single-VM deployment path

---

## 5. Engineering rigor

Effort went into quality, not just features:

- **Every milestone was reviewed before moving on** — an adversarial, multi-perspective code
  review with independent verification of each finding, and confirmed issues fixed in the same
  change set.
- **A full test gate** — 580+ unit tests plus live-database suites that exercise the real
  Postgres guards (triggers, unique constraints, concurrency locks), run per-file for isolation.
- **A per-role security audit** and hardening pass (CSRF, rate-limiting, security headers,
  privilege-escalation guards).
- **End-to-end simulations** — the entire event lifecycle (a 50-participant hackathon, a live
  quiz, and coding/robotics/collaboration events) was executed against the database and passed
  **45 / 45** checks, and is re-runnable.

---

## 6. Where it stands today

**Feature-complete, tested, and ready to deploy.** The production build, linting, unit suites,
and live-database suites all pass; the events and quiz flows are proven end-to-end; and the
hosting path is documented for a single institute VM. Going live is a straightforward cutover
of **sw.iitjammu.ac.in** to the new server.

---

*See also: [WEBSITE_V1_VS_V2.md](WEBSITE_V1_VS_V2.md) (detailed V1↔V2 comparison) ·
[docs/README.md](docs/README.md) (full documentation) ·
[simulations/README.md](simulations/README.md) (run an event yourself) ·
[systemRequirements.md](systemRequirements.md) (hosting).*
