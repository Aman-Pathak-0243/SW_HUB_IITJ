Continue the IIT Jammu Member Platform. The full Session 11+ feature program (M0–M8) inside
the developer-controlled member_platform plugin is now COMPLETE. This session is a
CONSOLIDATION / DEPLOY-HARDENING + FULL-GATE pass (no new module). Run in automode at ultracode.


STEP 1 — read: docs/SESSION_PROTOCOL.md, CURRENT_STATUS.md, NEXT_TASK.md, TODO.md,
KNOWN_ISSUES.md, docs/CHANGELOG.md, docs/DECISION_LOG.md (esp. DL-090..093 M6). FIRST confirm
the operator ran `npm run db:migrate` + `npm run db:seed` (idempotent). NOTE: this Neon compute
is SLOW right now (~30–60s per live test) — run the live suites PER-FILE (or single-fork,
--pool=forks --poolOptions.forks.singleFork per KNOWN_ISSUES #39), warm it with db:migrate first,
and do NOT run all live suites in one process (that stalled last session).

STEP 2 — harden + ship (pick by priority; keep the protocol):
- FULL TEST GATE on a warm Neon: run every live suite (m0–m8 + cms/year/org/events/resources/
  media/devconsole/users/smoke) per-file and confirm green; confirm the 516 static suite +
  `npm run lint` + `next build` are clean.
- CI: extend .github/workflows/ci.yml so the m0–m8 live suites run in the nightly/secret-gated
  live job, single-fork.
- Member navigation polish: a small logged-in-member header/nav linking /member, /member/profile,
  /events, /wall-of-fame, club pages (today only /member links onward). Optional.
- Scoped-coordinator surfaces (KNOWN_ISSUES #43): a dedicated club-scoped view reusing
  assertEventManage (nav gating is global today). Optional.
- Operator/owner backlog stays owner-owned: the live-data imports + media migration + V1 secret
  rotation (OPERATIONS_RUNBOOK.md; KNOWN_ISSUES #18/#19).

STEP 3 - Think like the website is now hosted, now test each feature of the website, in each relevent mode, like admin, developer and all, and if there is any bug, document it and then fix it.Every feature should be tested finally and all the bugs should be fixed, like everything for eg. admin added, created and updated any info, feature, activity etc and is it working or now like this. Also create a SOP in a markdown file, for in future if I have to test the entire website like this way, how to do it.
Conventions unchanged: authorize-first; one semantic audit row per mutation via auditedMutation;
never db pull / migrate reset (new forward migration only if a schema change is truly needed);
Server-Component reads; pure client-safe helpers mirror the server (DL-051). Finish with the
multi-agent adversarial review + the END-OF-SESSION doc checklist (new DL records from DL-094;
CURRENT_STATUS/NEXT_TASK/TODO/CHANGELOG/KNOWN_ISSUES/SESSION_PROTOCOL/DEVELOPER_GUIDE/Token_Usage).
Output "Done master", one commit message, and the next handoff if needed.

Do not commit; no Claude attribution. Operator: after pulling, run `npm run db:migrate` then
`npm run db:seed` (both idempotent).
