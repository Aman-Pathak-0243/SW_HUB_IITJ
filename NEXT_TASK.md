# Next Task

**As of:** 2026-06-28 · **Session 3 complete → Session 4 is next.**

## Session 4 — Academic Year Engine

Build the year-context layer, cross-year history queries, and the **Transition
Wizard** that copies a source year's structure forward — all on the Session-2
Prisma schema and the Session-3 CMS service. **Read first:**
[docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md),
[docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md) (capability 1 + the
`academic_year` / `transition_run` / `org_unit_lineage` entries),
[docs/DECISION_LOG.md](docs/DECISION_LOG.md) (DL-004/007/026 + Session-3
DL-028..030), [CURRENT_STATUS.md](CURRENT_STATUS.md).

### Ordered tasks
1. **Year context** — a `lib/year/context.mjs` resolving the current academic year
   (the `is_current` partial-unique guarantees exactly one), plus helpers to set
   the current year and to list years. Reuse the audit-extended `prisma` so year
   changes are audited; gate mutations with `requirePermission('year.*')`.
2. **History queries** — read content/org/appointments for any past year (filter
   by `academic_year_id`); follow `org_unit_lineage` to track a logical unit
   across years. Respect `lock_guard` (past years are read-only).
3. **Transition Wizard** — implement `transition_run`: copy a source year's
   STRUCTURE forward as new `org_unit` rows REUSING their `org_unit_lineage`
   (never copying a bare uuid — DL-007), with options `copy_appointments`
   (default OFF — DL-026), `copy_content` (clone latest revision as a target-year
   draft — DL-026), `copy_role_assignments` (default OFF). Record counts + status;
   honor the `source<>target` CHECK and the one-completed-per-pair partial unique;
   make it idempotent/re-runnable. Audit as `action='transition'`.
4. **Lock/unlock** — a `year.lock` operation (status `active`↔`locked`) so past
   years become read-only; surface the friendly `YEAR_LOCKED` error (already in
   `lib/cms/errors.mjs`) on blocked writes.
5. **Public year selector** — a data-access helper so public pages can show a past
   year's published content (still gated by the visibility rule, but for the
   selected year rather than only the current one).
6. **Tests** — current-year resolution, history queries, a full transition run
   (structure-only; structure+content), idempotence/re-run, lock behavior, and
   audit coverage for the transition. Extend the live DB suite as useful.

### Guard rails (already enforced — rely on them)
- `lock_guard` (locked-year read-only), the `is_current` partial unique, the
  `transition_run` `source<>target` CHECK + one-completed-per-pair unique, and the
  `org_unit_hierarchy_guard`. Don't re-implement; surface friendly errors (extend
  `mapDbError` if a transition introduces a new guard signature).

### End-of-session (mandatory)
Run the END-OF-SESSION checklist in
[docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md): update CURRENT_STATUS,
NEXT_TASK, TODO, CHANGELOG, DECISION_LOG, KNOWN_ISSUES, Developer Guide,
Token_Usage; prepare one specific commit; output the Session-5 starter prompt.

## Owner-owned (parallel, anytime)
- Rotate/revoke the V1 leaked secrets and clean `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md)).
- Consider rotating the Neon password if the sharing channel isn't private
  (KNOWN_ISSUES #19).
