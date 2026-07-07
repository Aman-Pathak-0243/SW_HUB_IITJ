# Test Report — Kit Scenarios (general, coding, robotics, collaboration)

**Harness:** [`tests/kit-simulations.test.mjs`](../tests/kit-simulations.test.mjs) ·
**Manuals:** [Simulation 2](../simulations/simulation-2-coding-robotics/README.md) +
[general-event fixture](../simulations/simulation-1-general/events/general-event.md) ·
**Result: ✅ 11 / 11 checks passed** (1 finding, F-1).

## A · General event (single manual round)

`sim-general-2026` — a judged cultural event with one score sheet.

| Check | Result |
|---|---|
| Single-round scoring + leaderboard (20 participants) | ✅ 20 ranked |
| Profile shows points + rank | ✅ pts + rank populated |

## B · Coding contest (quiz round + manual round)

`sim-coding-2026` — a live quiz round plus a manually-scored coding round. This scenario was
written specifically to **probe how the two scoring systems interact**.

| Check | Result |
|---|---|
| Quiz round auto-scored (own leaderboard) | ✅ 20 players scored |
| Quiz is **separate** from the event leaderboard (probe) | ✅ event ranking empty right after the quiz |
| **Finding F-1** raised | quiz points are NOT auto-added to the event leaderboard/profiles |
| Combined leaderboard after **recording the quiz as a manual round** | ✅ 20 ranked |
| Profile shows combined points + rank | ✅ populated after recording |

**Takeaway:** to produce a single ranking across a quiz round and a manual round, the organizer
records the quiz result into a manual round's score sheet. The
[coding-club manual](../simulations/simulation-2-coding-robotics/01-CODING-CLUB.md) now includes
this as an explicit step (Step 4b). See [BUGS_AND_FIXES.md](BUGS_AND_FIXES.md).

## C · Robotics championship (3 manual rounds + capacity/waitlist)

`sim-robotics-2026` — a 3-round championship with limited arena slots.

| Check | Result |
|---|---|
| Capacity + waitlist (24 slots, 30 registered) | ✅ 24 confirmed + 6 waitlisted |
| 3-round overall leaderboard = sum across rounds | ✅ 30 ranked, reshuffled on cumulative points |

## D · Collaboration (two clubs co-organize one event)

`sim-collab-2026` — Coding Club × Robotics Club, with **scoped coordinators**.

| Check | Result |
|---|---|
| A coordinator of an **organizing** club can manage the event | ✅ both club coordinators can |
| A coordinator of a **non-organizing** club **cannot** | ✅ correctly denied |
| Both clubs' scores feed **one shared leaderboard** | ✅ 20 ranked from both coordinators' entries |

**Takeaway:** tagging clubs as organizers (a central action) grants each club's coordinator
scoped `event.manage` on that event, and all their round scores roll into one shared ranking —
exactly what the [collaboration guide](../simulations/simulation-2-coding-robotics/03-COLLABORATION-AND-LEADERBOARD.md)
describes.

## Reproducibility

All four scenarios are re-runnable (scenario B clears prior round scores so its "quiz is
separate" probe stays valid). The whole file was run twice back-to-back — both fully green.
