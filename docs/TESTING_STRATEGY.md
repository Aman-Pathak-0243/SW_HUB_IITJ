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
