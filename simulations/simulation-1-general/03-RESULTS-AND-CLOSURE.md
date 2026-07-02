# Results, Leaderboard & Closure Report

This guide covers the final stage of running an event: reading the live results, declaring winners at any moment, downloading your record-keeping files, and submitting the official Closure Report.

Everything here is proven. In our test runs a 50-person hackathon and a 50-person live quiz both produced correct, ranked results and clean CSV exports end to end.

---

## 1. How the leaderboard works

There are two kinds of events, and each has its own live leaderboard. In both cases the leaderboard is **always current** — you never press a "calculate" button.

### Manual (round-based) events — e.g. a hackathon

- The **overall leaderboard is the SUM of each participant's points across all rounds.**
- It uses **standard competition ranking**: the highest total is Rank 1, and **ties share the same rank.**
- It **recomputes the moment you Save any round's score sheet** — no separate refresh needed.

> **Worked example (proven).** In our 2-round hackathon, Participant 01 led after Round 1. After Round 2 scores were saved, the leaderboard re-ranked on the *cumulative* total and the overall winner became **Participant 04 with 196 points** (out of a possible 200). This is expected: a strong finals round can overtake a strong prelims round because the ranking is the sum, not the latest round.

**Where to see it:** Admin → Event Playground (`/admin/events`) → select your event → the scores / leaderboard section.

✅ **Verify:** After you Save a round score sheet, the overall leaderboard reorders itself immediately and the top row shows the participant with the highest *combined* total.

### Live quiz events — auto-scored

- The quiz leaderboard is built **automatically** as you host, question by question.
- A correct answer within the time window earns points; a wrong or late answer earns 0.
- The board is **cumulative** and stays **score-ordered** after every question.

> **Worked example (proven).** In our 5-question quiz the leaderboard grew from ≈1000 points after Q1 to ≈4000 after Q5, always sorted by score. Final winner: **Participant 03 with 3998 points.**

**Where to see it:** the quiz updates the leaderboard on your live host page (`/events/<slug>/live/host`) after each question's **Reveal**.

✅ **Verify:** After each **Reveal**, the leaderboard on the host page shows updated totals with the leader on top.

---

## 2. Declaring results midway or for unlimited participants

You do **not** need the event to be "finished" to announce standings, and this works no matter how many people registered.

Because the ranking is always current, **declaring results = reading (or downloading) the leaderboard at that moment.**

### For a manual (round) event
1. Go to Admin → Event Playground → select the event.
2. Read the overall leaderboard on screen, **or** download the **ranking CSV** (see Section 3) to announce the standings as they are right now.

> ⚠ **There is no "freeze" button for round events.** The leaderboard is intentionally live and keeps updating every time you save scores. To "declare results midway," simply download the ranking at the moment you want to announce — that download is a fixed snapshot of the standings at that time. The formal wrap-up is the **Closure Report** (Section 4).

### For a live quiz
1. On the host page, when you want to stop, press **End**.
2. **Ending the session finalizes the quiz leaderboard** — that is how you "conclude a quiz midway." The board is final at that moment.

✅ **Verify (quiz):** After pressing **End**, the leaderboard no longer changes and shows the final winner on top.

---

## 3. Downloading the four CSV files

From Admin → Event Playground → your event, you can download four separate CSV files. Use these for records, announcements, and certificates. Open them in Excel or Google Sheets.

| Download | What's in it | Proven size (50-person hackathon) |
| --- | --- | --- |
| **Participants** | Everyone registered + their status (confirmed / waitlisted) | 50 rows |
| **Ranking** | The overall leaderboard: participant, total points, rank | 50 rows |
| **Scores** | Per-round points for every participant | 100 rows (50 people × 2 rounds) |
| **Attendance** | Per-round present/absent marks | 100 rows (50 people × 2 rounds) |

> The row counts scale with your event: the **scores** and **attendance** files have one row per participant *per round*, which is why a 2-round, 50-person event produced 100 rows each.

✅ **Verify:** Each file downloads as a `.csv`. Open the **ranking** file and confirm the top row is your Rank 1 participant and the row count matches your participant list (50 rows in our test).

---

## 4. The Closure Report (official wrap-up)

The Closure Report is how an event is formally closed. **You (the organizer) submit it**, and **a central admin reviews it.**

### Step A — You submit the report
In Admin → Event Playground → your event → Closure Report, enter:

| Field | Type | What to write |
| --- | --- | --- |
| **roleContribution** | Text | A short description of what your club/team did and who contributed. |
| **reportedBudget** | Number | The total amount you spent, as a plain number (no currency symbol). |

Then submit. The report status becomes **submitted**.

✅ **Verify:** After submitting, the report status shows **submitted**.

### Step B — A central admin reviews it
A central admin opens your submitted report, adds a **comment** and a **corrected budget** (the officially accepted figure), and saves.

- The status then changes to **reviewed**.
- This is a central action — you as the organizer do not perform this step.

> **Proven flow:** in our test the report moved cleanly from **submitted → reviewed**.

✅ **Verify:** Once the admin has reviewed it, the report status reads **reviewed** and shows the admin's comment and corrected budget.

---

## 5. Fill-in-the-blank Closure Report template

Copy the block below, fill in the two fields, and paste them into the Closure Report form.

```
roleContribution:
--------------------------------------------------
Event name:        ____________________________
Organizing club:   ____________________________
Number of participants: ______  (from the participants CSV)
What we ran:       ____________________________
                   (e.g. a 2-round hackathon / a 5-question live quiz)
Key contributors:  ____________________________
Winner (Rank 1):   ____________________________  (from the ranking CSV)
Notes / highlights:____________________________
--------------------------------------------------

reportedBudget (number only):  ____________
(e.g. venue ____ + refreshments ____ + prizes ____ = total ____)
```

---

## What participants see afterward

You do not need to publish results anywhere else. Each member's profile (`/profile` and `/member/profile`) **automatically** lists every event they joined, with their registration status, attendance, points, and overall rank. This happened for all 50 participants in both proven simulations — no extra step from you.

✅ **Verify:** Open any participant's profile; the event appears with their status, points, and rank filled in.

---

**Related files in this kit:** the participant list used in the proven runs is [`../data/participants-50.csv`](../data/participants-50.csv).
