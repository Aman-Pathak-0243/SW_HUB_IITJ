# Robotics Club — Run a Robotics Championship End-to-End

This guide walks the **Robotics Club** through running its own event: a **manual, multi-round championship** where you type each team's points into a score sheet and the portal keeps a live overall leaderboard. You will create the event, open registration with a seat cap and a waitlist (arena slots are limited), create three rounds, enter scores, watch the overall ranking reshuffle, optionally mark attendance, download results, and file the closure report.

The three rounds in this championship are:

| Round | Name | Format |
|-------|------|--------|
| 1 | Line-Follower | Time-trial (on-campus arena) |
| 2 | Robo-Sumo | Head-to-head bouts (on-campus arena) |
| 3 | Finals | Judged finals |

All three are **manually scored via a rubric** — see the exact point breakdown in **[events/robotics-championship.md](events/robotics-championship.md)**.

---

## Before you start

1. Complete the shared admin setup from Simulation 1 (member platform ON, the 50 participants bulk-imported). See **[../simulation-1-general/](../simulation-1-general/)**.
2. You are signed in at `/login` and can open `/admin`. You need `event.manage` — you have it if you are staff/admin/developer globally, **or** a coordinator of the Robotics Club (the club you'll set as organizer).
3. The 50-account sheet is reused here: **[../data/participants-50.csv](../data/participants-50.csv)** (`sim.user.01..50@iitjammu.ac.in`, passwords `Welcome#2001..Welcome#2050`).

⚠ **Admin-set passwords force a first-login change.** Every bulk-imported account is created with "must change password on first login" ON. Send each participant their **initial** password from the sheet; on first login they set their own. This is expected and correct.

---

## Step 1 — Create the event (listing)

Navigate: **Admin → Content**.

1. Click **+ New content**.
2. Content type → choose **Event**.
3. Title → `Robotics Championship`.
4. Click **Create draft**.

On the event's content page, fill:

| Field | Value |
|-------|-------|
| Event date | your championship date |
| Category | `technical` |
| Audience | `public` (so it appears on the public site) |
| Location | `Robotics Arena, IIT Jammu` |
| Body | short description of the three rounds |

5. Click **Publish**.

✅ **Verify:** The event now shows as **Published**, and opening its public page (from the public site) displays the title `Robotics Championship`. An event only opens for registration once it is **Published**.

---

## Step 2 — Set the Robotics Club as organizer

Navigate: **Admin → Event Playground (`/admin/events`)** → select **Robotics Championship** → **Organizers**.

1. Tag the **Robotics Club** as **Organizer**.

✅ **Verify:** The Robotics Club appears in the event's Organizers list. From now on, a coordinator of the Robotics Club can manage this event (scoped `event.manage`).

> Tagging organizers is a **central action** (admin/staff/developer). If you plan to co-run this with the Coding Club, see **[03-COLLABORATION-AND-LEADERBOARD.md](03-COLLABORATION-AND-LEADERBOARD.md)** — you can add the Coding Club as a second organizer so both clubs' coordinators co-manage one event and one shared leaderboard.

---

## Step 3 — Open registration (capacity + waitlist)

Arena slots are limited, so set a capacity. Seats fill to capacity as **confirmed**; anyone over the cap becomes **waitlisted**. If you later raise the capacity, the earliest waitlisted members are **auto-promoted** to confirmed.

Navigate: **Admin → Event Playground → Robotics Championship → Registration settings**.

| Field | Value |
|-------|-------|
| Capacity (blank = unlimited) | `48` |
| Registration opens at (go-live) | your open time (or use **Go live now**) |
| Registration closes at (deadline) | your deadline |
| Who can register (none checked = open to every member) | leave unchecked = open to every member |

1. Save the settings, then click **Go live now** to open registration immediately.

✅ **Verify:** The event's public page now shows a **Register** button. As members register, the first **48** become **confirmed** and any beyond that become **waitlisted**.

**Proven behavior (already tested end-to-end):** with capacity **48** and 50 registrants, **48 confirmed + 2 waitlisted**. Raising capacity to **50** **auto-promoted the 2 waitlisted** members → **50 confirmed**. (A confirmed member cancelling also auto-promotes the next waitlisted member.)

✅ **Verify (after raising capacity):** In the participants list, waitlisted members flip to **confirmed** with no manual action, and the participants CSV shows all 50 as confirmed.

---

## Step 4 — Create the 3 rounds

Navigate: **Admin → Event Playground → Robotics Championship → Rounds**.

For each round below, click **Create round** and fill:

| Round | Name | Description (optional) | Starts at / Ends at (optional) |
|-------|------|------------------------|-------------------------------|
| 1 | `Line-Follower` | Time trial | your slot times |
| 2 | `Robo-Sumo` | Head-to-head bouts | your slot times |
| 3 | `Finals` | Judged finals | your slot times |

Rounds are numbered automatically (1, 2, 3). To edit or delete a round later, use the round's **id**.

✅ **Verify:** Three rounds appear — **Line-Follower**, **Robo-Sumo**, **Finals** — numbered 1, 2, 3.

---

## Step 5 — Enter scores per round

Score each round from its rubric (full breakdown in **[events/robotics-championship.md](events/robotics-championship.md)**). Use the per-round **score sheet**: type each participant's points, then **Save**.

Navigate: **Admin → Event Playground → Robotics Championship → Scores** → pick the round.

1. Open **Round 1 — Line-Follower**, type each participant's points, click **Save**.
2. Open **Round 2 — Robo-Sumo**, type points, click **Save**.
3. Open **Round 3 — Finals**, type points, click **Save**.

**How saving works:** Saving **replaces** that round's sheet, so you always see one clean set of numbers for the round. The **overall leaderboard is the sum across all rounds** and **recomputes on every save**.

✅ **Verify:** After saving each round, the overall leaderboard updates immediately. After all three rounds are saved, each participant's overall = Round 1 + Round 2 + Round 3.

---

## Step 6 — Watch the overall leaderboard reshuffle

The overall leaderboard is **live**: it sums each member's points across rounds and ranks with standard competition ranking (ties share a rank). It re-ranks every time you save a round — so the leader can change between rounds.

**Proven behavior:** in the tested manual event, the **Round 1 leader was Participant 01**, but after Round 2 the **overall winner became Participant 04 (196 pts)** — the leaderboard re-ranked on cumulative performance. Expect the same here as Robo-Sumo and Finals results come in.

**Declaring results at any point:** the ranking is always current, so to declare standings midway (e.g. after Round 2) just read or **download the ranking CSV** at that moment. There is **no separate "freeze" button** for round events — the formal wrap-up is the Closure Report (Step 9).

✅ **Verify:** After saving Round 2, the top of the leaderboard differs from the Round 1 top (a lower Round 1 finisher who dominated Round 2 climbs), and the download reflects the same order you see on screen.

---

## Step 7 — Attendance (optional)

⚠ **Attendance is always optional.** There is no on/off toggle at event creation. Marking it (or not) changes nothing else — registered participants can start as soon as registration is open / the event is live.

- **On-campus arena rounds (Line-Follower, Robo-Sumo):** you *can* mark attendance if you want a physical roll.
- **Remote qualifier (if a round is run remotely):** simply **don't** mark attendance — skip it entirely.

To mark it: **Admin → Event Playground → Robotics Championship → Attendance** → pick the round → mark **present/absent** → **Save**.

**Proven behavior:** attendance was captured cleanly per round (e.g. R1 46/50, R2 48/50) and appears on participant profiles.

✅ **Verify:** For a round you marked, the attendance sheet shows your present/absent flags after Save; for a round you skipped, no attendance is recorded and nothing else about the event changes.

---

## Step 8 — Downloads

Navigate: **Admin → Event Playground → Robotics Championship → Downloads**.

You can download, at any moment:

| CSV | Contents |
|-----|----------|
| Participants | everyone registered + their status |
| Ranking | the overall leaderboard (sum across rounds, ranked) |
| Scores | per-round points |
| Attendance | per-round present/absent (only for rounds you marked) |

✅ **Verify:** Each download opens as a CSV. The **ranking** CSV lists all participants in the same order as the on-screen overall leaderboard.

---

## Step 9 — Closure report

The formal wrap-up. As organizer you submit the report; a central admin reviews it.

Navigate: **Admin → Event Playground → Robotics Championship → Closure report**.

1. Fill **roleContribution** (text — what the Robotics Club did / who did what).
2. Fill **reportedBudget** (number — your spend).
3. **Submit.**

A central admin then reviews it (adds a comment + a corrected budget). Status moves **submitted → reviewed**.

✅ **Verify:** After you submit, the report status reads **submitted**; after the admin reviews it, the status reads **reviewed** with the admin's comment and corrected budget shown.

---

## What participants see afterward

Each participant's profile (`/profile` and `/member/profile`) **automatically** lists this event with their registration status, attendance, points, and overall rank — no extra step from you.

✅ **Verify:** Open any participant's profile and confirm **Robotics Championship** appears with their points and rank. (Proven: 50/50 profiles updated in the tested run.)

---

## Co-organize with the Coding Club

To run this as a joint **Coding Club × Robotics Club** championship on one event with **one shared leaderboard**, a central admin tags **both** clubs as organizers so both clubs' coordinators co-manage it. Full walkthrough: **[03-COLLABORATION-AND-LEADERBOARD.md](03-COLLABORATION-AND-LEADERBOARD.md)**.
