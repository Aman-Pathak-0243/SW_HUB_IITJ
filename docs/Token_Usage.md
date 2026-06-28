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
| 5 | — | Organization Model | — | — | |
| 6 | — | Events + Announcements | — | — | |
| 7 | — | Resources + Media | — | — | |
| 8 | — | Developer Console | — | — | |
| 9 | — | Admin Panel | — | — | |
| 10 | — | Testing + Deployment + Optimization | — | — | |

## Running total

- **Measured workflow subagent tokens to date:** 3,095,959 (Session 1: 338,732 + Session 2: 912,182 + Session 3: 978,555 + Session 4: 866,490)
- **Estimated cumulative session total:** Session 1 ~0.6M–0.9M *(est.)* + Sessions 2–4 *(run `/cost`)*

## Session 1 breakdown (detail)

| Component | Tokens | Source |
|---|---|---|
| Schema-design workflow (3 design + 1 synth + 4 verify + 1 finalize) | 338,732 | Workflow usage report (measured) |
| Analysis-phase Explore subagents (×3) | not instrumented | Agent tool (estimate ~30–50k output) |
| Main orchestration loop (reads + ~35 doc writes + edits) | not separately exposed | use `/cost` |

> **Maintenance note for future sessions:** record each Workflow run's reported
> subagent token count here verbatim, and paste the `/cost` session total when
> closing the session. Keep this table append-only across all 10 sessions.
