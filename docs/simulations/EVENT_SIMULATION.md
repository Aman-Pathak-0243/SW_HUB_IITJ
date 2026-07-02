# Event Simulation & Organizer's Manual

> **Two documents in one.** This is (a) a **step-by-step manual** for organizing an
> event on the portal — create it, open registration, run the rounds, publish the
> leaderboard, take attendance, and close it out — and (b) the **verification record**
> of a full end-to-end simulation that exercised every one of those features with
> **50 participants and 2 rounds**.
>
> **Result: 28 / 28 feature checks PASSED.** Run on local PostgreSQL in ~3.2 seconds.

| | |
|---|---|
| **Event** | *SIM · Inter-Hostel Hackathon 2026* (`slug: sim-hackathon-2026`) |
| **Rounds** | Round 1 — Prelims · Round 2 — Finals |
| **Participants** | 50 member accounts (created, logged in, registered) |
| **Organizer** | `developer@iitjammu.ac.in` (a global `event.manage` holder) |
| **Academic year** | 2025–26 |
| **Outcome** | 28/28 checks passed; leaderboard, attendance and every member profile verified |

---

## 1. Background: what "an event" is on this portal

An event lives in **two layers** that work together:

1. **The event listing** — a CMS content item of type *Event* (title, date, category,
   description, cover image). This is what visitors see on the public **Events** page.
2. **The event playground** — the operational layer bound to that listing:
   registration (with capacity → waitlist → auto-promote), rounds, scoring, ranking,
   attendance, CSV downloads, and a closure report.

**A note on "leaderboards".** There are two, for two different needs:
- **Event ranking** (used here) — the standings computed from the **scores organizers
  enter per round**; the overall board is the **sum across rounds**. It updates every
  time scores are saved. *This is the leaderboard for a multi-round competition.*
- **Live quiz leaderboard** — a separate real-time (SSE) board for the built-in live
  quiz feature, which pushes updates to viewers' screens instantly. Use this only when
  you run a *live quiz*; it is not covered by this event simulation.

---

## 2. Organizer's step-by-step guide

Each step below is written as a **how-to**, followed by the **verified result** from the
simulation. Everything is done from the **Admin panel** (`/admin`) — or, for a club's own
event, from the **Coordinator panel** (`/coordinator`). You must be signed in with
`event.manage` (staff / admin / developer globally, or a coordinator for the organizing club).

### Step 1 — Create and publish the event
**Where:** Admin → **Content** → **+ New content** → choose **Event** → enter the title →
**Create draft**, then fill the details and **Publish**.
An event is only open for registration once it is **published**.

> ✅ **Verified:** event created as `content_type = event` and published (`slug=sim-hackathon-2026`).

### Step 2 — Add the rounds
**Where:** open the event in the Admin → **Events** module → **Create round** (name +
optional description / timing). Add one row per stage.

> ✅ **Verified:** *Round 1 — Prelims* and *Round 2 — Finals* created (2 rounds).

### Step 3 — Open registration
**Where:** the event's **Events** management page → set **capacity**, the **registration
window** (opens / closes), and, optionally, **who may register** (leave empty = open to all
members). Toggle **registration closed** to stop intake at any time.

> ✅ **Verified:** capacity **48**, window opened (now-1 day → now+30 days), open to all.
> *(Capacity was intentionally set below 50 so the waitlist could be demonstrated.)*

### Step 4 — Members register (self-service)
**Where:** members sign in and click **Register** on the event's public page.
The portal assigns **confirmed** seats up to capacity, then **waitlists** the overflow.
If you later **raise the capacity**, the earliest waitlisted members are **auto-promoted**.

> ✅ **Verified:** all 50 registered → **48 confirmed + 2 waitlisted**. Capacity raised to
> **50** → **2 auto-promoted** → **50 confirmed, 0 waitlisted**. Capacity, waitlist, and
> auto-promote all behaved correctly.

### Step 5 — Conduct the rounds and enter scores
**Where:** the event's management page → **scores** sheet for each round → enter points per
participant → **Save**. Saving replaces that round's sheet (so you always see one clean set),
and the **leaderboard recomputes immediately**. The **overall** board is the sum across rounds.

> ✅ **Verified — the board updates as scores come in.** Round 1 scores were entered in
> batches; the leaderboard grew **10 → 30 → 50** ranked participants as each batch was saved.
> After Round 2, the standings **re-ranked on cumulative performance**: the Round-1 leader
> (*Participant 01*, 100 pts) was overtaken — the **overall winner became *Participant 04*
> with 196 pts**. See the evidence tables in §3.

### Step 6 — Take attendance
**Where:** the event's management page → **attendance** sheet per round → mark each
participant present / absent → **Save**.

> ✅ **Verified:** Round 1 **46/50** present, Round 2 **48/50** present. A member counts as
> "attended" if present in **any** round → **48/50** overall (2 no-shows in both rounds).

### Step 7 — Download rosters and results (CSV)
**Where:** the event's management page → **Download** → choose *participants, ranking,
scores,* or *attendance*. Files are ready to open in Excel / Google Sheets.

> ✅ **Verified:** participants (50 rows), ranking (50), scores (100 = 50×2 rounds),
> attendance (100). The gated **registration roster** (with emails) also returned all 50.

### Step 8 — Submit the closure report
**Where:** after the event, the organizer submits a **closure report** (what each role
contributed + the budget). A central admin then **reviews** it (comment + corrected budget).

> ✅ **Verified:** closure report submitted and moved to **status = reviewed** after central review.

### Step 9 — What members see afterwards
Each member's **profile** (`/profile` and `/member/profile`) automatically reflects the event:
their **registration status, attendance, points, and overall rank** — no extra step needed.

> ✅ **Verified:** re-reading all 50 profiles — **50/50** show the event, points and overall
> rank; **48/50** show attended; **50/50** show a recorded last-login. See §3.

---

## 3. Simulation evidence

### 3.1 Leaderboard updates continuously (Round 1, as scores are entered)

| Scores entered | Ranked on board | Leader |
|---:|---:|---|
| 10 | 10 | Sim Participant 01 (100 pts) |
| 30 | 30 | Sim Participant 01 (100 pts) |
| 50 | 50 | Sim Participant 01 (100 pts) |

*The board grew with every save. (The top 5 stayed stable here only because the highest
scorers happened to be entered first; the genuine re-ranking is shown next.)*

### 3.2 Leaderboard re-ranks on performance (after Round 2)

Round 2 rewarded different participants, so the **overall** standings reshuffled. The
Round-1 leader (*Participant 01*) dropped out of the top 10; the new overall winner is
*Participant 04*:

| Rank | Participant | Overall points (R1 + R2) |
|---:|---|---:|
| 1 | Sim Participant 04 | 196 |
| 2 | Sim Participant 08 | 194 |
| 3 | Sim Participant 12 | 192 |
| 4 | Sim Participant 16 | 190 |
| 5 | Sim Participant 20 | 188 |
| 6 | Sim Participant 24 | 186 |
| 7 | Sim Participant 03 | 184 |
| 8 | Sim Participant 07 | 182 |
| 9 | Sim Participant 11 | 180 |
| 10 | Sim Participant 15 | 178 |

> **Leader changed:** Round 1 → *Sim Participant 01* · Overall → *Sim Participant 04*. This
> confirms the leaderboard reflects **actual cumulative performance**, not registration order.

### 3.3 Member profiles reflect the result (first 10 of 50)

| Member | Registration | Attended | Points | Overall rank | Login recorded |
|---|---|:---:|---:|---:|:---:|
| sim.user.01 | confirmed | yes | 160 | 25 | yes |
| sim.user.02 | confirmed | yes | 172 | 13 | yes |
| sim.user.03 | confirmed | yes | 184 | 7 | yes |
| sim.user.04 | confirmed | yes | 196 | 1 | yes |
| sim.user.05 | confirmed | yes | 158 | 27 | yes |
| sim.user.06 | confirmed | yes | 170 | 15 | yes |
| sim.user.07 | confirmed | yes | 182 | 8 | yes |
| sim.user.08 | confirmed | yes | 194 | 2 | yes |
| sim.user.09 | confirmed | yes | 156 | 29 | yes |
| sim.user.10 | confirmed | yes | 168 | 17 | yes |

**Aggregate over all 50 members:** event shown 50/50 · points 50/50 · overall rank 50/50 ·
attended 48/50 · last-login recorded 50/50.

---

## 4. Full feature checklist (28 / 28 PASS)

| # | Feature | Result |
|---:|---|:---:|
| 1 | Create + publish event (CMS `content_type=event`) | ✅ |
| 2 | Add event rounds | ✅ |
| 3 | Configure registration window + capacity | ✅ |
| 4 | Create 50 member accounts | ✅ |
| 5 | Authenticate all 50 members (credentials login) | ✅ |
| 6 | Reject wrong password | ✅ |
| 7 | Self-registration for all 50 | ✅ |
| 8 | Capacity enforced → overflow waitlisted | ✅ |
| 9 | Auto-promote waitlist on capacity raise | ✅ |
| 10 | Round 1 scoring | ✅ |
| 11 | Leaderboard updates continuously as scores are entered | ✅ |
| 12 | Round 2 scoring | ✅ |
| 13 | Overall leaderboard = cumulative across rounds | ✅ |
| 14 | Leaderboard re-ranks on performance (leader changed) | ✅ |
| 15 | Mark attendance (round 1) | ✅ |
| 16 | Mark attendance (round 2) | ✅ |
| 17 | Read attendance sheet (organizer, gated) | ✅ |
| 18 | CSV export: participants | ✅ |
| 19 | CSV export: ranking | ✅ |
| 20 | CSV export: scores | ✅ |
| 21 | CSV export: attendance | ✅ |
| 22 | Registration roster (organizer, PII-gated) | ✅ |
| 23 | Closure report submit + central review | ✅ |
| 24 | Every profile shows the event participation | ✅ |
| 25 | Every profile shows points | ✅ |
| 26 | Every profile shows an overall rank | ✅ |
| 27 | Attendance reflected in profile | ✅ |
| 28 | Login reflected in profile (last-login) | ✅ |

---

## 5. How to reproduce

The simulation is a self-contained, **idempotent**, re-runnable script (a guarded test).
It drives the **same service functions** the Admin/Coordinator UI and the `/api` routes use,
so a green run means the real feature works.

```bash
# 1. Start the local database and apply schema + seed (roles, permissions, current year)
npm run db:local:up
npm run db:seed                       # loads the DB pointed to by .env.local

# 2. Run the simulation (guarded by RUN_SIM so the normal suites skip it)
RUN_SIM=1 ./node_modules/.bin/dotenv -e .env.local -- \
  ./node_modules/.bin/vitest run tests/event-simulation.test.mjs \
  --pool=forks --poolOptions.forks.singleFork

# Optional: write the run log + JSON summary to a folder
RUN_SIM=1 SIM_OUT=./ ./node_modules/.bin/dotenv -e .env.local -- \
  ./node_modules/.bin/vitest run tests/event-simulation.test.mjs
```

- Source: [`tests/event-simulation.test.mjs`](../../tests/event-simulation.test.mjs).
- Scoring is deterministic (Round 1 = `100 − i`; Round 2 = a scrambled `60…109`) so the
  numbers above are reproducible on every run.
- Re-runs reuse the same 50 accounts and event (find-or-create), so nothing accumulates.

---

## 6. Notes & housekeeping

- **Where the data lives:** this run executed against the DB in `.env.local` (the local
  Docker Postgres database `iitj_test`). The `test:db` suites were re-run afterwards and
  remained **21/21 green** — the simulation data does not interfere with them.
- **Cleaning up the sample data** (optional) — to remove the 50 `sim.user.*` accounts and the
  `sim-hackathon-2026` event, delete them from the Admin panel, or reset the local test DB with
  `npm run db:local:reset && npm run db:local:setup`. **Never** run a reset against production.
- **Related docs:** [Events subsystem in the milestone plan](../MILESTONE_PLAN.md) ·
  [Admin panel guide](../ADMIN_PANEL_GUIDE.md) · [Testing strategy](../TESTING_STRATEGY.md).

---

## Appendix A — Full run log

```text
──────────────────────────────────────────────────────────────────────────────
  PHASE 0 · ENVIRONMENT
──────────────────────────────────────────────────────────────────────────────
   Database        : localhost:5432/iitj_test?schema=public
   Academic year   : 2025-26
   Organizer actor : developer@iitjammu.ac.in

──────────────────────────────────────────────────────────────────────────────
  PHASE 1 · CREATE THE EVENT
──────────────────────────────────────────────────────────────────────────────
   Created event draft + Published.
   [PASS] Create + publish event (CMS content_type=event) — slug=sim-hackathon-2026

──────────────────────────────────────────────────────────────────────────────
  PHASE 2 · CONFIGURE 2 ROUNDS
──────────────────────────────────────────────────────────────────────────────
   Round 1: Round 1 — Prelims
   Round 2: Round 2 — Finals
   [PASS] Add event rounds — 2 rounds

──────────────────────────────────────────────────────────────────────────────
  PHASE 3 · OPEN REGISTRATION (capacity 48)
──────────────────────────────────────────────────────────────────────────────
   [PASS] Configure registration window + capacity

──────────────────────────────────────────────────────────────────────────────
  PHASE 4 · CREATE 50 MEMBER ACCOUNTS
──────────────────────────────────────────────────────────────────────────────
   50 created → 50 active member accounts.
   [PASS] Create 50 member accounts

──────────────────────────────────────────────────────────────────────────────
  PHASE 5 · LOG IN ALL 50 MEMBERS
──────────────────────────────────────────────────────────────────────────────
   50/50 members authenticated; lastLoginAt stamped.
   [PASS] Authenticate all 50 members (credentials login) — 50/50
   [PASS] Reject wrong password

──────────────────────────────────────────────────────────────────────────────
  PHASE 6 · MEMBER SELF-REGISTRATION
──────────────────────────────────────────────────────────────────────────────
   Registered 50. Live counts → confirmed=48, waitlisted=2, total=50
   [PASS] Self-registration for all 50
   [PASS] Capacity enforced → overflow waitlisted — confirmed=48, waitlisted=2

──────────────────────────────────────────────────────────────────────────────
  PHASE 7 · RAISE CAPACITY → AUTO-PROMOTE WAITLIST
──────────────────────────────────────────────────────────────────────────────
   Capacity 48 → 50. Auto-promoted 2 member(s). confirmed=50, waitlisted=0
   [PASS] Auto-promote waitlist on capacity raise — promoted=2

──────────────────────────────────────────────────────────────────────────────
  PHASE 8 · CONDUCT ROUND 1 (live leaderboard as scores come in)
──────────────────────────────────────────────────────────────────────────────
   After 10 scores entered → leaderboard has 10 ranked. (leader: Participant 01, 100)
   After 30 scores entered → leaderboard has 30 ranked. (leader: Participant 01, 100)
   After 50 scores entered → leaderboard has 50 ranked. (leader: Participant 01, 100)
   [PASS] Round 1 scoring (replace-set) — 50 ranked
   [PASS] Leaderboard updates continuously as scores are entered — grew 10 → 30 → 50

──────────────────────────────────────────────────────────────────────────────
  PHASE 9 · CONDUCT ROUND 2 (standings reshuffle on new performance)
──────────────────────────────────────────────────────────────────────────────
   Round 2 top 5: #1 Participant 24 (109), #2 Participant 47 (108), #3 Participant 20 (107),
                  #4 Participant 43 (106), #5 Participant 16 (105)
   OVERALL top 5: #1 Participant 04 (196), #2 Participant 08 (194), #3 Participant 12 (192),
                  #4 Participant 16 (190), #5 Participant 20 (188)
   Round-1 leader was "Participant 01" (100); OVERALL leader is now "Participant 04" (196).
   [PASS] Round 2 scoring
   [PASS] Overall leaderboard = cumulative across rounds
   [PASS] Leaderboard re-ranks on performance (leader changed R1 → overall)

──────────────────────────────────────────────────────────────────────────────
  PHASE 10 · TAKE ATTENDANCE
──────────────────────────────────────────────────────────────────────────────
   Round 1 attendance: 46/50 present.   Round 2 attendance: 48/50 present.
   [PASS] Mark attendance (round 1) — 46/50
   [PASS] Mark attendance (round 2) — 48/50
   [PASS] Read attendance sheet (organizer, gated)

──────────────────────────────────────────────────────────────────────────────
  PHASE 11 · EXPORTS, ROSTER & CLOSURE REPORT
──────────────────────────────────────────────────────────────────────────────
   [PASS] CSV export: participants — 50 rows
   [PASS] CSV export: ranking — 50 rows
   [PASS] CSV export: scores — 100 rows
   [PASS] CSV export: attendance — 100 rows
   [PASS] Registration roster (organizer, PII-gated) — 50 entries
   [PASS] Closure report submit + central review — status=reviewed

──────────────────────────────────────────────────────────────────────────────
  PHASE 12 · VERIFY EACH MEMBER PROFILE REFLECTS THEIR RESULT
──────────────────────────────────────────────────────────────────────────────
   profiles showing the event : 50/50
   showing points             : 50/50
   showing overall rank        : 50/50
   marked attended (any round) : 48/50
   lastLogin stamped           : 50/50
   [PASS] Every profile shows the event participation — 50/50
   [PASS] Every profile shows points — 50/50
   [PASS] Every profile shows an overall rank — 50/50
   [PASS] Attendance reflected in profile — 48/50 attended
   [PASS] Login reflected in profile (lastLoginAt) — 50/50

──────────────────────────────────────────────────────────────────────────────
  SUMMARY
──────────────────────────────────────────────────────────────────────────────
   28/28 feature checks passed.
```
