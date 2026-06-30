# Token Usage Log

A permanent, session-by-session record of token usage for the IIT Jammu Portal
V2.0 build. **Updated at the end of every session** (part of the end-of-session
checklist in [SESSION_PROTOCOL.md](SESSION_PROTOCOL.md)).

## How to read this

- **Workflow subagent tokens** are *measured precisely* — each multi-agent
  Workflow run reports its total subagent output tokens. These are recorded
  verbatim.
- **Session total** is the authoritative number from Claude Code's own
  accounting. The orchestration/main-loop usage is **not** separately exposed to
  the assistant mid-session, so where a precise total isn't available it is marked
  *(est.)*. **To get the exact total, run `/cost` in the Claude Code session** and
  paste it into the table.
- Numbers are **output tokens** unless noted; input/context tokens are larger and
  billed separately — `/cost` reflects the true billable total.

## Per-session log

| Session | Date | Focus | Workflow subagent tokens (measured) | Session total | Notes |
|---|---|---|---|---|---|
| 1 | 2026-06-28 | Analysis + Documentation + Architecture | **338,732** (schema-design workflow: 9 agents, 36 tool calls, ~1,017s) | ~0.6M–0.9M *(est.)* — run `/cost` for exact | Also ran 3 Explore subagents in the analysis phase (not separately instrumented). Heavy file reading + ~35 doc writes. No app code. |
| 2 | 2026-06-28 | Database + Prisma + RBAC + Auth | **912,182** (1 adversarial review workflow: 16 agents — 6 reviewers + 10 verifiers, 263 tool calls, ~580s) | _run `/cost` for exact_ | Most work was sequential implementation (schema/migration/seed/auth/RBAC) in the main loop; only the review was a workflow. |
| 3 | 2026-06-28 | CMS Foundation | **978,555** (1 adversarial review workflow: 30 agents — 5 reviewers + 25 verifiers, 266 tool calls, ~548s) | _run `/cost` for exact_ | Implementation (audit extension, content service, handlers, visibility, errors, tests) was sequential in the main loop; the review was the one workflow. 24 confirmed findings fixed. |
| 4 | 2026-06-28 | Academic Year Engine | **866,490** (1 adversarial review workflow: 24 agents — 6 reviewers + 18 verifiers, 191 tool calls, ~418s) | _run `/cost` for exact_ | Implementation (year context/history/transition/lock/public + shared-helper refactor + tests) was sequential in the main loop; the review was the one workflow. 18 confirmed findings → 16 fixed, 2 nits accepted. |
| 5 | 2026-06-28 | Organization Model | **1,235,502** (1 adversarial review workflow: 25 agents — 6 reviewers + 19 verifiers, 389 tool calls, ~744s) | _run `/cost` for exact_ | Implementation (org-unit/people/appointment services, V1 dataset, idempotent importer, public read layer + data-driven pages, the is_singleton forward migration, static + live tests) was sequential in the main loop; the review was the one workflow. 19 findings → 15 confirmed → 13 fixed, 2 accepted. The live DB suite (slow, idempotent importer) was run ~4× during dev. |
| 6 | 2026-06-29 | Events + Announcements | **1,661,214** (1 adversarial review workflow: 64 agents — 8 reviewers + 56 verifiers, 558 tool calls, ~941s) | _run `/cost` for exact_ | Implementation (events/announcements read+import libs, CMS-backed `/api/events`, data-driven pages, base64 handling, audience gating, and the review fixes) was sequential in the main loop; the review was the one workflow. 28 findings → 23 confirmed → 12 fixed, 1 accepted. The live events suite (10 tests) was run 3× during dev (one cold-Neon retry). |
| 7 | 2026-06-29 | Resources + Media | **1,878,894** (the adversarial review, run TWICE: the first run's Verify phase crashed on a `parallel()` thunk bug — 38 agents, **996,415**, findings lost; fixed the script + **resumed** so the 10 Review-phase lens agents returned cached and only the corrected Verify phase ran live — 38 agents, **882,479**. Net unique: 10 lenses + 28 per-finding verifiers, 14 confirmed → all addressed) | _run `/cost` for exact_ | Implementation (media service/cloudinary/migration tool, resources lib+importer+view, config fixes, static + live tests, and the review fixes) was sequential in the main loop; the review was the one workflow (re-run once due to the thunk bug). Live suites: media (3) + resources (4) + events (10) all green; org (4) passed earlier in-session then a **Neon outage** ("Can't reach database server") blocked later re-runs (infra, not logic — failures were on unchanged read paths). |
| 8 | 2026-06-29 | Developer Console | **1,465,840** (1 adversarial review workflow: 43 agents — 7 reviewers + 36 verifiers, 480 tool calls, ~807s) | _run `/cost` for exact_ | Implementation (audit viewer, status/monitoring, reports+cost, backup ledger + recovery delegates, gated routes, CLI, static + live tests, and the review fixes) was sequential in the main loop; the review was the one workflow. 18 findings → 6 confirmed-both + 8 single-vote → all legitimate addressed, 4 rejected. Live suites: dev-console (10) green; org re-confirmed 4/4 (warm Neon, no cold-compute retry needed this session). |
| 9 | 2026-06-29 | Admin Panel | **1,627,717** (1 adversarial review workflow: 45 agents — 7 reviewers + per-finding 2 verifiers, 484 tool calls, ~812s) | _run `/cost` for exact_ | Implementation (the net-new users/roles service, the admin API registry + route, the gated server context/reads, the shell + 6 module UIs + client toolkit, pure helpers, static + live tests, the login guide, and the review fixes incl. a CRITICAL grant-escalation) was sequential in the main loop; the review was the one workflow. 19 findings → 12 confirmed-both + 1 single-vote → all 13 addressed, 6 rejected. The live users/roles suite (6) was run 2× during dev (one to catch the createUser hash-leak, one to confirm the fixes); other live suites untouched (no service changes to them). |
| 10 | 2026-06-29 | Testing + Deployment + Optimization + Handover | **412,946** (1 adversarial review workflow: 13 agents — 5 reviewers + per-finding 2 verifiers, 202 tool calls, ~355s) | _run `/cost` for exact_ | Implementation (CI workflow, CWV/font/brand changes, the CSRF+rate-limit guard, security headers + NFT decision, the V1 prune + Header `/org` cutover, the operator runbook + full docs sweep, and the review fix) was sequential in the main loop; the review was the one workflow. 4 findings → 1 confirmed (CI live-db `if`-scope bug, fixed) + 3 rejected (2 tidied anyway). The full live-DB suite (344 tests) was run once on a warm Neon (~536s, all green, no cold-compute retry). |
| 11 | 2026-06-30 | Member Platform **M0** (auth & account lifecycle) + the PLUGIN | **539,768** (1 adversarial review workflow: 12 agents — 6 dimension finders + per-finding 2 verifiers, 151 tool calls, ~303s) | _run `/cost` for exact_ | Implementation (plugin/feature-flag service, email+password auth pivot + edge middleware, account lifecycle incl. bulk CSV / delete / force-reset / change-own-password, the notification request queue + admin-mediated reset, public + admin UI, 2 forward migrations, static + live tests, and the 3 review fixes) was sequential in the main loop; the review was the one workflow. **3 findings → 3 confirmed-both (0 refuted) → all fixed + re-verified live** (CRITICAL developer-password-reset takeover; notification dedup TOCTOU; Google-reject fail-open). Live suites on warm Neon: m0 (8) + users (6) + smoke (8) green; the other live suites re-confirmed (one Neon-latency transient on the year suite cleared on a warm re-run). |
| 11 | 2026-06-30 | Member Platform **M2** (RBAC categories + per-email overrides + smart search) | **775,159** (1 adversarial review workflow: 12 agents — 6 dimension finders + per-finding 2 verifiers, 150 tool calls, ~376s) | _run `/cost` for exact_ | Implementation (the `user_permission_override` table + migration, the `resolveEffectivePermissions` deny-wins extension, the override service + escalation guard, the 6 seeded category roles + `permission.override`, the pure `lib/users/search.mjs` + the `listUsers` criteria, the debounced filter UI + overrides modal, static + live tests, and the 1 review fix) was sequential in the main loop; the review was the one workflow. **0 confirmed-both + 1 single-vote → the single-vote (a free-text client/server predicate drift) fixed + locked** with a no-drift static test. Live suites on warm Neon: m2 (7) + users (6) green. |

## Running total

- **Measured workflow subagent tokens to date:** 12,692,999 (Session 1: 338,732 + Session 2: 912,182 + Session 3: 978,555 + Session 4: 866,490 + Session 5: 1,235,502 + Session 6: 1,661,214 + Session 7: 1,878,894 + Session 8: 1,465,840 + Session 9: 1,627,717 + Session 10: 412,946 + Session 11 M0: 539,768 + Session 11 M2: 775,159)
- **Estimated cumulative session total:** Session 1 ~0.6M–0.9M *(est.)* + Sessions 2–10 *(run `/cost`)*

## Session 1 breakdown (detail)

| Component | Tokens | Source |
|---|---|---|
| Schema-design workflow (3 design + 1 synth + 4 verify + 1 finalize) | 338,732 | Workflow usage report (measured) |
| Analysis-phase Explore subagents (×3) | not instrumented | Agent tool (estimate ~30–50k output) |
| Main orchestration loop (reads + ~35 doc writes + edits) | not separately exposed | use `/cost` |

> **Maintenance note for future sessions:** record each Workflow run's reported
> subagent token count here verbatim, and paste the `/cost` session total when
> closing the session. Keep this table append-only across all 10 sessions.
