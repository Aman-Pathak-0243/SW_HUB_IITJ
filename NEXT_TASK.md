# Next Task

**As of:** 2026-06-28 · **Session 4 complete → Session 5 is next.**

## Session 5 — Organization Model (Clubs, Councils, Hostels, Mess)

Stand up the real organization structure as generic `org_unit` rows + `position`
definitions + `appointment` rosters, and migrate the hardcoded V1 org content into
the current year — all on the Session-2 schema, the Session-3 CMS service, and the
Session-4 year engine (`lib/year/*`). **Read first:**
[docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md),
[docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md) (capabilities 2 & 4 + `org_unit`,
`org_unit_lineage`, `position`, `appointment`, `org_unit_type_allowed_child`),
[docs/DATA_MIGRATION_REPORT.md](docs/DATA_MIGRATION_REPORT.md) (§7 — the V1
clubs/councils/hostels/mess content to migrate),
[docs/DECISION_LOG.md](docs/DECISION_LOG.md) (DL-007 lineage, DL-008 composite FK,
DL-009/021 cardinality, DL-022 hierarchy guard, DL-026 defaults, DL-031 transition),
[CURRENT_STATUS.md](CURRENT_STATUS.md).

### Ordered tasks
1. **Org-unit service** (`lib/org/*`) — create / edit / archive `org_unit` rows
   (year-scoped, self-referential `parent_id`), each tied to an
   `org_unit_lineage` (create a lineage only for a genuinely new logical unit;
   never copy a bare uuid — DL-007). Reuse the shared `auditedMutation`
   (`lib/cms/audited-mutation.mjs`) + `assertActorPermission` gated on
   `org_unit.*`. Honor (don't re-implement) `org_unit_hierarchy_guard`
   (same-year + allowed-child-type) and `lock_guard`; surface friendly errors
   (extend `mapDbError` if a new guard signature appears — `ORG_HIERARCHY` is
   already mapped).
2. **Appointment (roster) service** — create / edit / archive `appointment` rows
   (person-in-position-per-unit-per-year). Honor the composite FK (year
   agreement), `appointment_type_guard` (position↔unit-type compatibility,
   auto-fills `org_unit_type_id`/`is_singleton`), and the cardinality guards
   (singleton partial unique + deferred count trigger). The `person` directory is
   data; create/link people as needed (respect `person_email_link_guard`).
3. **Migrate hardcoded V1 org content** (Report §7) — seed/import the 4 councils,
   ~30 clubs, 6 hostels, 5 messes as `org_unit` + bound `*_profile` content_items
   (via the CMS service) + appointments for the current year (2025-26). Idempotent
   importer (upsert by `(academic_year_id, lineage_key)` / slug).
4. **Data-driven public pages** — one `<OrgUnitPage>` (+ a list page) that renders
   any unit from `lib/year/public.mjs` + the CMS payload, replacing the 4
   near-identical V1 Clubs pages (KNOWN_ISSUES #13).
5. **Tests** — org-unit create/hierarchy-guard rejection, appointment
   type/cardinality guards (singleton vs multi-holder), the importer (idempotent),
   and a public org page read. Extend the live DB suite as useful; keep the static
   suite default-green.

### Guard rails (already enforced — rely on them)
- `org_unit_hierarchy_guard`, the appointment composite FK + `appointment_type_guard`
  + `appointment_singleton_position_uq` + deferred `appointment_cardinality_guard`,
  `lock_guard`, and `person_email_link_guard`. Don't re-implement; surface friendly
  errors via `mapDbError`.
- The Transition Wizard (`lib/year/transition.mjs`) already copies org_units +
  appointments forward; Session 5 just creates the *first* year's real data.

### End-of-session (mandatory)
Run the END-OF-SESSION checklist in
[docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md): update CURRENT_STATUS,
NEXT_TASK, TODO, CHANGELOG, DECISION_LOG, KNOWN_ISSUES, Developer Guide,
Token_Usage; prepare one specific commit; output the Session-6 starter prompt.

## Owner-owned (parallel, anytime)
- Rotate/revoke the V1 leaked secrets and clean `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md)).
- Consider rotating the Neon password if the sharing channel isn't private
  (KNOWN_ISSUES #19).
