# Consolidation session — full-site bug log (STEP 3)

Generated during the Session-12 consolidation / deploy-hardening pass, treating the
site as if hosted and exercising **every feature in every access mode**. Findings came
from a static per-feature × per-role audit (11 feature areas, each finding adversarially
2-verified) plus the full live-DB gate and the route-render smoke. This is the concrete
instance of the bug-log template in [WEBSITE_TESTING_SOP.md](WEBSITE_TESTING_SOP.md) §7.

**Audit result:** 26 raw findings → 21 confirmed-by-both + 2 single-vote. After my own
code-level verification: **11 fixed**, **remaining documented as accepted** (semantic
choices, architectural items beyond a hardening session, or dead-ends only reachable via
non-standard custom grants — every such page still fails closed). Duplicates across areas
(the `/events/[slug]` gap was reported by three area agents) are merged.

Severity: 🔴 critical · 🟠 high · 🟡 medium · ⚪ low.

## Fixed this session

| # | Sev | Feature / mode | File | Defect → Fix |
|---|-----|----------------|------|--------------|
| B1 | 🟠 | M0 auth · inactive + must-change member | `app/api/account/password/route.js` | The forced-password-change POST used `requireUser()` (active-only, 403 for inactive), but an **inactive** account can log in and is force-redirected here by middleware, and `changeOwnPassword` has no status gate → the user could **never complete the change** (permanent lockout). **Fix:** gate with `requireMember()` (admits inactive), matching the member-surface boundary. |
| B2 | 🟠 | M5 events · revoked / view-disabled member | `app/events/[slug]/page.jsx` | The event **detail** page only branched on `unauthenticated`; a `revoked` / `view-disabled` account (holding a still-valid JWT) fell through and saw the **full login-only playground detail** — while `/events`, `/events/organized`, `/member` all gate those states. **Fix:** added the same revoked/view-disabled notice branch. |
| B3 | 🟠 | All member auth surfaces · logged-out | `app/account/_components/AuthClient.jsx` | `SignInCard` is rendered on `/events`, `/events/[slug]`, `/events/organized`, but those routes never import `account.css` (only `/account`+`/member` pages did) → the sign-in card rendered **unstyled**. **Fix:** `AuthClient` imports `account.css` itself, so the card is styled everywhere it is used. |
| B4 | 🟡 | M5 events · organizer/admin raises capacity | `lib/events/settings.mjs`, `lib/events/registration.mjs` | Raising an event's capacity is a **seat-creating** path but did **not** auto-promote the waitlist (M5 only promoted on seat-*vacating* paths), stranding waitlisted members. **Fix:** new `promoteWaitlistForCapacity()` (loops the locked earliest-waitlisted promotion up to the new capacity) called from `upsertEventSettings` after a capacity change. |
| B5 | 🟡 | M3 memberships · coordinator re-imports CSV | `lib/memberships/service.mjs` | The bulk importer's `update` branch unconditionally set `role: r.role ?? defaultRole` (**wiped a manually-set role**) and `status: defaultStatus` (**reactivated a member an admin had deactivated**) — inconsistent with the M3 fix to `addMembership`. **Fix:** the update is now non-destructive — role changes only when the CSV row supplies one; an existing member's status is preserved (defaults apply to NEW members only). |
| B6 | 🟡 | M8 / M5 · CSV downloads (any exporter) | `lib/csv/cell.mjs` (new), `lib/events/csv.mjs`, `lib/devconsole/audit.mjs`, `lib/devconsole/storage.mjs` | CSV exports (event participants/scores/attendance, audit log, table dumps) did not neutralize **spreadsheet formula injection** — a user-controlled cell beginning `= + - @` (tab/CR) executes on open in Excel/Sheets. **Fix:** one shared `csvCell()` that quotes per RFC-4180 **and** prefixes a leading formula trigger with `'`; applied to every exporter. |
| B7 | ⚪ | M5 events · organizer bad input | `app/api/events/export/route.js` | An empty `roundId` query param (picker in "specific round" mode, blank id) was passed through as `""` and used as a uuid downstream → **500**. **Fix:** the route validates `roundId` (empty → all rounds; a non-uuid, non-`overall` value → friendly 422). |
| B8 | ⚪ | M7 feedback · reopen a resolved ticket | `lib/feedback/service.mjs` | Re-opening a resolved/dismissed ticket cleared `resolvedAt/By` (prior fix) but left the **stale `resolutionNote`** in place. **Fix:** reopening also clears the note (unless a new note is supplied). |
| B9 | 🟠→hardening | M8 dev-dash · storage export | `lib/devconsole/storage.mjs` | The "guaranteed" export audit row was written but its failure was **swallowed** (`.catch(warn)`), so a rare transient audit-write failure could return a full-table (password-hash) dump **untracked**. **Fix:** the audit write is now fail-closed — if it throws, the export throws (no untracked dump). (The finding's premise that it depended on `backup.create` was **refuted** — it is an independent `recordAudit`; only the swallow was hardened.) |
| B10 | ⚪ | M4 wall of fame · public reader | `app/components/AchievementCard.jsx` | A credited **club** chip was a non-clickable `<span>` although the shape carries `slug`+`typeKey` and the docstring says "clubs link to their page." **Fix:** the club chip is now a `<Link href="/org/{typeKey}/{slug}">` when both are present (falls back to a span). |
| B11 | ⚪ | Member UX · logged-in member | `app/components/MemberNav.jsx`, `app/components/SignOutButton.jsx` (new) | There was **no sign-out control** anywhere in the member UI. **Fix:** added a Sign out control to the new member nav (`signOut({callbackUrl:'/'})`). |

## Documented as accepted (no code change)

| # | Sev | Finding | Why accepted |
|---|-----|---------|--------------|
| A1 | 🟠 | Bulk mail runs synchronously in the HTTP request with 60s inter-batch sleeps; a large multi-batch send can time out and leave no audit row (`lib/mail/service.mjs`). | The correct fix is a background job queue — out of scope for a hardening session. Mail is **operator-gated and off by default** (KNOWN_ISSUES #40: needs `npm install nodemailer` + `MAIL_*`). Documented as accepted; queue is future work. |
| A2 | ⚪ | Member "events participated" / touchpoints count includes waitlisted-only registrations (`lib/member/contribution.mjs`). | Semantic choice: "participated" = a non-cancelled registration; each row **carries its `status`** so the UI distinguishes waitlisted. Changing M6's tested aggregation (DL-091) is a design change, not a hardening fix. |
| A3 | ⚪ | Feedback "Manage" modal shows Resolve/Dismiss on already-closed tickets (`app/admin/feedback/FeedbackClient.jsx`). | The **service is safe** — `setFeedbackStatus` early-returns `changed:false` for a same-status no-op with no note; a resolved→dismissed switch is a legitimate action. UI-only convenience; low value, deferred. |
| A4 | ⚪ | `Users & Roles` / `Mail` nav visible to a permission the page's read rejects → an emptier page (`lib/admin/nav.mjs`). | Only reachable via a **non-standard custom grant/override** (no seeded role grants `permission.override` without `user.read`, or `mail.manage` without `mail.send`); every such page still **fails closed** and renders a partial/empty view, never leaking data. Cosmetic. |
| A5 | ⚪ | Public `/announcements` advertises "upcoming & past events" via `/events`, a login wall when the plugin is ON (`app/announcements/page.js`). | `/events` renders a friendly sign-in card for anonymous visitors (not an error); the copy is acceptable. Minor. |
| A6 | 🟠(1/2) | A scoped-only coordinator/secretary is not shown the back-office nav (`lib/admin/server.mjs`). | This **is** the already-accepted KNOWN_ISSUES #43 (nav resolves at global scope; the `assertEventManage`/scoped-service seam works via the API). A dedicated scoped surface is future work. |
| A7 | ⚪(1/2) | CSV importer skips a header row only when it is the first non-blank line (`lib/memberships/forms.mjs`). | A header appearing after data is malformed input; it is reported as a bad-email row (never silently imported). Edge case; low value. |

_Status of each fix is verified by: the static gate, the affected live suites (m3/m5/m7/m0/m1/devconsole re-run per-file on warm Neon), the route-render smoke, and the end-of-session adversarial review. See CHANGELOG / CURRENT_STATUS for the run results._
