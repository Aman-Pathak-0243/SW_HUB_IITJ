# Simulation 2 — Coding Club × Robotics Club (overview)

This kit shows how two clubs — the **Coding Club** and the **Robotics Club** — each run their own events on the IIT Jammu Student Affairs Portal, and how the two clubs **co-organize a single event that shares one leaderboard**. It builds directly on Simulation 1, so please read that first (see "Before you start" below).

## What this simulation proves (goals)

1. **Each club can run its own events independently** — the Coding Club runs a live quiz; the Robotics Club runs a manual, round-scored competition.
2. **Leaderboards update on performance** — scores/ranks recompute automatically as results come in (proven: the manual leaderboard re-ranked between rounds so the overall winner differed from the Round 1 leader; the quiz leaderboard grew Q1 to Q5 and stayed score-ordered).
3. **Two clubs can co-organize one event with one shared leaderboard** — both clubs' coordinators manage the same event, and there is a single ranking for all participants.

## What's in this kit

| Path | What it covers |
|------|----------------|
| `01-CODING-CLUB/` | Track 1 — the Coding Club runs its own event (a live, auto-scored quiz). |
| `02-ROBOTICS-CLUB/` | Track 2 — the Robotics Club runs its own event (a manual, multi-round competition). |
| `03-COLLABORATION-AND-LEADERBOARD/` | The collaboration guide — tag both clubs on one event so their coordinators co-manage it, and read/download the one shared leaderboard. |
| `events/` | Ready-to-use event fixtures (the quiz answer key, the round rubric, and the settings each track uses) so you can reproduce the tracks step by step. |

## The two tracks

- **Track 1 — Coding Club (`01-CODING-CLUB/`):** a **live quiz**. Questions are auto-scored from an answer key the players never see. A correct answer within the time window earns a flat half of the points plus a speed bonus; a wrong or late answer earns 0. The leaderboard updates after every question, and ending the session finalizes it.
- **Track 2 — Robotics Club (`02-ROBOTICS-CLUB/`):** a **manual, multi-round competition**. The organizer types each participant's points into a per-round score sheet. The overall leaderboard is the sum across rounds and re-ranks on every save.

## The collaboration guide

`03-COLLABORATION-AND-LEADERBOARD/` walks through tagging one event with **both** clubs. In **Admin → Event Playground → Organizers**, a central admin/staff/developer tags the Coding Club and the Robotics Club as **Organizer** or **Collaborator**. After that, a coordinator of **either** organizing club can manage the event, and all participants sit on **one shared leaderboard/ranking** that everyone reads and downloads from the same place.

⚠ **Attendance is always optional.** There is no on/off toggle at event creation. If a round or session is remote, simply don't mark attendance — nothing else changes.

⚠ **Admin-set passwords force a first-login change.** Every account you bulk-import is created with "must change password on first login" ON. Send each user their **initial** password from the sheet; on first login they set their own. This is expected and correct.

## Before you start

Read Simulation 1 first — it contains the shared admin-setup and host manual you'll rely on here (turning on the member platform, bulk-importing the 50 participants, creating and publishing an event, and hosting):

- **[../simulation-1-general/](../simulation-1-general/)** — admin setup + host manual.

The same 50-account sheet is reused for every track: **[../data/participants-50.csv](../data/participants-50.csv)** (`sim.user.01..50@iitjammu.ac.in`, passwords `Welcome#2001..Welcome#2050`).

## How to use this kit

Work top to bottom. First complete the admin setup from Simulation 1 (member platform ON, participants imported). Then run **Track 1 (`01-CODING-CLUB/`)** to see one club run a quiz on its own, and **Track 2 (`02-ROBOTICS-CLUB/`)** to see the other club run a manual round competition on its own. Finally, open **`03-COLLABORATION-AND-LEADERBOARD/`** to combine both clubs on a single event and confirm the one shared leaderboard. Each track's guide gives you the exact navigation path, the exact field-to-value entries, and a "✅ Verify:" line so you always know what you should see on screen.
