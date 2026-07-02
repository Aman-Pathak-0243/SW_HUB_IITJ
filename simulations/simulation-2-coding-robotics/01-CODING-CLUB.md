# Coding Club — Run a Coding Contest End-to-End

This guide walks you through running a **two-stage Coding Club contest** on the IIT Jammu Student Affairs Portal:

- **Round 1 — Live Quiz** (aptitude / CS fundamentals). Auto-scored from an answer key; the portal times each question and computes points for you.
- **Round 2 — Coding round** (manually scored). You judge each submission against a rubric and type the points in.

The portal then combines both rounds into **one overall leaderboard** (Round 1 + Round 2) that you can read or download at any moment.

Everything here has been proven end-to-end. The quiz mechanics were verified with 50 members over 5 questions (6/6 checks passed; leaderboard grew Q1 ≈ 1000 pts → Q5 ≈ 4000 pts cumulatively). The manual round-scoring was verified with 50 members over 2 rounds (28/28 checks passed; the overall winner correctly re-ranked to the participant with the highest cumulative points).

**Before you start — two things must be true:**

1. The member platform is ON. *Admin → Plugins* → turn on **member_platform**. (When off, members cannot log in or register.)
2. You can manage events. You need `event.manage` — you have it if you are staff/admin/developer, **or** a coordinator of the Coding Club (the club that organizes this event).

---

## Step 0 — Get participants into the portal (once)

If your contestants already have portal accounts, skip to Step 1.

1. Go to **Admin → Users & Roles**.
2. Use **bulk import** and paste/upload a CSV with columns `email,password[,name[,role]]`.
   - Passwords must be **at least 10 characters** with at least one **UPPERCASE**, one **lowercase**, and one **digit**. Example: `Welcome#2001`.
   - Leave the role blank for a plain member.
   - A ready-made sheet of 50 accounts is provided: [`../data/participants-50.csv`](../data/participants-50.csv).
3. Send each contestant their **initial** email + password from the sheet.

> ⚠ **First-login password change:** Admin-provisioned accounts are created with *"must change password on first login"* ON. This is expected and correct. Each contestant signs in with the initial password you gave them, then the portal requires them to set their own new password. Tell them to expect this.

✅ **Verify:** In *Admin → Users & Roles* you can see the imported accounts (e.g. `sim.user.01@iitjammu.ac.in`).

---

## Step 1 — Create the event (organizer = Coding Club)

1. Go to **Admin → Content**.
2. Click **+ New content** → content type **Event** → enter a **Title** (e.g. `Coding Club Coding Contest`) → **Create draft**.
3. On the event's content page, fill in:

   | Field | Value |
   |---|---|
   | Event date | your contest date |
   | Category | `technical` |
   | Audience | **public** (so it shows on the public site) |
   | Location | e.g. `Lab Complex` or `Online` |
   | Body | short description of the contest |

4. Click **Publish**. *(An event only opens for registration once published.)*

✅ **Verify:** The event now appears on the public site and its public page is reachable at `/events/<slug>`.

**Set Coding Club as the organizer:** Go to **Admin → Event Playground** → select your event → **Organizers** → tag **Coding Club** as **ORGANIZER**. Any Coding Club coordinator can then co-manage the event.

> Want to run this jointly with the Robotics Club instead? See [03 — Collaboration](03-COLLABORATION-AND-LEADERBOARD.md). You can tag a second club as ORGANIZER or COLLABORATOR so both clubs' coordinators share one event and one leaderboard.

---

## Step 2 — Add the Round 1 quiz questions (the answer key)

Round 1 is a live quiz. You add the questions once, ahead of time.

1. Go to **Admin → Event Playground** → select your event → open the **quiz** section.
2. For each question, enter:

   | Field | Notes |
   |---|---|
   | Prompt | the question text |
   | Options | 2–8 answer choices |
   | Correct option(s) | the answer key — **never shown to players** |
   | Points | default **1000** |
   | Time limit (seconds) | default **20** |

3. Use the proven, ready-to-reuse answer key in [`events/coding-contest.md`](events/coding-contest.md) (5 CS-fundamentals questions: CPU, Red Planet, `2 + 2 × 2`, browser language, HTTP 404). Enter each question, its options, and mark the correct option.

✅ **Verify:** The quiz section lists all your questions. Correct answers are stored but are **not** visible on the player page.

---

## Step 3 — Open registration

1. Still in **Admin → Event Playground** → your event → **Registration settings**.
2. Fill in:

   | Field | Value |
   |---|---|
   | Capacity (blank = unlimited) | e.g. `50`, or leave blank |
   | Registration opens at (go-live) | your open time (or use the button below) |
   | Registration closes at (deadline) | your deadline |
   | Who can register | leave **all unchecked** = open to every member |

3. Or simply click **Go live now** to open registration immediately.

**What members do:** sign in at `/login` → open the event's public page → click **Register**. Seats fill to capacity as **confirmed**; overflow becomes **waitlisted**.

> If you later **raise** the capacity, the earliest waitlisted members are **auto-promoted** to confirmed (proven: capacity 48 → 2 waitlisted → raised to 50 → 2 auto-promoted → 50 confirmed). If a confirmed member cancels, the next waitlisted member is auto-promoted.

✅ **Verify:** The public event page shows a **Register** button, and the participants list in Event Playground grows as members sign up.

---

## Step 4 — Run Round 1 (the live quiz)

Host the quiz from the event's live host page: **`/events/<slug>/live/host`**. Participants answer on their player page: **`/events/<slug>/live`**.

1. Click **Start** to begin the session.
2. Click **Next** to open the first question — a server timer starts.
3. Participants pick an answer on their player page. Each participant may answer each question **once**.
4. Click **Reveal** to close the question and show the correct answer + the updated leaderboard.
5. Repeat **Next → Reveal** for every question.
6. Click **End** to finish the quiz.

**How scoring works (automatic, server-authoritative):** a correct answer inside the time window earns a flat **half** the points plus a **speed bonus** (faster = more, up to the other half). A wrong or late answer earns **0**. The leaderboard updates after every question.

> **Concluding the quiz midway:** clicking **End** finalizes the quiz leaderboard at that moment — that is how you stop early and lock the Round 1 result.

✅ **Verify:** After **Reveal** on each question the leaderboard re-orders by score, and totals grow cumulatively (proven: Q1 ≈ 1000 → Q5 ≈ 4000; winner in the simulation was Participant 03 with 3998 pts).

---

## Step 5 — Run Round 2 (manually-scored coding round)

Round 2 is judged by you against a rubric.

**Round 2 rubric (max 100):**

| Criterion | Max points |
|---|---|
| Correctness | 50 |
| Efficiency | 25 |
| Code quality | 25 |

1. Go to **Admin → Event Playground** → your event → **Rounds** → **Create round**:

   | Field | Value |
   |---|---|
   | Name | `Round 2 — Coding` |
   | Description (optional) | `correctness 50 / efficiency 25 / code-quality 25` |
   | Starts at / Ends at | optional |

   *(Rounds are numbered automatically.)*
2. Open the **Scores** score sheet **for this round** and type each participant's total points (0–100).
3. Click **Save**.

> Saving **replaces** that round's sheet, so you always see one clean set of scores. If you re-enter a score and Save again, it overwrites the previous entry for that round.

✅ **Verify:** The Round 2 score sheet shows the points you entered, and the overall leaderboard recomputes immediately (see next step).

---

## Step 6 — The combined leaderboard (Round 1 + Round 2)

The **overall leaderboard** is the **sum of each member's points across all rounds** — here, Round 1 (quiz) + Round 2 (coding) — ranked with **standard competition ranking** (ties share a rank).

- It is **live**: it recomputes every time scores are saved.
- There is **no separate "freeze" button** for round events. To declare results at any point — including midway — just read or download the leaderboard at that moment. The formal wrap-up is the **Closure Report** (Step 8).

> Proven behavior: rankings re-rank on cumulative performance. In the manual-scoring simulation the Round 1 leader (Participant 01) was overtaken after Round 2 by the participant with the highest *total* (Participant 04, 196 pts).

✅ **Verify:** In Event Playground the overall leaderboard lists every participant with a total that equals their quiz points + their Round 2 points, ordered highest-first.

---

## Step 7 — Downloads (CSV)

From **Admin → Event Playground** → your event, download any of:

| CSV | Contents |
|---|---|
| Participants | everyone registered |
| Ranking | the overall leaderboard (Round 1 + Round 2) |
| Scores | per-round scores |
| Attendance | per-round attendance (optional — see below) |

You can download the **ranking** CSV at **any moment** to declare or archive standings.

> ⚠ **Attendance is always optional.** There is no on/off toggle at event creation. If part of your contest is remote, simply **don't** mark attendance — it changes nothing else. To mark it, use the per-round attendance sheet (mark present/absent → **Save**).

✅ **Verify:** The ranking CSV opens with one row per participant and a total column matching the on-screen leaderboard.

---

## Step 8 — Close out the contest

1. In **Event Playground** → your event, submit the **Closure report**:
   - **roleContribution** (text) — what the Coding Club contributed.
   - **reportedBudget** (number) — what you spent.
2. A central admin reviews it (adds a comment + a corrected budget). The report status then becomes **reviewed**.

✅ **Verify:** The closure report shows status **submitted**, then **reviewed** after the central admin's review.

---

## What participants see afterwards

Every contestant's profile (`/profile` and `/member/profile`) automatically lists this event with their **registration status, attendance, points, and overall rank** — no extra step from you. *(Proven: 50/50 profiles updated in both simulations.)*

✅ **Verify:** Open a participant's profile — this contest appears with their points and rank filled in.

---

### Quick reference

- Public login: `/login` · Admin panel: `/admin`
- Quiz host page: `/events/<slug>/live/host` · Quiz player page: `/events/<slug>/live`
- Round 1 answer key: [`events/coding-contest.md`](events/coding-contest.md)
- Collaborate with Robotics Club: [03 — Collaboration](03-COLLABORATION-AND-LEADERBOARD.md)
- Participant sheet: [`../data/participants-50.csv`](../data/participants-50.csv)
