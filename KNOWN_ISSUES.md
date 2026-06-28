# Known Issues

Defects, risks, and tech debt found during the Phase 0 analysis. Severity:
🔴 critical · 🟠 high · 🟡 medium · ⚪ low. This file is updated after every
milestone. Details for security items are in [docs/SECURITY.md](docs/SECURITY.md).

| # | Sev | Issue | Location | Status |
|---|-----|-------|----------|--------|
| 1 | 🔴 | **Secrets committed in repo.** A 35-char token and a GitHub PAT (`ghp_…`) are in plaintext in `README.md` (commit `1c88312`). Rotate/remove + purge history. CI gitleaks **temporarily allowlists commits `1c88312` + `6459654` by SHA** so it stays green for new work; **remove that allowlist after rotation + purge**. The literal value was briefly copied into Session-1 docs and has been **redacted**. | `README.md` | In progress — owner owns rotation/removal/purge |
| 2 | 🟠 | **`POST /api/events` has no auth check.** Anyone reachable can create events; UI gate doesn't protect the API. | `app/api/events/route.js` | ✅ Resolved (Session 2) — POST gated by `requirePermission('content.create')`. Full Postgres rebuild still in Session 6. |
| 3 | 🟠 | **`/past-events` is broken.** Reads `data.success`/`data.events`, but the API returns a bare array → page always empty. | `app/past-events/page.js` | Open |
| 4 | 🟠 | **`pdfjs-dist` version mismatch.** Code comments require 3.11.174 (3.x worker path `pdf.worker.min.js`); `package.json` declares `^6.0.227` and imports the `.mjs` worker. Risk: blank PDF previews. | `app/components/PdfSlideshow.jsx`, `package.json` | Open |
| 5 | 🟠 | **Base64 images stored in MongoDB.** `/admin` uploads images as data URLs into `Event.image` → DB bloat, large responses, no validation/size limit. | `app/admin/page.js`, `models/Event.js` | Open |
| 6 | 🟡 | **`process.exit(1)` on DB connect failure.** Kills the web server instead of returning 500. | `lib/db.js` | Open |
| 7 | 🟡 | **Fragile connection caching.** Module-level boolean, not the recommended `global`-cached promise; unreliable in serverless/hot-reload. | `lib/db.js` | Open |
| 8 | 🟡 | **Authorization by hardcoded email allowlist.** Changing admins needs a code change + redeploy; only 2 emails can log in at all. | `app/api/auth/[...nextauth]/route.js` | ✅ Resolved (Session 2) — replaced by DB-driven RBAC (`role`/`permission`/`role_assignment`); admins managed as data. |
| 9 | 🟡 | **No input validation/sanitization** on the events API beyond Mongoose `required`. | `app/api/events/route.js` | Open |
| 10 | ⚪ | **Dead/alternate pages** not routed and partly referencing non-existent routes (`/Clubs/Wellness`, `/student-life`). | `app/page1.js`, `app/admin/page2.js` | Open |
| 11 | ⚪ | **Inconsistent brand blue.** `#003087` vs `#003f87` used interchangeably. | multiple | Open |
| 12 | ⚪ | **Three font systems coexist** (Geist via next/font; Cormorant+Outfit via `@import`; Georgia inline) → layout shift, duplicate requests. | `app/layout.js`, several components | Open |
| 13 | ⚪ | **Massive content duplication.** Four Clubs pages are near-identical copies (~400 lines each). | `app/Clubs/*/page.jsx` | Open |
| 14 | ⚪ | **All pages are Client Components**, including fully static ones → larger bundles, weaker SEO/SSR. | `app/**` | Open |
| 15 | ⚪ | **No tests, no CI** anywhere in the repo. | repo-wide | Open |
| 16 | ⚪ | **Events cannot be edited or deleted** (create-only API + UI). | `app/api/events`, `app/admin` | Open |
| 17 | ⚪ | **Unused image hosts** whitelisted (`images.unsplash.com`, `source.unsplash.com`) but not used. | `next.config.mjs` | Open |
| 18 | ⚪ | **`/public` is ~74 MB** shipped with the app (100 images). | `public/` | Open — Media Migration Tool in Session 7 |
| 19 | 🟠 | **Neon DB credential shared in plaintext chat.** Stored correctly in git-ignored `.env.local`, but if the sharing channel isn't private, rotate the Neon password. Never commit it. | `.env.local` | Open — owner to assess |
| 20 | ⚪ | **Undocumented `queries` collection** (1 doc) found in Mongo `test` db during backup; not referenced in V1 source. Decide disposition in Session 6. | MongoDB `test.queries` | Captured in backup; Session 6 |
| 21 | ⚪ | **Central audit-write extension.** `audit_log` table + indexes shipped in Session 2; the single Prisma `$extends` write choke point shipped in **Session 3** (`lib/cms/audit.mjs` mounted in `lib/prisma.mjs`) — every CMS mutation now writes one semantic audit row, and the auto extension covers other single-statement mutations (DL-012/DL-025/DL-028). | `lib/prisma.mjs`, `lib/cms/audit.mjs` | ✅ Resolved (Session 3) |
| 22 | ⚪ | **JWT auth-revocation latency.** Authorization + account status are re-checked live per request, so revoked roles / suspended accounts are blocked immediately for protected actions; but a valid token still *authenticates* for ≤24h after sign-out (no server-side token denylist). Acceptable per DL-019. | `lib/auth/options.mjs` | Accepted (DL-019) |
| 23 | ⚪ | **`lock_guard` covers the four spine tables.** It guards org_unit/appointment/content_item (I/U/D) and content_revision (U/D); per-type `*_payload` rows rely on revision immutability rather than their own lock trigger. Add payload-level guards only if direct payload mutation of locked years becomes a real path. | migration raw-SQL | Accepted (documented) |
| 24 | ⚪ | **Audit writes are best-effort, not transactional.** The SEMANTIC audit row is written AFTER the operation's transaction commits, so a crash between COMMIT and the audit insert loses one audit row (no integrity impact). The AUTO extension writes on the un-extended `base` client, so a single-statement write that a future caller wraps in their OWN interactive `$transaction` which then rolls back would leave an orphan audit row. Atomic multi-step flows use the semantic path and never rely on auto-audit; if stronger guarantees are needed, `recordAudit` already accepts a `tx` to move the write inside the transaction (DL-028). | `lib/cms/audit.mjs` | Accepted (DL-028) |
| 26 | ⚪ | **Transition Wizard: non-atomic by design + two accepted edge behaviors.** `runTransition` copies as idempotent statements (not one big transaction) for Neon-latency resilience (DL-031), so an interrupted run leaves the target year *partially* populated until a re-run completes it (safe: re-runs skip done rows and self-heal partial parent wiring; per-content-item clones are atomic). Two accepted edges: (a) a **forced re-sync with a *changed* singleton-position holder** pre-skips the new holder (the prior target appointment stays for manual reconciliation) rather than aborting on `appointment_singleton_position_uq`; (b) `lockBlockReason`'s not-found branch is defensive/test-only (setYearStatus owns the 404), and the appointment/content copy phases derive the source→target unit map two slightly different ways. None affect correctness. | `lib/year/transition.mjs`, `lib/year/lock.mjs` | Accepted (DL-031; adversarial review) |
| 25 | ⚪ | **Locked-year append-errata path is not exposed via the CMS service.** `lock_guard` deliberately permits a `content_revision` INSERT in a locked year (append errata), but every service lifecycle op also writes `content_item`, which `lock_guard` blocks — so the supported errata flow is unlock→correct→relock (DL-026), or a raw `content_revision` insert. A dedicated append-revision service function can be added if the append path becomes a real requirement. | `lib/cms/content.mjs` | Accepted (documented) |

## Notes
- **Database pivot context:** several V1 issues are resolved by the move to
  PostgreSQL/Prisma rather than patched in place — #2 (events API auth) and #8
  (allowlist) → **✅ resolved in Session 2** (auth/RBAC); #5/#9/#16 (base64 images, validation,
  no edit/delete) and #3 (past-events contract) → **Session 6** (events rebuilt on
  Postgres); #6/#7 (Mongoose connection) become moot once Mongoose is retired.
- #4 (pdf.js) and #11/#12 (brand blue, fonts) are UI/library issues addressed when
  the relevant pages are reworked (Sessions 5–9 / 10).
- See [docs/MILESTONE_PLAN.md](docs/MILESTONE_PLAN.md) for session mapping.
