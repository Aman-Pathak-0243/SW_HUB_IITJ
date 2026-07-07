# Bugs & Findings — Simulation Testing

Two findings surfaced while running the simulations end-to-end. **Both are resolved.** Neither
is a defect in the portal's core behavior — one is a documentation accuracy fix, the other a
test-harness reproducibility fix.

---

## F-1 · A live quiz's scores are separate from the event leaderboard and profiles

**Severity:** low (correct-by-design behavior; the *kit docs* over-claimed).
**Found in:** coding-contest probe ([03-kit-scenarios-test.md](03-kit-scenarios-test.md), Scenario B).

**What happens.** A live quiz records answers in `quiz_answer` and ranks them on the **quiz
leaderboard**. Manually-scored event rounds record points in `event_score`, which is what the
**overall event leaderboard** (`getOverallRanking`) and each **member profile** read. These are
two independent systems. So a *pure quiz* correctly shows the event in a participant's profile
(they registered/attended) but with **no points or rank**, and it does not appear in the event's
overall ranking.

**Why it matters.** The kit's quiz/coding manuals implied quiz results would show up in profiles
and a "combined leaderboard" automatically. They don't — the organizer must take one extra step.

**Fix (documentation).**
- [`simulations/simulation-1-general/events/quiz.md`](../simulations/simulation-1-general/events/quiz.md)
  — corrected the profile "✅ Verify" line and added a ⚠ note explaining that quiz points live on
  the quiz leaderboard, and how to reflect them in profiles (record as a manual round).
- [`simulations/simulation-2-coding-robotics/01-CODING-CLUB.md`](../simulations/simulation-2-coding-robotics/01-CODING-CLUB.md)
  — added **Step 4b: "Record the quiz result as Round 1's score"**, required to combine a quiz
  round with a manual round.
- [`simulations/simulation-2-coding-robotics/events/coding-contest.md`](../simulations/simulation-2-coding-robotics/events/coding-contest.md)
  — added the same recording note after the quiz round.

**Verification.** After recording the quiz score into a manual round, the combined leaderboard
and the member profile both populate correctly (Scenario B, "combined leaderboard" + "profile
now shows combined points + rank" — both ✅).

---

## F-2 · The hackathon harness was not re-runnable

**Severity:** low (test-only; the product is unaffected).
**Found in:** running all three simulation suites a second time against already-populated data.

**What happened.** [`tests/event-simulation.test.mjs`](../tests/event-simulation.test.mjs)
asserts the capacity → waitlist → auto-promote sequence (48 confirmed + 2 waitlisted, then raise
to 50). On a **first** run this is exact (28/28). On a **re-run**, the 50 accounts were already
confirmed and capacity was already 50, so registration (idempotent) returned the existing
confirmed rows and the assertion `confirmed=48, waitlisted=2` failed with `confirmed=50,
waitlisted=0`. A test-state issue, not a product issue.

**Fix (test).** The harness now **deletes and recreates its demo event at the start of each run**
(deleting the event cascades its registrations/scores/attendance/rounds/settings), so the
capacity sequence always starts fresh.

**Verification.** The full simulation set was run **twice back-to-back** — both runs fully green
(event 28/28, quiz 6/6, kit 11/11).

---

## Summary

| ID | Area | Type | Status |
|---|---|---|---|
| F-1 | Quiz vs event scoring | Documentation accuracy | ✅ Fixed (3 kit files clarified) |
| F-2 | Event-simulation harness | Test reproducibility | ✅ Fixed (self-reset added) |

No changes were required to the application's runtime code — the portal behaved correctly
throughout. The fixes were to the simulation **kit documentation** and the **test harness**.
