# Event Fixture — Generic Event (workshop / cultural / sports)

Use this fixture as the **copy-me template for any non-quiz, non-hackathon event** — a cultural performance, a sports match, a graded workshop task, an exhibition. It is a manually-scored event: a judge or organizer types each participant's points into a score sheet, and the leaderboard ranks them automatically.

If you have not yet created your participant accounts, do the [bulk import](../../00-admin-setup/ADMIN_LOGIN_AND_SETUP.md) first (sheet: [../data/participants-50.csv](../../data/participants-50.csv)).

---

## 1. Create the event listing (Admin → Content)

1. Go to **Admin → Content**.
2. Click **+ New content** → content type **Event** → enter the **Title** → **Create draft**.
3. On the event's content page, fill:

| Field | Value to enter |
|---|---|
| Event date | The day of your event |
| Category | `cultural` **or** `sports` (pick one) |
| Audience | `public` (so it appears on the public site) |
| Location | e.g. `Main Auditorium` or `Sports Ground` |
| Body | A short description of the event |

4. Click **Publish**.

✅ **Verify:** The event now appears on the public site, and its public page shows a **Register** button. (An event only opens for registration once it is **published**.)

---

## 2. Open registration (Admin → Event Playground)

1. Go to **Admin → Event Playground** and select your event.
2. In **Registration settings**, fill:

| Field | Value to enter |
|---|---|
| Capacity (blank = unlimited) | e.g. `48`, or leave blank for no limit |
| Registration opens at (go-live) | Optional start time |
| Registration closes at (deadline) | Optional deadline |
| Who can register (none checked = open to every member) | Leave unchecked for all members |

3. Click **Go live now** to open registration immediately.

✅ **Verify:** On the event's public page the **Register** button is active. As members register, seats fill to **confirmed** up to capacity; any overflow becomes **waitlisted**. If you later raise the capacity, the earliest waitlisted members are **auto-promoted** to confirmed.

---

## 3. Add a round (single-round variant)

Most generic events need just **one** round — a single score sheet (for example, the judges' total out of 100).

1. In **Event Playground**, open the **Rounds** section for your event.
2. Click **Create round** and fill:

| Field | Value to enter |
|---|---|
| Name | e.g. `Final` |
| Description | Optional (e.g. `Judges' total, 0–100`) |
| Starts at / Ends at | Optional |

3. Save. Rounds are **numbered automatically**.

✅ **Verify:** The round appears in the list with its own score sheet and attendance sheet.

> **Need more than one round?** Just click **Create round** again (e.g. a `Prelims` and a `Final`). The overall leaderboard becomes the **sum across all rounds**. To edit or delete a round, use the round's **id**.

---

## 4. A simple scoring rubric (edit these to fit your event)

Decide how a judge turns performance into a number **before** the event, and enter the **total** for each participant into the score sheet. Below is a generic 100-point rubric — replace the criteria and weights with your own.

| Criterion | Max points |
|---|---|
| Skill / execution | 40 |
| Creativity / strategy | 30 |
| Presentation / overall impression | 30 |
| **Total** | **100** |

Sports variant example: `Performance 50 / Technique 30 / Sportsmanship 20 = 100`.
Workshop variant example: `Task correctness 60 / Approach 25 / Documentation 15 = 100`.

---

## 5. Enter scores

1. In **Event Playground**, open the round's **score sheet**.
2. Enter each participant's **points** (their rubric total).
3. Click **Save**.

> Saving **replaces** that round's sheet, so you always see one clean set of scores. The overall leaderboard **recomputes on every save**.

✅ **Verify:** After saving, the **overall leaderboard** shows every participant ranked by points. With multiple rounds, each participant's score is the **sum** of their rounds.

---

## 6. Attendance (optional)

1. In **Event Playground**, open the round's **attendance sheet**.
2. Mark each participant **present** or **absent** → **Save**.

⚠ **Attendance is always optional.** There is no on/off toggle at event creation. If your event is remote or you simply don't need attendance, **don't mark it** — this changes nothing else. Registered participants can start as soon as registration is open.

✅ **Verify:** For each participant you marked, the attendance sheet shows present/absent, and it appears on their profile.

---

## 7. Leaderboard & declaring results

- The overall leaderboard is **live** — it recomputes every time you save scores — and uses **standard competition ranking** (ties share a rank).
- To **declare results at any moment** (even midway), just read or download the ranking then. There is **no separate freeze button** for these events; the formal wrap-up is the **Closure Report**.

✅ **Verify:** The leaderboard reflects your most recent **Save**, top-to-bottom by points.

---

## 8. Downloads

In **Event Playground**, use the CSV download buttons:

| Download | Contents |
|---|---|
| Participants | Everyone registered |
| Ranking | The overall leaderboard |
| Scores | Per-round points |
| Attendance | Per-round present/absent |

✅ **Verify:** Each button downloads a CSV that opens in Excel / Google Sheets.

---

## 9. Close out the event (Closure Report)

1. In **Event Playground**, open the **Closure Report**.
2. Submit **role contribution** (text) and **reported budget** (a number).
3. A central admin reviews it, adds a comment and a corrected budget → status becomes **reviewed**.

✅ **Verify:** After the admin reviews, the closure report status reads **reviewed**.

---

## What participants see

Each member's profile (`/profile` and `/member/profile`) automatically lists this event with their **registration status, attendance, points, and overall rank** — no extra step.

✅ **Verify:** Open any participant's profile and confirm this event is listed with their points and rank.

> **This is your template.** To run *any other kind of event*, copy these steps: create the listing (Section 1), open registration (Section 2), add one or more rounds (Section 3), score with your own rubric (Sections 4–5), optionally take attendance (Section 6), then read the leaderboard and close out (Sections 7–9).
