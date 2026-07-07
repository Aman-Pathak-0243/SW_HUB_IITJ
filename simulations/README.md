# Event Simulations — Client Self-Service Kit

This folder lets you **run realistic event dry-runs on the portal yourself**, step by step,
before you host anything for real. Each manual tells you exactly where to click, what to
type, and what you should see. When you need to run a real event, **copy a fixture from
here, change the details, and go.**

Everything in this kit is **grounded in the live product** and **proven by two automated
end-to-end simulations** (a manually-scored hackathon and an auto-scored live quiz, each
with 50 participants):

| Simulation | Scope | Result |
|---|---|---|
| Hackathon (2 rounds, manual scoring) | registration · capacity · waitlist · auto-promote · rounds · scoring · leaderboard · attendance · exports · closure · profiles | **28 / 28 checks passed** |
| Live quiz (answer-key auto-scoring) | questions/answer key · live session · server scoring · live leaderboard · profiles | **6 / 6 checks passed** |

---

## What's in the kit

```
simulations/
├── README.md                         ← you are here (start)
├── data/
│   ├── participants-50.csv           ← 50 ready-to-import accounts (bulk user upload)
│   └── participants-key.md           ← the sheet explained + how to hand out passwords
├── 00-admin-setup/
│   └── ADMIN_LOGIN_AND_SETUP.md      ← log in, turn on the member platform, bulk-import users
├── simulation-1-general/             ← Simulation 1: any event (quiz, hackathon, generic)
│   ├── README.md
│   ├── 01-HOST-MANUAL.md             ← host an event end-to-end (the main walkthrough)
│   ├── 02-PARTICIPANT-MANUAL.md      ← how a normal user / staff member takes part
│   ├── 03-RESULTS-AND-CLOSURE.md     ← leaderboard, downloads, closing an event
│   └── events/
│       ├── quiz.md                   ← quiz fixture + answer key
│       ├── hackathon.md              ← hackathon fixture + scoring rubric
│       └── general-event.md          ← generic event template
└── simulation-2-coding-robotics/     ← Simulation 2: Coding Club × Robotics Club + collaboration
    ├── README.md
    ├── 01-CODING-CLUB.md
    ├── 02-ROBOTICS-CLUB.md
    ├── 03-COLLABORATION-AND-LEADERBOARD.md
    └── events/
        ├── coding-contest.md
        └── robotics-championship.md
```

---

## How to use this kit

1. **Do the one-time setup once:** [00-admin-setup/ADMIN_LOGIN_AND_SETUP.md](00-admin-setup/ADMIN_LOGIN_AND_SETUP.md)
   — log into the admin panel, turn on the member platform, and **bulk-import the 50
   participants** from [data/participants-50.csv](data/participants-50.csv).
2. **Hand out the initial passwords** (see [data/participants-key.md](data/participants-key.md)).
   Each user logs in and is asked to set their own password on first login.
3. **Run Simulation 1** ([simulation-1-general/](simulation-1-general/README.md)) — pick an
   event type (quiz / hackathon / generic), follow the host manual, and have a few test
   users participate. Every step has a **✅ Verify** line telling you what you should see.
4. **Run Simulation 2** ([simulation-2-coding-robotics/](simulation-2-coding-robotics/README.md))
   — Coding Club and Robotics Club events, and two clubs **co-organizing** one event with a
   shared leaderboard.

> **Golden rule while learning:** read a step → go to that screen in the portal → copy the
> value from the manual → paste it → check the ✅ Verify line. If what you see matches, that
> feature works.

---

## Two things that surprise people (read once)

- **⚠ Attendance is always optional.** There is no "attendance on/off" switch when you
  create an event. If your event is remote, simply **don't** mark attendance — nothing else
  changes, and participants can start as soon as registration is open. Mark attendance only
  for in-person rounds where you want a record.
- **⚠ Imported users must change their password on first login.** Accounts you create in
  bulk are given an *initial* password (the one in the sheet). When the user first logs in,
  the portal requires them to set their own new password. This is expected and secure — you
  only ever hand out the initial password.

---

## For the technical owner (optional)

The two proven simulations are runnable tests. Against a seeded local database:

```bash
npm run db:local:up && npm run db:seed
RUN_SIM=1 ./node_modules/.bin/dotenv -e .env.local -- ./node_modules/.bin/vitest run tests/event-simulation.test.mjs --pool=forks --poolOptions.forks.singleFork
RUN_SIM=1 ./node_modules/.bin/dotenv -e .env.local -- ./node_modules/.bin/vitest run tests/quiz-simulation.test.mjs   --pool=forks --poolOptions.forks.singleFork
```

A deeper technical write-up of the hackathon run lives at
[docs/simulations/EVENT_SIMULATION.md](../docs/simulations/EVENT_SIMULATION.md).
