# Test Report — Role-Based Access Matrix

**Harness:** [`tests/role-matrix.test.mjs`](../tests/role-matrix.test.mjs) ·
**Result: ✅ 58 / 58 checks passed** (no bugs found).

## Scenario

One user is created per role, scoped appropriately (global roles unscoped; coordinator /
co-coordinator scoped to a club; secretary scoped to a council), then every capability is
checked through the **real RBAC resolver (`getEffectivePermissions` + `can`)** and the **authz
seams (`assertEventManage` / `canManageEvent`, `hasAnyAdminAccess`, `canParticipate`)**. A
failed assertion would be a genuine allow/deny defect — none were found.

## What each role can (✅) and cannot (✗) do — verified

| Capability | Developer | Super Admin | Admin | Staff | Secretary *(council)* | Coordinator *(club A)* | Co-coordinator *(club A)* | Member |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Dev console / backups | ✅ | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Manage users & roles | ✅ | ✅ | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Publish content (global) | ✅ | ✅ | ✅ | ✅ | ✗ | ✗ | ✗ | ✗ |
| Publish content **at own scope** | ✅ | ✅ | ✅ | ✅ | ✅ *(council)* | ✅ *(club A)* | ✗ *(draft only)* | ✗ |
| Draft content at own scope | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✗ |
| Manage structure (appointments) | ✅ | ✅ | ✅ | ✗ | ✅ *(council)* | ✗ | ✗ | ✗ |
| Manage **its own** event | ✅ | ✅ | ✅ | ✅ | — | ✅ *(club A)* | ✗ | ✗ |
| Manage **another club's** event | ✅ | ✅ | ✅ | ✅ | ✗ | ✗ *(club B)* | ✗ | ✗ |
| Central actions (organizer tagging / collaboration) | ✅ | ✅ | ✅ | ✅ | ✗ | ✗ *(scoped ≠ central)* | ✗ | ✗ |
| See the **/admin** panel | ✅ | ✅ | ✅ | ✅ | ✗ *(uses /coordinator)* | ✗ | ✗ | ✗ |

Plus the account-status seam: `active` members can participate; `inactive` and `revoked`
cannot.

## Why this matters

- **Scope is exact-match:** a coordinator's powers apply **only** at their own club (not
  globally, not at another club); a secretary's only at their council. Verified both the
  "can at own scope" and "cannot at other scope / global" sides.
- **Least privilege holds:** staff has no user/role admin; admin has no developer-only ops;
  co-coordinators can draft but never publish; members have no back-office permission.
- **Collaboration is central-only:** defining organizers requires *global* `event.manage`, so
  a scoped coordinator cannot tag their own club in to grant themselves access.
- **Scoped leaders don't see /admin:** they use the scoped `/coordinator` surface — confirmed
  via `hasAnyAdminAccess`.

## Result

**58/58 passed — no allow/deny defects.** The RBAC engine, the event-management seam, and the
admin-nav gating all behave exactly as designed across every role.
