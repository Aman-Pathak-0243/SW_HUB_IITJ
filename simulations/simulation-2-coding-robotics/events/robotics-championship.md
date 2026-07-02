# Fixture — Robotics Championship (3 manual rounds)

A ready-to-use fixture for a three-round, manually-scored robotics championship. Set up the event listing, open registration, create three rounds, type each team's points into the round score sheets, and read the live leaderboard whenever you want to declare results. This mirrors the proven manual-scoring flow (Hackathon simulation: 28/28 checks passed).

For the full step-by-step operator walkthrough, see [../02-ROBOTICS-CLUB.md](../02-ROBOTICS-CLUB.md).

---

## 1. Create the event listing — Admin → Content

1. Go to **Admin → Content** (`/admin/content`).
2. Click **+ New content** → choose content type **Event** → enter the Title → **Create draft**.
3. On the event's content page, fill these fields:

| Field | Value to enter |
|---|---|
| Title | `Robotics Club RoboWars` |
| Event date | your championship date |
| Category | `technical` |
| Audience | `public` |
| Location | your arena / venue |
| Body | short description of the championship |

4. Click **Publish**.

✅ **Verify:** The event appears on the public site and its public page shows a **Register** button. (An event only opens for registration once **Published**.)

---

## 2. Set the organizer — Admin → Event Playground → Organizers

1. Go to **Admin → Event Playground** (`/admin/events`) and select **Robotics Club RoboWars**.
2. Open the **Organizers** section and tag **Robotics Club** as **ORGANIZER**.

✅ **Verify:** Robotics Club is listed as the organizer. Any coordinator of the Robotics Club can now co-manage this event (scoped `event.manage`). Defining organizers is a central action (admin / staff / developer).

---

## 3. Open registration with a capacity — Admin → Event Playground

Set an arena-slot capacity so overflow teams go to a waitlist.

| Field | Value to enter |
|---|---|
| Capacity (blank = unlimited) | `24` |
| Registration opens at (go-live) | your open time (or use **Go live now**) |
| Registration closes at (deadline) | your deadline |
| Who can register (none checked = open to every member) | leave unchecked (open to every member) |

Then click **Go live now** to open registration immediately.

✅ **Verify:** As teams register, the first **24** become **confirmed** and any extra become **waitlisted**. If you later raise the capacity, the earliest waitlisted teams are **auto-promoted** to confirmed (proven: 2 auto-promoted). A confirmed team cancelling also auto-promotes the next waitlisted team.

---

## 4. Create the three rounds — Admin → Event Playground → Rounds

For each round click **Create round**, enter the Name (Description, Starts at, Ends at are optional), and Save. Rounds are numbered automatically.

| # | Round name |
|---|---|
| 1 | Round 1 — Line-Follower |
| 2 | Round 2 — Robo-Sumo |
| 3 | Round 3 — Finals |

✅ **Verify:** All three rounds are listed and numbered 1, 2, 3. (To edit or delete a round later, use the round's id.)

---

## 5. Scoring rubric (type points into each round's score sheet)

Open each round's **score sheet**, enter each team's points, and click **Save**. Saving **replaces** that round's sheet, so you always see one clean set. The **overall leaderboard is the SUM across rounds** and recomputes on every save.

### Round 1 — Line-Follower (max 100)

| Criterion | Max points |
|---|---|
| Completion | 40 |
| Time bonus | 40 |
| No-derail | 20 |
| **Round total** | **100** |

### Round 2 — Robo-Sumo (max 100)

| Criterion | Max points |
|---|---|
| Wins | 60 |
| Strategy | 40 |
| **Round total** | **100** |

### Round 3 — Finals (max 100)

| Criterion | Max points |
|---|---|
| Task score | 50 |
| Reliability | 30 |
| Design | 20 |
| **Round total** | **100** |

**Overall = Round 1 + Round 2 + Round 3 (max 300)**, ranked with standard competition ranking (ties share a rank).

✅ **Verify:** After you Save a round, the overall leaderboard re-ranks immediately on cumulative points. (Proven: in the manual simulation the Round 1 leader was overtaken after later rounds because the leaderboard re-ranks on cumulative performance.)

---

## 6. Attendance (optional)

Use each round's **attendance sheet** to mark present / absent, then **Save**.

⚠ **Attendance is ALWAYS OPTIONAL** — there is no on/off toggle at event creation. If a round is remote or you simply don't need it, just **don't mark attendance**; it changes nothing else. Registered teams can start as soon as registration is open / the event goes live.

✅ **Verify:** Any attendance you mark appears on the participant's profile; skipping it leaves scoring and ranking unaffected.

---

## 7. Declare results at any point

The overall leaderboard is **live** — it recomputes every time you Save scores. To declare results midway or at the end, just read (or download) the ranking then. There is **no separate freeze button** for round events; the formal wrap-up is the **Closure Report**.

- **Downloads:** CSV for participants, ranking, scores, and attendance (Admin → Event Playground → Downloads).
- **Closure report:** submit `roleContribution` (text) + `reportedBudget` (number). A central admin reviews it (adds a comment + a corrected budget) → status becomes **reviewed**.

✅ **Verify:** The ranking CSV downloads at any moment and reflects the current cumulative standings. After the central admin reviews your closure report, its status reads **reviewed**.

---

## 8. What teams see afterwards

Each member's profile (`/profile` and `/member/profile`) automatically lists this event with their **registration status, attendance, points, and overall rank** — no extra step. (Proven: 50/50 profiles updated in the manual simulation.)

✅ **Verify:** Open a participant's profile and confirm **Robotics Club RoboWars** appears with their points and rank.
