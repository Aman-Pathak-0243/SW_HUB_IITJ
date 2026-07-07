# Test Report — Coordinator ↔ Club Mapping (one club per coordinator)

**Harness:** [`tests/coordinator-one-club.test.mjs`](../tests/coordinator-one-club.test.mjs) ·
**Feature:** the admin **Coordinators** module ([app/admin/coordinators/](../app/admin/coordinators/page.jsx)) +
the `grantRole` rule in [lib/users/admin.mjs](../lib/users/admin.mjs) ·
**Result: ✅ 4 / 4 checks passed** (no bugs found).

## The rule

A person can be **coordinator of one club only, per academic year**. A club can still have
multiple coordinators (different people). Enforced in `grantRole` (409 `COORDINATOR_ONE_CLUB`)
and surfaced in the admin UI, which also pre-flags a conflicting email before you submit.

## What was executed and observed

| Check | Result |
|---|---|
| Map a person as coordinator of **Club A** — by **email** (resolves to the account) | ✅ created |
| Map the **same** person to **Club B** | ✅ rejected with `COORDINATOR_ONE_CLUB` |
| Re-map to **Club A** (same club) | ✅ idempotent — no duplicate grant |
| **Revoke** Club A, then map to **Club B** | ✅ allowed (moving a coordinator works) |

## Where it's enforced

- **Service (primary):** `grantRole` rejects a `coordinator` grant scoped to a club when the
  person already coordinates a different club that year — and accepts either a `userId` or an
  `email` (the mapping UI passes an email).
- **UI (pre-flight):** the Coordinators page disables the "Map to this club" button and shows
  *"already coordinates &lt;Club&gt;"* when the typed email is already mapped elsewhere.

## Notes

- Scoped to the **coordinator** role and **per academic year** (a person may coordinate a
  different club in a future year). Extending the cap to co-coordinators is a one-line change
  to `ONE_CLUB_ROLE_KEYS`.
- This maps the **RBAC coordinator role** (which is what lets them run their club's events —
  cross-checked in [04-role-matrix-test.md](04-role-matrix-test.md)); the org-chart appointment
  is managed separately in the Organization module.
- The unit-side caps you'd expect — **one PIC per club**, **one secretary per council** — are
  already enforced by the position catalog (`maxHolders`) and appointment guards.
