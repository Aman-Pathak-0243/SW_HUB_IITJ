# Test Report — Live Quiz (answer-key auto-scoring)

**Harness:** [`tests/quiz-simulation.test.mjs`](../tests/quiz-simulation.test.mjs) ·
**Fixture/manual:** [quiz fixture](../simulations/simulation-1-general/events/quiz.md) ·
**Result: ✅ 6 / 6 checks passed.**

## Scenario

A 5-question live quiz (`sim-quiz-2026`) with **50 participants**, proving the server-scored,
answer-key-driven path with a live leaderboard.

## What was executed and observed

| Check | Observed result |
|---|---|
| Create quiz event + 5 questions with an answer key | ✅ 5 questions, correct options stored (never shown to players) |
| 50 members register (login-only participation) | ✅ 50 registered |
| Live session run: `Start → Next → answer → Reveal → … → End` | ✅ ran 5 questions |
| Answers **auto-scored** from the answer key (server-authoritative) | ✅ correct ≈ 1000 pts (flat half + speed bonus); wrong/late = 0 |
| Leaderboard updates after every question | ✅ grew Q1 ≈ 1000 → Q5 ≈ 4000 cumulatively |
| Leaderboard ordered by score (descending, ties share rank) | ✅ ordered; winner Participant 03, 3998 pts |
| Quiz participation appears in member profiles | ✅ 50/50 list the quiz |

## Key proofs for the client

- Scoring is **automatic** — the organizer never types a point; the answer key decides.
- The **leaderboard is live** and climbs with each revealed question.
- **Ending the session** finalizes the quiz leaderboard (this is how you "conclude midway").

## Important behavior confirmed (Finding F-1)

A **pure quiz** shows the event in each participant's profile (participation) but **does not**
put the quiz points/rank into the profile or the event's overall ranking — the quiz leaderboard
and the event round-score leaderboard are **separate systems**. To also surface quiz results in
profiles / a combined ranking, record each player's quiz score into a manual round. This is now
stated in the [quiz fixture](../simulations/simulation-1-general/events/quiz.md) and demonstrated
in the [coding-contest scenario](03-kit-scenarios-test.md). Details: [BUGS_AND_FIXES.md](BUGS_AND_FIXES.md).
