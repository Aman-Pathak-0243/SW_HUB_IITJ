# Host an Event — End-to-End Manual (Simulation 1)

This is the complete, click-by-click guide for running one event on the IIT Jammu Student Affairs Portal, from the moment you sign in to the moment you submit the closure report. It follows a real, two-round **Hackathon** that we ran end-to-end as a test: 50 participants, capacity raised from 48 to 50, two scored rounds, attendance, a live leaderboard, and full CSV exports — **28 of 28 automated checks passed**.

Do every step in order the first time. Each step tells you the exact page to open, the exact field and the exact value to enter, and a **✅ Verify:** line stating what you should see on screen to know it worked.

**Companion files in this kit**
- Participant walkthrough (share with your members): [`02-PARTICIPANT-MANUAL.md`](02-PARTICIPANT-MANUAL.md)
- Closure report walkthrough: [`03-RESULTS-AND-CLOSURE.md`](03-RESULTS-AND-CLOSURE.md)
- The 50 test accounts: [`../data/participants-50.csv`](../data/participants-50.csv)
- Scoring rubric fixture: [`events/hackathon.md`](events/hackathon.md)

---

## Before you start — what you need

| You need | Details |
|---|---|
| An organizer login | Your account must be able to **manage events**: a staff/admin/developer account, **or** a coordinator of the club that is organizing the event. |
| The bootstrap admin | The first admin/developer login comes from the site setup (the `BOOTSTRAP_ADMIN_EMAILS` / `BOOTSTRAP_DEVELOPER_EMAIL` accounts). If you don't have a login yet, ask whoever set up the portal. |
| The participant sheet | [`../data/participants-50.csv`](../data/participants-50.csv) — 50 accounts (`sim.user.01..50@iitjammu.ac.in`, passwords `Welcome#2001..Welcome#2050`). |

---

## Step 1 — Sign in and open the admin panel

1. Go to **`/admin`** in your browser. If you are not signed in you will be sent to the login page (**`/login`**).
2. Enter your **email** and **password** and sign in.
3. You land on the **Dashboard** (**`/admin`**). On the left is the sidebar. **You only see the modules you have permission for.**

The modules you'll use in this manual:

| Sidebar item | Path | Used for |
|---|---|---|
| Plugins | `/admin/plugins` | Turning the member platform on (Step 2) |
| Users & Roles | `/admin/users` | Bulk-importing participants (Step 3) |
| Content | `/admin/content` | Creating & publishing the event (Step 4) |
| Event Playground | `/admin/events` | Registration, rounds, scores, attendance, downloads (Steps 5–12) |

**✅ Verify:** you see the left sidebar with **Dashboard, Content, Event Playground, Users & Roles** (and possibly more). If the sidebar is missing these, your account does not have event-management permission — get a coordinator/admin login before continuing.

---

## Step 2 — Make sure the member platform is ON

Members can only log in and register when the **member platform** plugin is enabled.

1. Sidebar → **Plugins** (**`/admin/plugins`**).
2. Find **`member_platform`** and switch it **ON**.

**✅ Verify:** `member_platform` shows as **On / enabled**. (If you prefer the command line, the equivalent is `npm run plugin:on`.)

> If this is left off, member login and registration are disabled and Step 6 will not work.

---

## Step 3 — Bulk-import the 50 participants and send their passwords

You inject participants by pasting or uploading a CSV.

### 3a. The CSV format

Columns are: `email,password,name,role`

- **email** and **password** are required. `name` and `role` are optional.
- A header row starting with `email,...` is automatically skipped, so you can leave it in.
- **Password rule:** at least **10 characters**, with at least **one UPPERCASE, one lowercase, and one digit** (a symbol is allowed but not required). Example that passes: `Welcome#2001`.
- **role** is optional. Valid values: `normal_user`, `staff`, `coordinator`, `co_coordinator`, `secretary`. Leave it **blank** for an ordinary member (that becomes `normal_user`).

The provided sheet [`../data/participants-50.csv`](../data/participants-50.csv) already follows all of this: 50 accounts, rows 46–48 are `staff`, rows 49–50 are `coordinator`, and the rest are `normal_user`.

### 3b. Import

1. Sidebar → **Users & Roles** (**`/admin/users`**).
2. Open the **bulk import** area and **paste the CSV text or upload the file** [`../data/participants-50.csv`](../data/participants-50.csv).
3. Run the import.

The import is **idempotent by email** — if you re-run it, accounts that already exist are skipped, so it is safe to import twice.

**✅ Verify:** the users list now shows the 50 `sim.user.NN@iitjammu.ac.in` accounts. (Command-line equivalent: `npm run cli user:import-csv --file=simulations/data/participants-50.csv`.)

### 3c. ⚠ Send each user their INITIAL password — they must change it on first login

> **⚠ Reality note (expected and correct):** every account you create this way is flagged **"must change password on first login."** So you send each person the **initial** password from the sheet (e.g. `sim.user.01@iitjammu.ac.in → Welcome#2001`), and the **first time they sign in the portal forces them to set their own new password.** This is by design — it is not a bug and there is nothing extra for you to configure.

Email or message each participant: their **email address**, their **initial password** from the sheet, and one line: *"On your first login you'll be asked to set a new password."* Point them to [`02-PARTICIPANT-MANUAL.md`](02-PARTICIPANT-MANUAL.md) for the rest.

**✅ Verify:** pick one test account, sign in with its initial password at `/login`, and confirm you are immediately prompted to choose a new password.

---

## Step 4 — Create and PUBLISH the event listing

An event must be **published** before it can open for registration.

1. Sidebar → **Content** (**`/admin/content`**).
2. Click **"+ New content"** → choose content type **"Event"**.
3. Enter a **Title**, e.g. `IIT Jammu Hackathon 2026`, then click **"Create draft."**
4. On the event's content page, fill these fields:

| Field | Value to enter (example) |
|---|---|
| Event date | The day of your event, e.g. `2026-08-15` |
| Category | `technical` (other options: `cultural`, `sports`) |
| Audience | **`public`** ← required so it appears on the public site |
| Location | `Central Lecture Theatre, IIT Jammu` |
| Body | A short description of the event, rounds, and rules |

5. Click **Publish.**

**✅ Verify:** the event's status shows **Published**, and opening its **public page** (linked from the content page) shows the title, date, and description to the public.

> Keep the event's **public page link** handy — that is what participants open to register in Step 6.

---

## Step 5 — Set registration (capacity, window, go-live, who can register)

1. Sidebar → **Event Playground** (**`/admin/events`**) and **select your event**.
2. Open the **Registration settings** and fill:

| Field | What it does | Example value |
|---|---|---|
| Capacity (blank = unlimited) | Confirmed seats; extras go to a waitlist | `48` |
| Registration opens at (go-live) | When registration starts | leave blank if you'll use "Go live now" |
| Registration closes at (deadline) | When registration stops | `2026-08-14 23:59` |
| Who can register (none checked = open to every member) | Restrict to certain groups, or leave all unchecked to allow every member | leave **unchecked** (open to all) |

3. Click **Save.**
4. To open registration immediately, click **"Go live now."**

> **About the waitlist (this is proven behavior):** with capacity `48`, the first 48 registrants become **confirmed** and any extras become **waitlisted**. In our test, 48 confirmed + 2 waitlisted; when we later raised capacity to **50**, the **2 earliest waitlisted members were auto-promoted** to confirmed — no manual action needed. Likewise, if a confirmed member cancels, the next waitlisted member is auto-promoted.

**✅ Verify:** the event's public page now shows a **Register** button, and the Event Playground shows registration status as **open / live**.

---

## Step 6 — How participants register

Point your members to [`02-PARTICIPANT-MANUAL.md`](02-PARTICIPANT-MANUAL.md). In short, each member:

1. Signs in at **`/login`** (and sets a new password on first login — see Step 3c).
2. Opens the **event's public page**.
3. Clicks **Register.** Seats fill to capacity as **confirmed**; overflow becomes **waitlisted**.

**✅ Verify:** in **Event Playground → your event**, the participant count rises as people register, and you can see who is **confirmed** vs **waitlisted**. In our test this filled to 48 confirmed + 2 waitlisted, then to 50 confirmed after we raised capacity.

---

## Step 7 — Create the rounds

This event has two scored rounds. (See the rubric in [`events/hackathon.md`](events/hackathon.md).)

1. In **Event Playground → your event**, find **Rounds** and click **"Create round."**
2. Create **Round 1**:

| Field | Value |
|---|---|
| Name | `Round 1 — Prelims` |
| Description (optional) | `Idea/problem-fit 40, feasibility 30, clarity 30 (max 100)` |
| Starts at (optional) | leave blank or set the round's start time |
| Ends at (optional) | leave blank or set the round's end time |

3. Click **Create round** again and create **Round 2**:

| Field | Value |
|---|---|
| Name | `Round 2 — Finals` |
| Description (optional) | `Working demo 40, technical depth 30, presentation 30 (max 100)` |

Rounds are **numbered automatically** in the order you create them. To edit or delete a round later, use that round's id shown in the Rounds list.

**✅ Verify:** the Rounds list shows **Round 1 — Prelims** and **Round 2 — Finals**, numbered 1 and 2.

---

## Step 8 — Conduct the rounds and enter scores

Scoring here is **manual**: you type each participant's points into that round's score sheet.

### The rubric (proven fixture)

| Round | Criteria (max 100) | Overall |
|---|---|---|
| Round 1 — Prelims | idea/problem-fit 40 + feasibility 30 + clarity 30 | Round 1 + Round 2 |
| Round 2 — Finals | working demo 40 + technical depth 30 + presentation 30 | (max 200) |

### Enter the scores

1. In **Event Playground → your event**, open the **Scores** section and select **Round 1 — Prelims**.
2. For each participant, type their **total points for that round** (0–100), e.g. Participant 01 → `92`.
3. Click **Save.**
   > **How Save behaves:** saving **replaces** that round's whole sheet, so you always see exactly one clean set of Round 1 scores. The **overall leaderboard** is the **sum across rounds** and **recomputes on every save.**
4. Repeat for **Round 2 — Finals**: select it, enter each participant's Round 2 points, click **Save.**

**✅ Verify:** after saving, the round's sheet shows the points you entered, and the overall leaderboard updates. (In our test the Round 1 leader was **Participant 01**; after Round 2 the **overall winner became Participant 04 with 196 points** — the leaderboard correctly re-ranked on cumulative performance.)

---

## Step 9 — Attendance (mark it, or skip it for remote events)

1. In **Event Playground → your event**, open **Attendance** and select a round.
2. Mark each participant **present** or **absent**, then click **Save.**
3. Repeat per round as needed.

> **⚠ Reality note:** attendance is **always optional**. There is **no on/off toggle** at event creation. If your event is **remote** (or you simply don't want to track attendance), **just don't mark it** — nothing else changes, and registered participants can still take part as soon as registration is open / the event is live.

**✅ Verify (only if you use it):** the attendance sheet shows your present/absent marks per round. (In our test: Round 1 = 46/50 present, Round 2 = 48/50 present.)

---

## Step 10 — View the live leaderboard

- The **overall leaderboard** is the **sum of each member's points across all rounds**, ranked with **standard competition ranking** (ties share a rank, e.g. two 1sts, then a 3rd).
- It is **live**: it recomputes **every time you save scores** (Step 8).

**✅ Verify:** open the leaderboard in Event Playground and confirm it is ordered highest-total first and reflects your latest saves.

---

## Step 11 — Conclude / declare results (including "midway")

Because the leaderboard is **always current**, you can **declare results at any moment** — just read or download it then.

- **To declare results midway** (e.g. announce standings after Round 1, or for an unlimited-participant event): open the leaderboard and read it, or download the **ranking CSV** (Step 12) at that instant. **There is no separate "freeze" button** for round events — the ranking you see/download at that moment *is* the result.
- The **formal wrap-up** for a round event is the **Closure Report** (Step 12 / [`03-RESULTS-AND-CLOSURE.md`](03-RESULTS-AND-CLOSURE.md)).

**✅ Verify:** the ranking you download matches the on-screen leaderboard at the moment you declare.

---

## Step 12 — Download the results, then file the closure report

### 12a. Download the CSVs

In **Event Playground → your event**, use the **Downloads** section. Four exports are available:

| CSV | Contents (proven counts for our 50-person, 2-round test) |
|---|---|
| Participants | Every registrant and their status — **50 rows** |
| Ranking | The overall leaderboard, ranked — **50 rows** |
| Scores | Per-round scores — **100 rows** (50 × 2 rounds) |
| Attendance | Per-round attendance — **100 rows** (50 × 2 rounds) |

**✅ Verify:** each CSV downloads and opens in a spreadsheet with the expected number of rows.

> Participants don't need these files to see their own results: each member's profile (**`/profile`** and **`/member/profile`**) automatically lists every event they took part in with their **registration status, attendance, points, and overall rank** — no extra step. In our test, all **50/50** profiles updated.

### 12b. File the closure report

The closure report is the formal wrap-up. You submit two things and a central admin reviews it:

| You submit | Central admin adds | Result |
|---|---|---|
| **roleContribution** (text) — what your club/team did | A review comment | Status becomes **"reviewed"** |
| **reportedBudget** (number) — what you spent | A corrected budget number | (proven: submitted → reviewed) |

Full walkthrough: [`03-RESULTS-AND-CLOSURE.md`](03-RESULTS-AND-CLOSURE.md).

**✅ Verify:** after you submit, the report shows **submitted**; after the admin reviews it, the status shows **reviewed**.

---

## Optional — co-organizing with another club

If two clubs run one event together (e.g. Coding Club × Robotics Club) and should share **one** leaderboard:

1. In **Event Playground → your event → Organizers**, tag one or more clubs as **ORGANIZER** or **COLLABORATOR** (you can also tag a custom entity or a person).
2. A **coordinator of any organizing club** can then co-manage the event.

> Defining organizers is a **central action** — it must be done by an admin, staff, or developer.

**✅ Verify:** the tagged clubs appear under Organizers, and their coordinators can open the event in Event Playground.

---

## One-page checklist

1. Sign in at `/admin`.
2. Plugins → turn on `member_platform`.
3. Users & Roles → bulk-import [`../data/participants-50.csv`](../data/participants-50.csv) → send everyone their initial password (⚠ they change it on first login).
4. Content → New content → Event → set Audience = `public` → **Publish**.
5. Event Playground → set Capacity / window / who-can-register → **Go live now**.
6. Members register on the event's public page (see [`02-PARTICIPANT-MANUAL.md`](02-PARTICIPANT-MANUAL.md)).
7. Create Round 1 and Round 2.
8. Enter and **Save** each round's scores (Save replaces that round; leaderboard re-sums).
9. Attendance — mark it, or ⚠ skip it for remote.
10. Watch the live leaderboard.
11. Declare results any time by reading/downloading the ranking (no freeze button).
12. Download the 4 CSVs → file the **Closure Report** ([`03-RESULTS-AND-CLOSURE.md`](03-RESULTS-AND-CLOSURE.md)).
