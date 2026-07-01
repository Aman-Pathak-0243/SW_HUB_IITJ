# From a Website to a Platform — What it Was (V1) vs. What it Is Now (V2)

This document contrasts the **original "normal website" (V1)** with the **member platform it
has become (V2)**. It is the plain-English "before and after" — what existed, what was wrong
with it, and what each area turned into.

> **In one line:** V1 was a static marketing site with a fragile create-only events form on
> MongoDB and a hardcoded two-email login. V2 is a full, account-based **member platform** on
> PostgreSQL with live role-based access control, a versioned CMS, an academic-year engine, an
> organization model, a centralized event playground, a wall of fame, member profiles, a
> developer dashboard, an audit trail on every change, tests, and CI — all behind a
> developer-controlled on/off **plugin**.

---

## Table of contents
1. [The V1 website — what it was](#1-the-v1-website--what-it-was)
2. [The V2 platform — what it is now](#2-the-v2-platform--what-it-is-now)
3. [Before → after, area by area](#3-before--after-area-by-area)
4. [What is newly possible in V2 (did not exist at all in V1)](#4-what-is-newly-possible-in-v2-did-not-exist-at-all-in-v1)
5. [How the old site still lives on (the plugin OFF)](#5-how-the-old-site-still-lives-on-the-plugin-off)
6. [The numbers](#6-the-numbers)

---

## 1. The V1 website — what it was

A **Next.js marketing website** for IIT Jammu Student Affairs. It presented information and had
one interactive feature (an events form). Concretely:

- **Purpose:** brochure-style pages — Home, Team, Contact-Us, Flagship Events, hostels, messes,
  and **four near-identical "Clubs" pages** (~400 lines each, copy-pasted).
- **Data:** **MongoDB** via Mongoose. Effectively one interactive collection — `Event` — plus a
  stray junk `queries` document.
- **The one write path:** a **create-only** `POST /api/events`. It had **no authentication
  check** (anyone who could reach it could create events), no real input validation, and it
  stored uploaded images as **base64 data-URLs inside the document** (DB bloat, huge responses).
  Events could not be **edited or deleted**.
- **Auth:** a **hardcoded allowlist of two email addresses** in the auth route — changing an
  admin meant editing code and redeploying; only those two accounts could sign in at all.
  Sign-in was **Google-only**.
- **Rendering:** essentially **every page was a Client Component**, including fully static ones —
  larger bundles, weaker SEO/SSR.
- **Quality/ops:** **no tests, no CI**, three coexisting font systems, an inconsistent brand blue,
  a `~74 MB` `/public` folder shipped with the app, a `pdf.js` version mismatch that risked blank
  PDF previews, a process that **`process.exit(1)`'d the whole server** on a DB connection failure,
  and — most seriously — **live secrets committed in `README.md`** (a token and a GitHub PAT).

In short: informative, but with **no accounts, no roles, no memberships, no event lifecycle, no
history, no audit trail, and a security-critical auth + secrets problem.**

---

## 2. The V2 platform — what it is now

A **member platform** built on the same Next.js front door but re-architected end to end:

- **Next.js 16 (App Router, Server Components)** — data-driven pages render on the server; PII
  never leaves the server unless it must.
- **Neon (serverless PostgreSQL) via Prisma** — a normalized **51-table** relational model with
  triggers, partial-unique constraints, and CHECKs enforcing the rules in the database itself.
- **NextAuth (JWT) with live, per-request RBAC** — authorization is derived **live from the
  database on every protected action** (52 permissions, 11 roles, global or per-unit/per-year
  **scoped** grants, plus per-email overrides). Admins are **data**, changed without a redeploy.
- **A versioned CMS spine** — content is `content_item` + `content_revision` + typed payloads,
  with **draft → publish → unpublish → archive → restore + full version history**. Events,
  announcements, resources, club docs, achievements, and the "events organized" page are all
  **content types** on this one spine.
- **An academic-year engine** — every year of structure and content is preserved; a **Transition
  Wizard** carries the org structure forward into a new year (see
  [ACADEMIC_YEAR_ROLLOVER.md](ACADEMIC_YEAR_ROLLOVER.md)).
- **An organization model** — councils / clubs / hostels / messes / committees as durable
  **lineages** (a club keeps its identity across years) with people and appointments.
- **A centralized Event Playground** — registration + waitlists, rounds, scoring, attendance,
  ranking, closure reports, and CSV downloads; login-only participation.
- **Member surfaces** — a member area, profiles & institute-contribution analytics, a Wall of
  Fame, club/council pages with memberships, and a feedback/support channel.
- **A developer dashboard** — an audit/change-history export, hidden usage analytics, per-table
  storage thresholds, and rate-limited bulk mail.
- **A scoped-coordinator back office** (`/coordinator`) — a club coordinator runs **their own**
  unit's events + members without global admin.
- **Every mutation is audited** — one attributed `audit_log` row per change, through a single
  mutation registry.
- **Hardened + tested** — security headers, CSRF + rate-limiting on write routes, PII-minimized
  reads, **530 automated tests + live-DB suites + a route-render smoke + CI**, and a multi-agent
  adversarial code review each build session.
- **A developer-controlled plugin** — the whole member platform is behind a `member_platform`
  feature flag (off by default, fail-closed).

---

## 3. Before → after, area by area

| Area | V1 (the normal website) | V2 (the platform) |
|------|-------------------------|-------------------|
| **Database** | MongoDB / Mongoose; one interactive collection | Neon PostgreSQL via Prisma; **51 normalized tables**, triggers + constraints |
| **Accounts** | None (no user accounts at all) | Full account lifecycle — admin-provisioned (single + **bulk CSV**), first-login forced password change, request-an-account + admin-mediated password reset |
| **Sign-in** | **Google only**, hardcoded 2-email allowlist | Email + password (argon2id), **data-driven** — any number of accounts; Google kept only when the plugin is OFF |
| **Authorization** | Two emails, in code | **Live per-request RBAC**: 52 permissions, 11 roles, **global or scoped** grants, per-email overrides (deny-wins) |
| **User status** | n/a | `active` / `inactive` / `revoked` + an `allow_normal_view` toggle, enforced live |
| **Events** | **Create-only** API, no auth, base64 images, **can't edit/delete** | A full **Event Playground**: versioned event content + registration/waitlist/rounds/scoring/attendance/ranking/closure + CSV; login-only participation; scoped-coordinator management |
| **Images / media** | base64 blobs inside documents | A **media library** + Cloudinary delivery (`f_auto,q_auto`), with an idempotent, reversible `/public → Cloudinary` migration tool |
| **Announcements** | Static text | A managed board (pinned / audience / publish window) + **club announcements with opt-in sync-to-central** |
| **Clubs / councils** | Four ~400-line copy-pasted static pages | **One data-driven** tabbed page per unit (Overview / Announcements / Events / Achievements / Resources / Documents / Members) over the org model |
| **Memberships** | n/a | `club_membership` (durable, cross-year) + a coordinator bulk-CSV importer that reports (never creates) missing accounts |
| **Achievements** | n/a | A **Wall of Fame** content type with hybrid blocks, credited to a member **or** a club |
| **Profiles** | n/a | Member **profiles + institute-contribution** analytics (events, achievements, roles, participants-reached) |
| **Content editing** | n/a (static + a raw form) | A **versioned CMS** (draft/publish/version/restore) generic over every content type |
| **History across years** | None | An **academic-year engine** + a Transition Wizard + cross-year history reads |
| **Feedback / support** | A junk `queries` doc | A `feedback` table with human ref ids `FB-NNNNN` + a status workflow + a public form |
| **Audit / change tracking** | None | **One attributed audit row per mutation**; a downloadable Action-Log / change-history export |
| **Notifications** | None | A centralized, labelled `notification` queue with human ref ids + assignment tracking |
| **Mail** | None | Rate-limited **bulk mail** with an authorized-sender allowlist (institute SMTP) |
| **Observability** | None | A developer dashboard: usage analytics, per-table storage thresholds, infra-usage/cost estimates |
| **Rendering** | Almost all Client Components | Server Components for data-driven pages (SEO/SSR + PII stays server-side) |
| **Testing / CI** | **None** | **530 static tests + live-DB suites + a route-render smoke + CI**; a per-mode full-site testing SOP |
| **Security** | Secrets in `README.md`, no headers, unauthenticated write API | Security headers, CSRF + rate-limit on writes, PII-minimized reads, gitleaks scanning, escalation guards (the committed V1 secrets are flagged for owner rotation — KNOWN_ISSUES #1) |
| **Deploy resilience** | `process.exit(1)` on DB failure | Reads/aggregators degrade gracefully; a cold/suspended Neon is a reported state, not a crash |
| **On/off** | n/a | The whole platform is a **developer-toggled plugin** (fail-closed) |

---

## 4. What is newly possible in V2 (did not exist at all in V1)

- **Anyone can have an account** (institute email + password), provisioned by admins in bulk.
- **A member has an identity** — a profile, their clubs, their achievements, their event history
  and ranks, and a contribution rollup.
- **Any stakeholder can run an event** end to end — registration with waitlists, multiple rounds,
  scoring + attendance sheets, live rankings, a closure report, and CSV exports.
- **A club coordinator self-serves** — runs their own club's events and manages its members from
  a dedicated `/coordinator` back office, without being a global admin.
- **The institute keeps its history** — every academic year of structure and content is preserved
  and browsable; a wizard rolls structure forward.
- **Every change is accountable** — who did what, when, before/after — exportable for analysis.
- **The data is AI-ready** — clean typed service boundaries + durable ids let a future analytics/
  agent layer read structured data without scraping.

---

## 5. How the old site still lives on (the plugin OFF)

The member platform is a **developer-controlled plugin** (`member_platform`). With it **OFF**, the
site behaves like the **Sessions-1–10 public portal** — the public, data-driven pages render and
the classic Google sign-in works — so the "normal website" experience is never lost; it is the
**baseline** the platform switches on top of. With it **ON**, accounts, the login-only event
playground, the member area, and the Wall of Fame activate. Flag reads **fail closed** (a database
error is treated as OFF).

---

## 6. The numbers

| Metric | V1 | V2 |
|--------|----|----|
| Database tables/collections | ~1 interactive collection | **51 tables** |
| Permissions | 2 hardcoded emails | **52 permissions** |
| Roles | 0 (an allowlist) | **11 roles** (global or scoped) |
| Content types | 0 (a static form) | **13 content types** on one CMS spine |
| Automated tests | **0** | **530 static** + live-DB suites + a route smoke |
| CI | none | push/PR gate + a nightly live job |
| Audited mutations | none | **every** mutation, one attributed row |

*See [Notebook.md](Notebook.md) for the full technical picture, [USER_MANUAL.md](USER_MANUAL.md)
for how to use each feature, and [DELIVERABLES_INDEX.md](DELIVERABLES_INDEX.md) for the full doc map.*
