# Testing Strategy (V2.0 — Proposed)

> **Status:** Proposed. **Current reality: there are no tests in the repository.**
> This is the quality gate every V2 milestone must pass before it is "done".

## The gate (from the master spec)

No production code is complete until it passes:

- unit tests
- integration tests
- API tests
- database tests
- permission tests
- authentication tests
- migration tests
- backup & restore tests
- responsive tests
- cross-browser tests
- performance tests
- manual QA

Testing reports are generated automatically and stored (surfaced in the
Developer Console).

## Proposed tooling

| Layer | Tool (proposed) |
|---|---|
| Unit / integration | Vitest or Jest + React Testing Library |
| API / route handlers | Vitest + supertest-style fetch against handlers |
| Database | `mongodb-memory-server` for isolated DB tests |
| Permission / auth | Targeted tests around the authz utility + NextAuth callbacks |
| Migration | Each migration script has up/down + idempotency tests |
| Backup / restore | Round-trip test (backup → restore → diff) |
| E2E / responsive / cross-browser | Playwright (multiple viewports + browsers) |
| Performance | Lighthouse CI (Core Web Vitals budgets) |
| Lint/format | ESLint (already configured) + Prettier (proposed) |

> Final tool choices are confirmed in the testing-foundation milestone. The
> stack stays lightweight and well-documented so future students can run it.

## Conventions (proposed)

- Tests live next to code (`*.test.js(x)`) or under `__tests__/`.
- `npm test` runs unit/integration/API/DB; `npm run test:e2e` runs Playwright;
  `npm run test:perf` runs Lighthouse CI.
- CI runs the full gate on every PR; merges are blocked on green.
- Coverage thresholds defined once the suite exists (start pragmatic, raise over
  time).

## Responsive & cross-browser

- Validate the breakpoints in [RESPONSIVE_DESIGN.md](RESPONSIVE_DESIGN.md) on
  phones, foldables, tablets, laptops, desktops, ultra-wide.
- Cross-browser: latest Chromium, Firefox, WebKit (via Playwright).
- **Responsiveness is validated before any milestone completes** (spec
  requirement).

## Performance

- Budgets aligned to "excellent" Core Web Vitals (see [PERFORMANCE.md](PERFORMANCE.md)).
- Lighthouse CI gates regressions; report archived per milestone.

## Reporting

- Test + coverage + Lighthouse reports are written to a known location and linked
  from `PROGRESS.md` and the Developer Console's "testing reports" module.

## First steps when testing work is approved

1. Add the test runner + a trivial passing test (prove the harness works).
2. Cover the **existing** Events API and the bug fixes (contract + auth) as the
   first real tests — lock in behavior before refactoring.
3. Grow the suite milestone-by-milestone alongside features.

---

## Local Postgres for testing (Docker) — the current live-DB workflow (Session 13)

> The analysis-phase table above proposed `mongodb-memory-server`; the shipped system is
> **PostgreSQL (Neon in prod) via Prisma**, so DB tests need a real Postgres. **SQLite is
> NOT usable** here: the schema pushes invariants into Postgres — **16 triggers**, **citext**,
> **partial / NULLS-NOT-DISTINCT** uniques, `FOR UPDATE SKIP LOCKED`, `pg_total_relation_size`,
> `gen_random_uuid()`, `@db.Uuid/Timestamptz` — none of which SQLite can host. The live
> `*.db.test.mjs` suites exist specifically to verify those guards, so they must run on Postgres.

### Two tiers of tests
- **Static (no DB) — `npm test`.** ~530 pure-logic tests (validators, the RBAC resolver, pure
  helpers). Runs offline in seconds. The `*.db.test.mjs` suites **self-skip** unless `RUN_DB_TESTS=1`.
- **Live-DB — `npm run test:db`.** The `*.db.test.mjs` / `db.smoke` suites, run **per-file**
  against a real Postgres (authz, guards, triggers, persistence, concurrency).

### Local Postgres via Docker (fast, offline, all guards intact)
A `docker-compose.yml` at the repo root runs `postgres:16-alpine` locally so the live suites run
in **~20 s total** (vs. an hour+ on a cold/latent Neon) with **every guard identical to prod**.

```bash
# one-time
cp env.test.example .env.test        # local URLs (git-ignored via .env*)

# each session
npm run db:local:up                  # docker compose up -d --wait (postgres:16, healthchecked)
npm run db:local:setup               # migrate + seed the local DB (52 perms / 11 roles / 13 types)
npm run test:db                      # run EVERY live suite PER-FILE (single-fork) — 19/19 green
npm run db:local:down                # stop        (down -v / db:local:reset to WIPE + recreate)
```

### Why per-file (not one process)
`scripts/test-db.mjs` runs each live suite in its **own** vitest process. This is required, not
cosmetic: several suites assert **absolute audit-row counts** and the `year.db` suite mutates the
shared current-year row — so running them all in ONE process lets earlier suites' rows bleed into a
later suite's count assertion (KNOWN_ISSUES #39). Per-file gives each suite a clean assertion (a
single all-in-one run shows ~3 spurious count failures that vanish per-file). The runner
auto-discovers live suites (any test file referencing `RUN_DB_TESTS`), so new suites are picked up
automatically.

### npm scripts (Session 13)
| Script | What it does |
|--------|--------------|
| `db:local:up` | `docker compose up -d --wait` — start local Postgres, wait until healthy |
| `db:local:down` | stop the container (data volume kept) |
| `db:local:reset` | `down -v` + `up --wait` — wipe the volume + a fresh DB |
| `db:migrate:test` / `db:seed:test` | `prisma migrate deploy` / seed against `.env.test` |
| `db:local:setup` | migrate **then** seed the local DB |
| `test:db` | run every live suite per-file (single-fork) against `.env.test` |
| `db:studio:test` | Prisma Studio against the local DB |

The Docker DB is throwaway + isolated from Neon: `.env.test` points at `localhost:5432`, so this
never touches the production database. To test against Neon instead (e.g. a final pre-deploy check),
run the suites per-file with `-e .env.local` on a warm Neon, exactly as `docs/WEBSITE_TESTING_SOP.md` §3 describes.
