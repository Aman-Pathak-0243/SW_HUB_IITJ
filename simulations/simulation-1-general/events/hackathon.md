# Event Fixture — Hackathon (2 rounds, manual scoring)

A ready-to-run hackathon you can copy field-for-field. It uses **manual scoring**: you type each participant's points into a per-round score sheet, and the portal keeps a live overall leaderboard (the sum across rounds). This exact fixture has been run end-to-end and passed all 28 automated checks.

---

## 1. What you will build

| Thing | Value |
|---|---|
| Event title | Inter-Hostel Hackathon 2026 |
| Category | technical |
| Audience | public |
| Rounds | 2 (Prelims, Finals) |
| Scoring | Manual — you enter points per round |
| Overall | Sum of both rounds (max 200), live-ranked |

---

## 2. Load the participants (once)

Import the provided sheet of 50 accounts so people can register.

1. Go to **Admin → Users & Roles**.
2. Use the bulk import and paste/upload [../data/participants-50.csv](../../data/participants-50.csv).

Each account gets its initial password from the sheet (e.g. `sim.user.01@iitjammu.ac.in` / `Welcome#2001`).

> ⚠ Admin-created accounts have **"must change password on first login"** turned ON. That is expected and correct: send each person their initial password, and on their first sign-in the portal will require them to set a new one.

✅ **Verify:** In Users & Roles you see 50 accounts (`sim.user.01…50@iitjammu.ac.in`). Re-importing the same file skips existing accounts (it is safe to run twice).

---

## 3. Create the event listing (Admin → Content)

1. Go to **Admin → Content**.
2. Click **+ New content** → content type **Event** → enter the Title → **Create draft**.
3. On the event's content page, fill:

| Field | Value |
|---|---|
| Title | Inter-Hostel Hackathon 2026 |
| Event date | 2026-08-15 |
| Category | technical |
| Audience | public |
| Location | Central Lecture Theatre, IIT Jammu |
| Body (description) | A two-round inter-hostel hackathon. Round 1 (Prelims) screens ideas on problem-fit, feasibility, and clarity. Shortlisted teams advance to Round 2 (Finals), judged on a working demo, technical depth, and presentation. Overall winner is decided on total points across both rounds. |

4. Click **Publish**.

✅ **Verify:** The event appears on the public site (because Audience = public) and shows a **Register** button. An event only opens for registration once it is **Published**.

---

## 4. Registration settings (Admin → Event Playground)

Go to **Admin → Event Playground (/admin/events)** and select **Inter-Hostel Hackathon 2026**.

Set these registration fields:

| Field | Value |
|---|---|
| Capacity (blank = unlimited) | **48** |
| Registration opens at (go-live) | leave blank and use **Go live now** |
| Registration closes at (deadline) | your deadline (optional) |
| Who can register (none checked = open to every member) | leave all unchecked (open to all) |

Then click **Go live now** to open registration immediately.

We start at capacity **48** on purpose, to demonstrate the waitlist. As all 50 members register:

- The first **48** become **confirmed**.
- The remaining **2** become **waitlisted**.

✅ **Verify (proven):** With 50 members registering against capacity 48 → **48 confirmed + 2 waitlisted**.

### Raise capacity to auto-promote

1. Change **Capacity** from `48` to **50** and save.
2. The earliest waitlisted members are **auto-promoted** to confirmed.

✅ **Verify (proven):** Capacity raised 48 → 50 → the **2** waitlisted members are auto-promoted → **50 confirmed, 0 waitlisted**. (If someone later cancels a confirmed seat, the next waitlisted member is auto-promoted the same way.)

---

## 5. Create the two rounds

In Event Playground for this event, use **Create round** twice. Rounds are numbered automatically.

| Round | Name | Description (optional) | Starts / Ends at |
|---|---|---|---|
| 1 | Prelims | Screen ideas: problem-fit, feasibility, clarity | optional |
| 2 | Finals | Judge working demo, technical depth, presentation | optional |

✅ **Verify:** Two rounds are listed, numbered 1 and 2. (To edit or delete a round later, use the round's id.)

---

## 6. The scoring rubric

Judges score each participant against this rubric. You type the **total** for each round into that round's score sheet.

**Round 1 — Prelims (max 100)**

| Criterion | Max points |
|---|---|
| Idea / problem-fit | 40 |
| Feasibility | 30 |
| Clarity | 30 |
| **Round 1 total** | **100** |

**Round 2 — Finals (max 100)**

| Criterion | Max points |
|---|---|
| Working demo | 40 |
| Technical depth | 30 |
| Presentation | 30 |
| **Round 2 total** | **100** |

**Overall = Round 1 + Round 2 (max 200)**, ranked with standard competition ranking (tied scores share a rank).

---

## 7. Enter the scores, round by round

1. Open the **Scores** section for **Round 1 (Prelims)**.
2. For each participant, enter their Round 1 total (0–100) from the rubric.
3. Click **Save**.

> Saving **replaces** that round's entire sheet, so you always see one clean set of numbers. The overall leaderboard recomputes on every save.

4. Repeat for **Round 2 (Finals)**: open its score sheet, enter each participant's Round 2 total, **Save**.

✅ **Verify:** The overall leaderboard shows each participant's Round 1 + Round 2 sum, ranked highest first.

---

## 8. Watch the leaderboard reshuffle

The overall leaderboard is **live**: it re-ranks on every save, using cumulative points across both rounds. That means an early leader can be overtaken after the Finals.

✅ **Verify (proven):**
- After **Round 1**, the leader was **Participant 01**.
- After **Round 2**, the **overall winner** became **Participant 04** with **196 points** — the leaderboard re-ranked on total performance across both rounds.

There is **no separate "freeze" button** for round events. Because the ranking is always current, to "declare results" at any moment you simply read or download it then (see downloads below). The formal wrap-up is the Closure Report (step 10).

---

## 9. Attendance (optional)

Mark attendance per round if you want a record of who showed up.

1. Open the **Attendance** section for a round.
2. Mark each participant **present** or **absent**, then **Save**.

> ⚠ Attendance is **always optional** — there is no on/off toggle at event creation. If your event is remote, simply **don't** mark attendance; it changes nothing else. Registered participants can start as soon as registration is open / the event has gone live.

✅ **Verify (proven):** Attendance recorded for Round 1 (46/50 present) and Round 2 (48/50 present). Both rounds are independent sheets.

---

## 10. Downloads and closure

**Downloads** (available at any time from Event Playground): CSV for **participants**, **ranking**, **scores**, and **attendance**.

✅ **Verify (proven):** Exports produced participants (50), ranking (50), scores (100 = 50 × 2 rounds), and attendance (100) rows, plus the roster.

**Closure report** (the formal wrap-up):

1. As organizer, submit **roleContribution** (text) and **reportedBudget** (a number).
2. A central admin reviews it, adds a comment and a corrected budget → status becomes **reviewed**.

✅ **Verify (proven):** Closure report moved from **submitted → reviewed**.

---

## 11. What participants see afterwards

Every member's profile (**/profile** and **/member/profile**) automatically lists this event with their **registration status, attendance, points, and overall rank** — no extra step.

✅ **Verify (proven):** All **50/50** profiles updated with points + rank + attendance + login.
