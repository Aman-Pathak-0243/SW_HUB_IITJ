# Collaboration & Shared Leaderboard (co-organizing clubs)

This guide shows how **two clubs run ONE event together** — for example a joint
**Coding Club × Robotics Club** event — with **one shared leaderboard** that both clubs feed.
The result: coordinators from either club manage the same event, enter scores into the same
score sheets, and everyone sees a single overall ranking.

## Before you start

- You are signed in at `/login` and the member platform is ON (Admin → Plugins → "member_platform").
- The event already exists and is **Published** (created in Admin → Content as a "Event" content type).
- **Defining organizers is a CENTRAL action.** Only a global **admin / staff / developer** can tag
  which clubs organize an event. Once tagged, each club's **coordinator** can manage the event.

---

## 1. Tag both clubs on the event

Go to **Admin → Event Playground (`/admin/events`)** → select your event → open the **Organizers** section.

Add each club as its own entry:

| Field | Coding Club entry | Robotics Club entry |
|---|---|---|
| Who to tag | Coding Club | Robotics Club |
| Role tag | **ORGANIZER** | **ORGANIZER** (or **COLLABORATOR**) |

Notes:
- You can tag **one or more clubs**. You may also tag a custom entity or a person if needed.
- Both clubs can be **ORGANIZER**, or you can make one **ORGANIZER** and the other **COLLABORATOR**.
  The practical difference is explained in Step 2.

✅ **Verify:** In the Organizers section you now see **two entries** — Coding Club and Robotics Club —
each with its role tag showing.

---

## 2. "Organizer" vs "Collaborator" — the practical difference

The management power that unlocks scoped `event.manage` comes from being tagged as an **ORGANIZER**.

| Tag | What a club's coordinator can do |
|---|---|
| **ORGANIZER** | A coordinator of this club can **manage the event** — open the event's management page, create rounds, enter scores, mark attendance, run downloads. This is scoped `event.manage`. |
| **COLLABORATOR** | A billing/credit tag: the club is publicly credited as helping run the event, **without** granting its coordinators event-management access. |

Practical rule of thumb:
- Want **both** clubs' coordinators to co-manage and both to enter scores → tag **both as ORGANIZER**.
- Want one club to run the operations and the other to simply be **named as a partner** → make the
  running club **ORGANIZER** and the partner **COLLABORATOR**.

For a true joint Coding × Robotics event where both sides score participants, use **ORGANIZER on both**.

---

## 3. One shared leaderboard — scores from either club add up

There is only **one** overall leaderboard per event, and it is the **sum of each participant's points
across all rounds**. It does not matter which club's coordinator typed the points in — every saved
score sheet feeds the **same** overall ranking.

How it behaves:
1. A Coding Club coordinator opens a round's **score sheet**, enters points per participant, clicks **Save**.
2. A Robotics Club coordinator opens the **next round's** score sheet, enters points, clicks **Save**.
3. The overall leaderboard = **Round 1 + Round 2 + …**, re-ranked automatically on every save
   (standard competition ranking — ties share a rank).

Saving a round **replaces** that round's sheet (you always see one clean set for that round), and the
overall leaderboard **recomputes live** each time.

> **Re-ranking is real, and proven.** In our end-to-end simulation the Round 1 leader was
> **Participant 01**. After Round 2 scores were saved, cumulative performance moved the top spot to
> **Participant 04 (196 pts)** — the shared leaderboard re-ranked on total performance across both
> rounds. This is exactly what a two-club event needs: no matter who scores which round, one honest
> combined ranking.

✅ **Verify (shared leaderboard):** After both clubs have saved their rounds, open the event's
leaderboard / download the **ranking CSV** — you see **one list** where each participant's score is the
**sum** of the points entered by *both* clubs, ordered highest-first. Change one round's scores and Save;
the overall order updates immediately.

---

## 4. Verify collaboration actually works

Confirm that a coordinator from **each** organizing club can reach the same management page.

1. Have a **Coding Club coordinator** sign in at `/login`, then go to **Admin → Event Playground**
   and open the event.
2. Have a **Robotics Club coordinator** sign in at `/login`, then go to **Admin → Event Playground**
   and open the **same** event.

✅ **Verify (both can manage):** Each coordinator sees the event listed in Event Playground and can
open its management page — rounds, score sheets, attendance, and downloads are all available to both.
Neither had to be made a global admin; the **ORGANIZER** tag on their club granted the access.

✅ **Verify (one truth):** Points saved by the Coding Club coordinator and points saved by the Robotics
Club coordinator both appear on the **same** overall leaderboard, and the ranking reflects the combined
total.

---

## Wrapping up a joint event

- **Declaring results at any point:** the leaderboard is always current, so to "declare" you simply
  read or **download the ranking CSV** at that moment. There is no separate freeze button for round events.
- **Formal close-out:** an organizer from either club submits the **Closure Report** (role contribution
  text + reported budget); a central admin reviews it (comment + corrected budget) and its status
  becomes **reviewed**.

See also: `02-…` for running the scored rounds, and `../data/participants-50.csv` for the ready-to-import
participant sheet.
