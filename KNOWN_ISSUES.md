# Known Issues

Defects, risks, and tech debt found during the Phase 0 analysis. Severity:
🔴 critical · 🟠 high · 🟡 medium · ⚪ low. This file is updated after every
milestone. Details for security items are in [docs/SECURITY.md](docs/SECURITY.md).

| # | Sev | Issue | Location | Status |
|---|-----|-------|----------|--------|
| 1 | 🔴 | **Secrets committed in repo.** A 35-char token and a GitHub PAT (`ghp_…`) are in plaintext. Rotate/remove + purge history. | `README.md` | In progress — gitleaks CI + purge runbook added (M0.5); **rotation/removal owned by owner** |
| 2 | 🟠 | **`POST /api/events` has no auth check.** Anyone reachable can create events; UI gate doesn't protect the API. | `app/api/events/route.js` | Open |
| 3 | 🟠 | **`/past-events` is broken.** Reads `data.success`/`data.events`, but the API returns a bare array → page always empty. | `app/past-events/page.js` | Open |
| 4 | 🟠 | **`pdfjs-dist` version mismatch.** Code comments require 3.11.174 (3.x worker path `pdf.worker.min.js`); `package.json` declares `^6.0.227` and imports the `.mjs` worker. Risk: blank PDF previews. | `app/components/PdfSlideshow.jsx`, `package.json` | Open |
| 5 | 🟠 | **Base64 images stored in MongoDB.** `/admin` uploads images as data URLs into `Event.image` → DB bloat, large responses, no validation/size limit. | `app/admin/page.js`, `models/Event.js` | Open |
| 6 | 🟡 | **`process.exit(1)` on DB connect failure.** Kills the web server instead of returning 500. | `lib/db.js` | Open |
| 7 | 🟡 | **Fragile connection caching.** Module-level boolean, not the recommended `global`-cached promise; unreliable in serverless/hot-reload. | `lib/db.js` | Open |
| 8 | 🟡 | **Authorization by hardcoded email allowlist.** Changing admins needs a code change + redeploy; only 2 emails can log in at all. | `app/api/auth/[...nextauth]/route.js` | Open |
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

## Notes
- **Database pivot context:** several V1 issues are resolved by the move to
  PostgreSQL/Prisma rather than patched in place — #2 (events API auth) and #8
  (allowlist) → **Session 2** (auth/RBAC); #5/#9/#16 (base64 images, validation,
  no edit/delete) and #3 (past-events contract) → **Session 6** (events rebuilt on
  Postgres); #6/#7 (Mongoose connection) become moot once Mongoose is retired.
- #4 (pdf.js) and #11/#12 (brand blue, fonts) are UI/library issues addressed when
  the relevant pages are reworked (Sessions 5–9 / 10).
- See [docs/MILESTONE_PLAN.md](docs/MILESTONE_PLAN.md) for session mapping.
