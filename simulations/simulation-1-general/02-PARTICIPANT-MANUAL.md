# Participate in an Event — Member & Staff Manual

This is your step-by-step guide as a **participant**. It applies to two kinds of accounts:

- **Normal user** — a regular member.
- **Staff** — a staff member (in the practice sheet, rows 46-48 are staff).

**Staff and normal users participate in exactly the same way.** The only difference is *which* events you are eligible for: some events are restricted to certain roles, and a staff account may be allowed into events a normal member is not. The buttons, screens, and steps you use are identical.

Every step below ends with a **✅ Verify** line telling you exactly what you should see on screen so you know it worked.

---

## Step 1 — Get your initial password from the organizer

The organizer creates your account for you and sends you two things:

| You receive | Example (from the practice sheet) |
| --- | --- |
| Your login **email** | `sim.user.01@iitjammu.ac.in` |
| Your **initial password** | `Welcome#2001` |

You do not sign yourself up — the organizer provisions your account and hands you these credentials.

✅ **Verify:** You have both an email address and an initial password before you go any further.

---

## Step 2 — Log in at `/login`

1. Open the portal and go to the **`/login`** page.
2. Enter your **email**.
3. Enter your **initial password** (the one from Step 1).
4. Submit.

✅ **Verify:** The login is accepted and you are taken past the sign-in screen (you are not left staring at an error on `/login`).

---

## Step 3 — ⚠ Set a new password (forced on first login)

⚠ **Expected behavior:** Accounts created for you by the organizer are set to **"must change password on first login."** So immediately after your first sign-in, the portal will **require you to choose a brand-new password of your own**. This is normal and correct — it is not an error.

1. When prompted, enter a new password of your choosing.
2. Your new password must be **at least 10 characters** and include **at least one UPPERCASE letter, one lowercase letter, and one digit** (a symbol is allowed but not required). Example of a valid password: `Welcome#2001`.
3. Confirm and save.

From now on, log in with **your new password** — the initial one from the sheet no longer applies.

✅ **Verify:** The password-change prompt is accepted and you land in the portal as a signed-in member. The next time you sign in, only your new password works.

---

## Step 4 — Open the event page

1. While signed in, go to the **public page of the event** you want to join (the organizer shares the event's link).

✅ **Verify:** You see the event's details (title, date, description) and a **Register** button on the page.

---

## Step 5 — Register (confirmed vs. waitlisted)

1. On the event page, click **Register**.

What happens next depends on how full the event is:

| Outcome | What it means |
| --- | --- |
| **Confirmed** | You got a seat. The event has room and you are in. |
| **Waitlisted** | The event is at capacity. You are in line — if a seat opens up you move up automatically. |

You do not have to do anything to move off the waitlist: if the organizer **raises the capacity**, or a confirmed participant **cancels**, the earliest waitlisted members are **auto-promoted to confirmed** for you. (In the practice run, capacity was raised from 48 to 50 and **2 waitlisted members were auto-promoted** to confirmed with no action on their part.)

✅ **Verify:** After clicking Register you see your status on the event as either **confirmed** or **waitlisted**.

---

## Step 6 — Take part in the round(s)

Once registration is open (or the event has gone live), you can start participating right away. How you take part depends on the event type.

### A) A rounds-based event (e.g. a hackathon, judged manually)

- You compete in each round; the organizer scores each round and the leaderboard updates.
- There is **nothing extra you must click** to be scored — the organizer enters your points.

⚠ **Note about attendance:** Attendance is **always optional**. There is no attendance switch you need to turn on, and for a remote event the organizer may simply not take attendance at all — this changes nothing about your participation or scoring.

✅ **Verify:** For each round you take part in, your points appear once the organizer saves that round's scores; the overall leaderboard re-ranks accordingly. (In the practice hackathon, the Round 1 leader was Participant 01, but after Round 2 the overall winner became **Participant 04 with 196 points** — the leaderboard re-ranked on cumulative performance.)

### B) A live quiz (auto-scored)

1. Go to the event's **live player page**: **`/events/<slug>/live`** (the organizer gives you the exact link).
2. Wait for the host to **open a question**. When a question appears, a **timer** starts.
3. **Pick your answer before the timer runs out.** You may answer **each question once**.
4. When the host clicks **Reveal**, you see the correct answer and the updated leaderboard, then the next question begins.

How scoring works (done automatically by the server — you do not calculate anything):

- A **correct** answer **within the time limit** earns points: a flat half of the question's points, **plus a speed bonus** — the faster you answer, the bigger the bonus (up to the other half).
- A **wrong or late** answer earns **0**.

✅ **Verify:** After each question you see the leaderboard update. (In the practice quiz, scores grew cumulatively from about **1,000 after Q1 to about 4,000 after Q5**, and the winner was **Participant 03 with 3,998 points**.)

---

## Step 7 — Check your profile after the event

Your results are recorded on your own profile automatically — there is nothing extra to submit.

1. Go to **`/profile`** (also reachable at **`/member/profile`**).

✅ **Verify:** For every event you took part in, your profile lists:

- your **registration status** (confirmed / waitlisted),
- your **attendance**,
- your **points**, and
- your **overall rank**.

In both practice simulations, **all 50 participant profiles updated automatically** with these details — no participant had to do anything to make their results appear.

---

## Quick recap

1. Get your email + initial password from the organizer.
2. Log in at **`/login`**.
3. ⚠ Set your own new password when forced (first login only).
4. Open the event page and click **Register** (you'll be confirmed or waitlisted).
5. Take part — score the round(s), or answer each live-quiz question before the timer.
6. Open **`/profile`** to confirm your status, attendance, points, and rank.

> The credential sheet used in the practice run is here: [../simulations/data/participants-50.csv](../data/participants-50.csv)
