# Test Report — Hackathon (manual scoring, 2 rounds)

**Harness:** [`tests/event-simulation.test.mjs`](../tests/event-simulation.test.mjs) ·
**Manual:** [Simulation 1 host manual](../simulations/simulation-1-general/01-HOST-MANUAL.md) ·
**Result: ✅ 28 / 28 checks passed.**

## Scenario

A two-round hackathon (`sim-hackathon-2026`) with **50 participants**, exercising the full
Event-Playground lifecycle a client would run for a competition.

## What was executed and observed

| Phase | What ran | Observed result |
|---|---|---|
| Create + publish event | CMS content type `event`, published | ✅ published |
| Rounds | Round 1 — Prelims, Round 2 — Finals | ✅ 2 rounds |
| Registration window | capacity 48, open window | ✅ configured |
| 50 accounts | created via the admin user service | ✅ 50 active |
| Login | all 50 via the credentials path; wrong password rejected | ✅ 50/50 + reject |
| Self-registration | all 50 register | ✅ 48 confirmed + **2 waitlisted** |
| Capacity raise → auto-promote | capacity 48 → 50 | ✅ **2 auto-promoted** → 50 confirmed |
| Round 1 scoring | scores entered in batches of 10 / 30 / 50 | ✅ leaderboard grew 10 → 30 → 50 |
| Round 2 scoring | full sheet | ✅ standings re-ranked |
| Leaderboard | cumulative across rounds | ✅ **winner changed** R1 (Participant 01) → overall (Participant 04, 196 pts) |
| Attendance | R1 + R2 | ✅ 46/50 and 48/50 present |
| Reads | organizer roster + attendance sheet (PII-gated) | ✅ 50 entries |
| CSV exports | participants / ranking / scores / attendance | ✅ 50 / 50 / 100 / 100 rows |
| Closure report | submit → central review | ✅ status `reviewed` |
| Profiles | all 50 re-read | ✅ 50/50 show points + rank; 48/50 attended; 50/50 last-login |

## Key proofs for the client

- **Capacity → waitlist → auto-promote** works exactly as the manual claims.
- The **leaderboard reflects cumulative performance** (the Round-1 leader did not win overall).
- Every participant's **profile updates automatically** with their points, rank, and attendance.

## Notes

- Fully re-runnable: the harness resets its own event at the start (see Finding **F-2** in
  [BUGS_AND_FIXES.md](BUGS_AND_FIXES.md)).
- Narrative walkthrough with the full run log: [docs/simulations/EVENT_SIMULATION.md](../docs/simulations/EVENT_SIMULATION.md).
