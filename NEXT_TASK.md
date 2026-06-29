# Next Task

**As of:** 2026-06-29 · **Sessions 1–10 COMPLETE. The V2 portal is feature-complete
and ready to deploy.**

There is **no pending development task** in the original 10-session plan. What
remains is **operator/owner work** (run the live imports + media migration; rotate
the V1 leaked secrets) — all documented in
[docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md) — and **one queued
follow-up session (Session 11)** for two NEW features the operator requested after
Session 10 (which was harden-only, so they were correctly deferred — DL-057).

> To deploy and run the project from zero: **[docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md)**.
> To use the admin panel: **[docs/ADMIN_PANEL_GUIDE.md](docs/ADMIN_PANEL_GUIDE.md)**.

---

## Where is the "login for event participation"? (operator's question)

**Today there is none.** The only authentication surface is the **staff/admin
sign-in at `/admin`** (Google OAuth or email+password, RBAC-gated). A brand-new
Google sign-in creates an `active` account with **no roles** (an admin then grants
one). There is **no public "Login" link in the site nav and no event
RSVP/registration** — event registration was always out of scope (DL-037: "Event
registration/RSVP, if ever needed, is a new capability-9 module"). Building that
public participant flow is **Session 11, item 1** below.

---

## ▶️ SESSION 11 — Student Event-Participation Login + "Wall of Fame" (NEW features)

This is an **additive feature session** (the first beyond the original 10). Run in
automode at ultracode; record material decisions in `docs/DECISION_LOG.md`
(continue from DL-058). **Read first:** `docs/SESSION_PROTOCOL.md`,
`CURRENT_STATUS.md`, this file, `docs/DECISION_LOG.md` (esp. DL-004/006/011 the CMS
spine, DL-013/019 auth, DL-037/038 the "new module = content_type vs standalone
table" rule, DL-040 audience gating, DL-049/050/051 the admin panel), and
`docs/SCHEMA_DESIGN.md`. **Reuse the spine — do NOT build parallel pipelines.**

### Guard rails (unchanged)
- Never `prisma db pull` / `migrate reset`. Any schema change is a **NEW forward
  migration** (Prisma model + a hand-written raw-SQL tail for partial uniques /
  CHECKs / triggers, applied via `npm run db:migrate` — DL-027). New `content_type`
  = a `content_type_def` seed row + a payload table + an in-code handler + the
  startup "every type has a handler" test (DL-006/011).
- Honor DB guards via `mapDbError` (don't re-implement). Authorize FIRST, audit via
  the shared `auditedMutation`, return JSON-safe shapes. Prisma CLI reads `.env` —
  use `db:*` scripts. Neon has high latency + auto-suspends (generous live timeouts).
- Mutations go through the ONE admin route (`POST /api/admin/action` registry,
  DL-050) or a new gated public route; reuse `lib/http/guard.mjs` (CSRF + rate
  limit) on any new public POST. Keep the static suite green + grow it; run the live
  suite once on a warm Neon; finish with a multi-agent adversarial review.

### Item 1 — Student login + Event Participation (RSVP / registration)
Goal: a **public** path for students to sign in and register for an event.
- **Auth:** reuse NextAuth (Google + credentials, JWT, live RBAC — DL-013/019). Add
  a public **"Sign in"** entry point in the site `Header` (distinct from `/admin`),
  and a self-service path: a new Google sign-in already creates an `active`
  no-roles account — give it a default **`student`/`participant`** role (seed a new
  low-privilege role; it grants only self-service participation, no admin/content
  perms). Decide + document whether self-registration is open or invite/domain-
  restricted (e.g. `@iitjammu.ac.in`).
- **Registration model:** a **standalone `event_registration` table** (NOT CMS
  content — same reasoning as DL-038's contact_message): FK to the `event`
  `content_item` + `app_user` (or a name/email for guests if allowed), a status
  (`registered`/`waitlisted`/`cancelled`/`attended`), `created_at`, and a **partial
  unique** so one user can't double-register an event. Optional capacity → a
  count/cardinality guard (mirror DL-009/021's pattern) for waitlisting. Audited.
- **Surfaces:** a "Register" button on the public event view (gated to a signed-in
  participant), a "My registrations" view, and an **admin** "Registrations" tab on
  the event in the panel (list/export/mark-attended) via the `POST /api/admin/action`
  registry + a new `lib/events/registration.mjs` service. Respect audience gating
  (DL-040). Tests: static (validators + cardinality/dedup pure logic) + live
  (register → dup-blocked → cancel → waitlist when full → admin mark-attended).

### Item 2 — "Wall of Fame" (student achievements, hybrid content)
Goal: a public page showcasing student achievements in **hybrid** formats —
plain markdown, markdown + images, full-width banners, link-outs, etc.
- **Model it as a capability-9 CMS module** (the DL-006/011 way): a new
  `content_type='achievement'` (`content_type_def` seed row, `is_year_scoped` so it
  participates in the year engine + Transition Wizard) + an `achievement_payload`
  table + an in-code handler. For the **hybrid/ordered "any way to list it"**
  requirement, store the body as **ordered presentation blocks** in
  `page_block_payload.data` JSONB (DL-016's sanctioned escape hatch) OR a small
  normalized `achievement_block` child table — pick one and document it; block
  kinds: `markdown`, `markdown+image`, `banner`, `embed/link`, `gallery`. Render
  markdown safely (sanitize; no raw HTML injection). Reuse `media_asset` +
  `resolveDeliveryUrl` + `cloudinaryAutoUrl` for images/banners (CWV).
- **Surfaces:** a public data-driven `/wall-of-fame` (Server Component, `force-
  dynamic`, like `/events`), reading a new `lib/achievements/public.mjs`
  (published + current-year + visibility rule, DL-004); a Header nav link; and an
  **admin editor** under Content (the generic registry editor already covers scalar
  payload fields — extend `getContentTypeFieldSpec` + add a block editor for the
  hybrid content, mirroring how list children are handled). Full CMS lifecycle
  (draft/publish/version/restore) comes free from the spine. Tests: static
  (handler payload round-trip + block validation + markdown-sanitize) + live
  (create → publish → visible on the public read → version/restore).

### End-of-Session 11 (mandatory)
Run the END-OF-SESSION checklist (`docs/SESSION_PROTOCOL.md`): update all tracking
docs, record DL-058+, add the migration(s) + seed rows, grow the test suites, run
the review workflow, update `Token_Usage.md`, prepare one specific commit, and
write the handoff. Update the session count (the plan is now 11+).

---

## Operator-owned (run when convenient — see OPERATIONS_RUNBOOK.md)
- Populate the live year: `npm run db:import:org` (~15 min) → `db:import:events` →
  `db:import:resources` (#27).
- Media migration: `npm run db:migrate:media` (dry-run) → `-- --apply`; then the
  safe `/public` prune (#18, runbook §3.1).
- Observe: `npm run db:console [-- --audit]` or `/admin/console`.

## Owner-owned (anytime)
- Rotate/revoke the V1 leaked secrets + clean the root `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md)); then
  remove the `.gitleaks.toml` by-SHA allowlist; consider rotating the Neon password (#19).
