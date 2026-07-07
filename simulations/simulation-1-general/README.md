# Simulation 1 — General Events (overview)

This kit walks a non-technical event organizer through running a real event end-to-end on the IIT Jammu Student Affairs Portal. It covers THREE event types, all driven from the same admin panel:

| Event type | How it is scored | Example fixture in this kit |
|---|---|---|
| Live quiz | Auto-scored from an answer key (server decides) | 5-question quiz |
| Hackathon | Manual round scoring (you type points per participant) | 2-round rubric, max 200 |
| Generic multi-round event | Manual round scoring, same as a hackathon | Any round-based competition |

You will provision participants from a spreadsheet, publish the event, open registration, run the rounds (or the live quiz), read the live leaderboard, and file the closure report.

## What this proves

Every step in this kit is verified against the live portal and confirmed by two automated end-to-end simulations:

- Hackathon (manual scoring): 50 members, 2 rounds → 28/28 checks passed. Capacity 48 → 48 confirmed + 2 waitlisted → raised to 50 → 2 auto-promoted → 50 confirmed. The overall winner (Participant 04, 196 pts) differed from the Round 1 leader because the leaderboard re-ranks on cumulative points.
- Live quiz (auto-scored): 50 members, 5 questions → 6/6 checks passed. The leaderboard grew Q1 ≈ 1000 → Q5 ≈ 4000 and stayed score-ordered; winner Participant 03, 3998 pts.
- All 50 participant profiles updated automatically for both simulations (points, rank, attendance, login).

## Files in this folder — read in this order

1. **00-admin-setup** — Log in, turn on the member platform, and bulk-import the 50 participants from the spreadsheet.
2. **01-HOST-MANUAL** — The organizer's runbook: create the event, publish it, open registration, create rounds, enter scores, mark attendance, read the leaderboard.
3. **events/** — Ready-to-use fixtures: the quiz answer key and the hackathon rubric. Copy these values into the portal.
4. **02-PARTICIPANT-MANUAL** — What a participant does: sign in, register, answer quiz questions, and view their profile.
5. **03-RESULTS-AND-CLOSURE** — Declare results at any point (download the live ranking), and submit the closure report for central review.

## How to use this kit

Work top to bottom. Each step gives you an exact navigation path (e.g. Admin → Event Playground), the exact field, and the exact value to enter — copy the values straight from this manual (or from the [participants spreadsheet](../data/participants-50.csv)) and paste them into the portal. After each action, follow the "✅ Verify:" line to confirm on screen that it worked before you move on. If what you see matches, you are on track; if not, re-check the previous step.
