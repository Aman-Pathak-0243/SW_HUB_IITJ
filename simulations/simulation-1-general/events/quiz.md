# Event Fixture — Live Quiz (auto-scored)

This is a ready-to-run quiz you can copy straight into the portal. It uses the exact 5-question set that we already tested end-to-end. Follow the steps in order; each block ends with a **✅ Verify:** line telling you what you should see on screen.

A quiz is just an **Event** that has questions attached. So you first create the event, then add the questions (the answer key), then host it live.

---

## 1. Create the quiz event

Go to **Admin → Content**.

1. Click **"+ New content"**.
2. Choose content type **"Event"**.
3. Enter Title: **Tech Trivia Live Quiz**
4. Click **"Create draft"**.

On the event's content page, fill in these fields:

| Field | Value to enter |
|---|---|
| Event date | your quiz date |
| Category | `technical` |
| Audience | `public` |
| Location | your venue (or "Online") |
| Body | short description of the quiz |

Then click **Publish**.

**✅ Verify:** The event status shows **Published**, and the event now appears on the public site. An event only opens for registration once it is published.

---

## 2. Add the 5 questions (the answer key)

Open the event in **Admin → Event Playground** (`/admin/events`) and go to its **quiz section**. Add each question below. For every question you enter a **Prompt**, its **Options**, mark the **Correct** option, set **Points**, and set a **Time limit**.

The correct option is marked with a `*` in the table. This answer key is **never shown to players**.

| # | Prompt | Options (correct = ✱) | Points | Time |
|---|---|---|---|---|
| Q1 | What does CPU stand for? | Central Process Unit / **Central Processing Unit ✱** / Computer Personal Unit / Central Processor Utility | 1000 | 20s |
| Q2 | Which planet is known as the Red Planet? | Venus / Jupiter / **Mars ✱** / Saturn | 1000 | 20s |
| Q3 | 2 + 2 × 2 = ? | **6 ✱** / 8 / 4 / 10 | 1000 | 15s |
| Q4 | Which language runs natively in a web browser? | Python / C++ / **JavaScript ✱** / Rust | 1000 | 20s |
| Q5 | HTTP status 404 means? | OK / Server Error / **Not Found ✱** / Redirect | 1000 | 15s |

To add one question:

1. Enter the **Prompt** (the question text).
2. Enter the **Options** (each answer choice — you may have 2 to 8 options).
3. Mark the **Correct** option (the one with `✱` above).
4. Set **Points** (default is `1000` — keep 1000 for this fixture).
5. Set the **Time limit** in seconds (use the "Time" column above).
6. Save the question, then repeat for the next one.

**✅ Verify:** All 5 questions are listed in the quiz section, each showing its points and time limit, with exactly one option marked correct.

> ⚠ You can edit an answer key **before** a question goes live. Editing **cannot** change a question that is currently live (already opened during the session). If you spot a mistake in a live question, reveal it and move on — fix the wording only for a future run.

---

## 3. Host the live session

Open the event's **live host page**: `/events/<slug>/live/host` (replace `<slug>` with your event's URL slug). Participants join on their own **player page**: `/events/<slug>/live`.

Run the session in this loop:

1. Click **Start** — this starts the session.
2. Click **Next** — this opens the first question and starts a server-side timer.
3. Participants answer on their player page (each person can answer a question **once**).
4. Click **Reveal** — this closes the question, shows the correct answer, and updates the leaderboard.
5. Repeat **Next → answer → Reveal** for Q2 through Q5.
6. Click **End** — this finishes the quiz and finalizes the leaderboard.

**✅ Verify:** After each **Reveal**, the correct answer is shown and the leaderboard re-ranks. After **End**, the leaderboard is final and no more answers are accepted.

> To conclude a quiz **midway**, just click **End** early — the leaderboard is final at that exact moment.

---

## 4. How auto-scoring works

Scoring is **automatic and server-authoritative** — you do not enter any points by hand.

- A **correct** answer submitted **within the time window** earns a flat **half** of the question's points, **plus a speed bonus** (the faster the answer, the larger the bonus, up to the other half). So a fast correct answer on a 1000-point question approaches ~1000; a slow-but-correct answer approaches ~500.
- A **wrong** answer, or an answer submitted **after the timer** (late), earns **0**.
- Each participant may answer each question **only once**.
- The leaderboard is **cumulative** — it adds up each participant's per-question points and re-ranks after every question.

**✅ Verify:** After Q1 the top scores sit around ~1000; by Q5 the running total for strong players is around ~4000.

---

## 5. Proven result

We ran this exact fixture with 50 participants (all 6 automated checks passed):

| Check | Result |
|---|---|
| Leaderboard growth | Q1 ≈ 1000 → Q5 ≈ 4000 cumulatively, always score-ordered |
| Winner | **Participant 03**, with **3998 points** |
| Profiles | All 50 participants' profiles listed the quiz afterwards |

Each participant's profile (`/profile` and `/member/profile`) automatically **lists this quiz** (their participation) after it runs.

> **⚠ Important — where quiz scores live.** A live quiz and a manually-scored event round are **two independent scoring systems.** Quiz points/ranks live on the **quiz leaderboard** (the live board on the host/player pages). A **pure quiz does NOT put points or a rank into the member's profile or the event's overall ranking** — those only reflect **manual round scores** (`Scores` sheet). This was verified in testing (see [`../../../test_simulation/03-kit-scenarios-test.md`](../../../test_simulation/03-kit-scenarios-test.md), Finding F-1).
>
> **To also show quiz results in profiles / a combined event ranking:** after the quiz, read each player's score from the quiz leaderboard and enter it into a **manual round** (e.g. a round named "Aptitude Quiz") via the **Scores** sheet. Then the profile and the overall leaderboard include it. The Coding Contest fixture shows this pattern end-to-end.

**✅ Verify:** Open any participant's profile and confirm the "Tech Trivia Live Quiz" appears in their event list. (Points/rank appear in the profile only if you recorded the quiz as a manual round, per the note above.)
