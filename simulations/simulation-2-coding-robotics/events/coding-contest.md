# Fixture — Coding Contest (quiz round + coding round)

A ready-to-run two-round coding contest for the **Coding Club**. Round 1 is an auto-scored CS-fundamentals quiz; Round 2 is a manually scored coding challenge. The overall winner is the sum of both rounds.

Related: for the full club walkthrough see [01-CODING-CLUB.md](../01-CODING-CLUB.md). Participant sheet: [../data/participants-50.csv](../../data/participants-50.csv).

---

## 1. Create the event listing — Admin → Content

1. Go to **/admin/content** → click **+ New content**.
2. Content type: **Event**. Title: **Coding Club Code Sprint** → **Create draft**.
3. On the event's content page, fill these fields:

| Field | Value |
|---|---|
| Event date | (your contest date) |
| Category | `technical` |
| Audience | `public` |
| Location | (your venue, e.g. `CSE Lab 1`) |
| Body | Short description of the contest (2 rounds: quiz + coding). |

4. Click **Publish**.

✅ **Verify:** The event now appears on the public site, and its public page shows a **Register** button.

---

## 2. Set the organizer — Admin → Event Playground → Organizers

1. Go to **/admin/events** → select **Coding Club Code Sprint**.
2. Open the **Organizers** tab → tag **Coding Club** as **ORGANIZER**.

✅ **Verify:** Coding Club is listed as ORGANIZER, and its coordinators can now manage this event.

---

## 3. Open registration — Event Playground → Registration settings

1. In **/admin/events** → **Coding Club Code Sprint** → **Registration settings**.
2. Set **Capacity (blank = unlimited)** as needed (e.g. `50`), then click **Go live now**.

✅ **Verify:** The public page's **Register** button is active; as members register, seats fill to **confirmed** and any overflow shows **waitlisted**.

---

## 4. Round 1 — Quiz (auto-scored answer key)

Create **Round 1** (Event Playground → Rounds → **Create round**, Name: `Round 1 — Quiz`). Then add the 5 questions below in the event's quiz section. Each is **1000 pts**, **20s**. The starred (*) option is the correct one — the answer key is never shown to players.

| # | Prompt | Option 1 | Option 2 | Option 3 | Option 4 | Correct |
|---|---|---|---|---|---|---|
| Q1 | Which data structure works on First-In-First-Out (FIFO)? | Stack | Queue* | Tree | Hash map | 2 |
| Q2 | What is the average-case time complexity of binary search? | O(n) | O(n log n) | O(log n)* | O(1) | 3 |
| Q3 | Which data structure uses LIFO (Last-In-First-Out) order? | Stack* | Queue | Linked list | Graph | 1 |
| Q4 | Which of these is a statically typed language? | Python | JavaScript | Java* | Ruby | 3 |
| Q5 | What is the worst-case time complexity of a linear search? | O(1) | O(log n) | O(n)* | O(n²) | 3 |

**Run the quiz round** (host from **/events/<slug>/live/host**):

1. **Start the session** → **Next** opens Q1 (a server timer starts).
2. Participants answer on their player page (**/events/<slug>/live**) — one answer each.
3. **Reveal** closes the question, shows the correct answer + the updated leaderboard. Repeat for Q2–Q5.
4. **End** finishes the quiz. Scoring is automatic and server-authoritative: a correct answer within the time window earns a flat half of the points plus a speed bonus (faster = more, up to the other half); wrong or late = **0**.

✅ **Verify:** After each **Reveal**, the leaderboard re-ranks; after Q5 the top scorer is near ~4000 pts. **End** finalizes the Round 1 quiz leaderboard.

---

## 5. Round 2 — Coding challenge (manual rubric)

Create **Round 2** (Rounds → **Create round**, Name: `Round 2 — Coding`). Score each participant by hand against this rubric (max 100):

| Criterion | Max points |
|---|---|
| Correctness (passes the required cases) | 50 |
| Efficiency (time / space complexity) | 25 |
| Code quality (readability, structure) | 25 |
| **Total** | **100** |

**Enter scores:** Event Playground → **Scores** → select **Round 2 — Coding** → type each participant's total, then **Save**.

⚠ Saving **replaces** that round's score sheet, so you always see one clean set. The overall leaderboard is the **sum across rounds** and recomputes on every save.

✅ **Verify:** After **Save**, the overall leaderboard shows each participant's Round 1 + Round 2 total, re-ranked (ties share a rank).

---

## 6. Attendance (optional)

Mark attendance per round in Event Playground → **Attendance** → select the round → mark present/absent → **Save**.

⚠ **Attendance is always optional** — there is no on/off toggle. If your contest is remote, simply **don't** mark attendance; nothing else changes and participants can still compete.

✅ **Verify:** Marked participants show present/absent on their profiles; unmarked rounds simply show no attendance.

---

## 7. Declare results & close out

1. **Declare the winner:** the overall leaderboard is always current — read it, or download the **ranking CSV** (Event Playground → **Downloads**) at any moment. There is no separate "freeze" button for round events.
2. **Closure report:** the organizer submits **roleContribution** (text) + **reportedBudget** (number); a central admin reviews it (comment + corrected budget) → status becomes **reviewed**.

✅ **Verify:** The ranking CSV lists all participants with their combined points and rank; the closure report status reads **reviewed** after admin review.

---

## What participants see afterward

Each member's profile (**/profile** and **/member/profile**) automatically lists this contest with their **registration status, attendance, points, and overall rank** — no extra step.

✅ **Verify:** Open any participant's profile and confirm the Coding Club Code Sprint is listed with their points and rank.
