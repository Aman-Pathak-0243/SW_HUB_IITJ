# Simulation Test Report

This folder records what happened when the [`/simulations`](../simulations/README.md) kit was
**executed end-to-end against a live database**, following the steps in the manuals. It is the
evidence that the kit works: every scenario the manuals describe was run, its checks recorded,
and any bug found was fixed and documented.

## Overall verdict

**✅ All scenarios pass — 45 / 45 automated checks.** Two findings surfaced during testing;
both are resolved (see [BUGS_AND_FIXES.md](BUGS_AND_FIXES.md)).

| Report | Scenario | Checks | Result |
|---|---|---|---|
| [01-hackathon-test.md](01-hackathon-test.md) | Hackathon — 50 members, 2 rounds, manual scoring | 28 | ✅ 28/28 |
| [02-quiz-test.md](02-quiz-test.md) | Live quiz — 50 members, 5 questions, answer-key auto-scoring | 6 | ✅ 6/6 |
| [03-kit-scenarios-test.md](03-kit-scenarios-test.md) | General event · Coding contest · Robotics championship · Collaboration | 11 | ✅ 11/11 |
| [BUGS_AND_FIXES.md](BUGS_AND_FIXES.md) | Findings F-1, F-2 — noted, fixed, documented | — | ✅ resolved |

## How these tests were run

The simulations are executable harnesses that call the **same service functions the Admin /
Coordinator UI and the `/api` routes use** — so a green run means the real feature works, not
a mock. They live in `tests/` and are guarded by `RUN_SIM` (the normal `npm test` / `npm run
test:db` suites skip them).

```bash
npm run db:local:up && npm run db:seed          # local Postgres + seed (roles, year, developer)
RUN_SIM=1 ./node_modules/.bin/dotenv -e .env.local -- ./node_modules/.bin/vitest run \
  tests/event-simulation.test.mjs \
  tests/quiz-simulation.test.mjs \
  tests/kit-simulations.test.mjs \
  --pool=forks --poolOptions.forks.singleFork
```

Run against **local Docker Postgres** (`iitj_test`). Every harness is **re-runnable** — it was
executed twice back-to-back and both runs were fully green.

## Cleaning up the test data (optional)

The runs leave demo accounts, events, and clubs (all named with a `sim` prefix). Remove them
any time — this does not touch real data:

```bash
npm run sim:clean            # DRY RUN — reports what would be deleted
npm run sim:clean -- --apply # actually delete
```

## Mapping to the kit

Each scenario here corresponds to a manual in [`/simulations`](../simulations/README.md):
the hackathon → [Simulation 1 host manual](../simulations/simulation-1-general/01-HOST-MANUAL.md);
the quiz → [quiz fixture](../simulations/simulation-1-general/events/quiz.md); the coding /
robotics / collaboration scenarios → [Simulation 2](../simulations/simulation-2-coding-robotics/README.md).
A deeper narrative of the hackathon run is in
[docs/simulations/EVENT_SIMULATION.md](../docs/simulations/EVENT_SIMULATION.md).
