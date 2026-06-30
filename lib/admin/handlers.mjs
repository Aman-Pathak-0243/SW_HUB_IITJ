// Admin Panel mutation registry + dispatcher (Session 9). The whole admin write
// surface is ONE table: every mutating action the panel performs is a row mapping
// an action key → the permission gate + the EXISTING service call it delegates to.
// Adding an operation is a registry row, not a new route file (the "generic handler
// registry" the brief asks for). NO new business logic lives here — every `run`
// calls a service built in Sessions 3–8.
//
// AUTHORIZATION (the FIRST thing that happens, before any service work):
//   • `permission` set  → an INSTITUTE-WIDE op; the dispatcher asserts that single
//     key at GLOBAL scope here (year / media / users / roles / backups).
//   • `scoped: true`    → a content / org / appointment op whose correct gate is
//     the item's (year, org-lineage) scope, which the boundary cannot know up
//     front (a unit-scoped grant). The route authenticates with requireUser() and
//     the SERVICE authorizes at the true scope (it already does, before any state
//     read). This is the "requireUser() + the service gate" guard-rail option.
//   • `console: true`   → a developer-console op that self-gates via
//     authorizeConsole (any-of dev.console/backup.*); requireUser() + service gate.
//
// AUDIT: every run executes inside withAuditContext({ actorUserId, ip, userAgent })
// so the ONE semantic audit_log row each service writes is attributed to the actor
// and request (the Session-8 viewer then shows it).
import { assertPermission } from "../rbac/authorize.mjs";
import { withAuditContext } from "../cms/audit-context.mjs";
import { CmsError } from "../cms/errors.mjs";

import { createDraft, editDraft, publish, unpublish, archive, restore } from "../cms/content.mjs";
import { createOrgUnit, editOrgUnit, publishOrgUnit, archiveOrgUnit } from "../org/units.mjs";
import { createAppointment, editAppointment, publishAppointment, archiveAppointment } from "../org/appointments.mjs";
import { upsertPerson } from "../org/people.mjs";
import { createYear, setCurrentYear } from "../year/context.mjs";
import { lockYear, unlockYear } from "../year/lock.mjs";
import { runTransition } from "../year/transition.mjs";
import { createMediaAsset, updateMediaAsset, archiveMediaAsset } from "../media/service.mjs";
import {
  createUser, updateUser, setUserStatus, setUserPassword,
  createRole, updateRole, grantRole, revokeRole,
  importUsersCsv, deleteUser, forcePasswordReset,
} from "../users/admin.mjs";
import { recordBackup, markBackupVerified, rollbackMediaMigration, forceTransitionResync } from "../devconsole/backups.mjs";
import { setFeatureFlag } from "../platform/flags.mjs";
import { assignNotification, resolveNotification } from "../notifications/service.mjs";
import { fulfilResetRequest } from "../auth/password-reset.mjs";

// action key → { permission?, scoped?, console?, run(args, actor) }
export const ADMIN_ACTIONS = {
  // ── Content (scoped — the CMS service authorizes at the item's year/lineage) ──
  "content.create": { scoped: true, run: (a, actor) => createDraft(a.input, actor) },
  "content.edit": { scoped: true, run: (a, actor) => editDraft(a.itemId, a.patch ?? {}, actor) },
  "content.publish": { scoped: true, run: (a, actor) => publish(a.itemId, {}, actor) },
  "content.unpublish": { scoped: true, run: (a, actor) => unpublish(a.itemId, actor) },
  "content.archive": { scoped: true, run: (a, actor) => archive(a.itemId, actor) },
  "content.restore": { scoped: true, run: (a, actor) => restore(a.itemId, a.sourceRevisionId, {}, actor) },

  // ── Organization (scoped — org services authorize at the unit's year/lineage) ──
  "org.unit.create": { scoped: true, run: (a, actor) => createOrgUnit(a.input, actor) },
  "org.unit.edit": { scoped: true, run: (a, actor) => editOrgUnit(a.id, a.patch ?? {}, actor) },
  "org.unit.publish": { scoped: true, run: (a, actor) => publishOrgUnit(a.id, actor) },
  "org.unit.archive": { scoped: true, run: (a, actor) => archiveOrgUnit(a.id, actor) },
  "org.person.upsert": { scoped: true, run: (a, actor) => upsertPerson(a.input, actor, { scope: a.scope ?? {} }) },
  "org.appointment.create": { scoped: true, run: (a, actor) => createAppointment(a.input, actor) },
  "org.appointment.edit": { scoped: true, run: (a, actor) => editAppointment(a.id, a.patch ?? {}, actor) },
  "org.appointment.publish": { scoped: true, run: (a, actor) => publishAppointment(a.id, actor) },
  "org.appointment.archive": { scoped: true, run: (a, actor) => archiveAppointment(a.id, actor) },

  // ── Academic Years (institute-wide) ──
  "year.create": { permission: "year.create", run: (a, actor) => createYear(a.input, actor) },
  "year.setCurrent": { permission: "year.update", run: (a, actor) => setCurrentYear(a.yearId, actor) },
  "year.lock": { permission: "year.lock", run: (a, actor) => lockYear(a.yearId, actor) },
  "year.unlock": { permission: "year.lock", run: (a, actor) => unlockYear(a.yearId, actor) },
  "year.transition": { permission: "year.transition", run: (a, actor) => runTransition(a.input, actor) },

  // ── Media (institute-wide) ──
  "media.create": { permission: "media.upload", run: (a, actor) => createMediaAsset(a.input, actor) },
  "media.update": { permission: "media.update", run: (a, actor) => updateMediaAsset(a.id, a.patch ?? {}, actor) },
  "media.archive": { permission: "media.delete", run: (a, actor) => archiveMediaAsset(a.id, actor) },

  // ── Users & Roles (institute-wide) ──
  "user.create": { permission: "user.create", run: (a, actor) => createUser(a.input, actor) },
  "user.update": { permission: "user.update", run: (a, actor) => updateUser(a.id, a.patch ?? {}, actor) },
  "user.setStatus": { permission: "user.suspend", run: (a, actor) => setUserStatus(a.id, a.status, actor) },
  "user.setPassword": { permission: "user.update", run: (a, actor) => setUserPassword(a.id, a.password, actor) },
  "role.create": { permission: "role.create", run: (a, actor) => createRole(a.input, actor) },
  "role.update": { permission: "role.update", run: (a, actor) => updateRole(a.id, a.patch ?? {}, actor) },
  "role.grant": { permission: "role.assign", run: (a, actor) => grantRole(a.input, actor) },
  "role.revoke": { permission: "role.revoke", run: (a, actor) => revokeRole(a.assignmentId, actor) },

  // ── Member-platform M0 (Session 11) ──
  // Account lifecycle: bulk-create, delete, admin force-reset (returns the generated
  // password ONCE for external delivery — never stored/audited).
  "user.bulkCreate": { permission: "user.create", run: (a, actor) => importUsersCsv(a.csv ?? "", actor) },
  "user.delete": { permission: "user.delete", run: (a, actor) => deleteUser(a.id, actor) },
  "user.forceReset": { permission: "user.update", run: (a, actor) => forcePasswordReset(a.id, actor) },
  // Notification / request queue (Password Management tabs).
  "notification.assign": { permission: "notification.assign", run: (a, actor) => assignNotification(a.id, actor) },
  "notification.resolve": { permission: "notification.resolve", run: (a, actor) => resolveNotification(a.id, { status: a.status, note: a.note }, actor) },
  // One-click reset fulfilment — composes notification.assign + user.update +
  // notification.resolve (each self-gates); scoped so the route only authenticates.
  "notification.fulfilReset": { scoped: true, run: (a, actor) => fulfilResetRequest(a.id, actor) },
  // PLUGIN toggle — DEVELOPER-ONLY (the service self-gates on is_developer); scoped
  // so the dispatcher only authenticates and the service enforces the developer gate.
  "plugin.set": { scoped: true, run: (a, actor) => setFeatureFlag(a.key, a.enabled, actor) },

  // ── Backups / recovery (self-gated via authorizeConsole — any-of backup.*) ──
  "backup.record": { console: true, run: (a, actor) => recordBackup(a.input, actor) },
  "backup.verify": { console: true, run: (a, actor) => markBackupVerified(a.id, actor, { verified: a.verified ?? true }) },
  "backup.rollbackMedia": { console: true, run: (a, actor) => rollbackMediaMigration(a.opts ?? {}, actor) },
  "backup.forceTransition": { console: true, run: (a, actor) => forceTransitionResync(a.input ?? {}, actor) },
};

export function isKnownAdminAction(action) {
  return Object.prototype.hasOwnProperty.call(ADMIN_ACTIONS, action);
}

// Dispatch an authenticated admin action. `user` is the result of requireUser()
// (the route enforces authentication + active status). This asserts the per-action
// permission (for institute-wide ops) FIRST, then runs the delegate inside an audit
// context. Scoped / console ops rely on the underlying service's own gate.
export async function dispatchAdminAction(action, args = {}, { user, ipAddress, userAgent } = {}) {
  const entry = ADMIN_ACTIONS[action];
  if (!entry) throw new CmsError(`Unknown admin action '${action}'.`, { status: 400, code: "UNKNOWN_ACTION" });
  if (!user?.id) {
    const err = new Error("Authentication required.");
    err.status = 401;
    err.code = "UNAUTHENTICATED";
    throw err;
  }
  if (entry.permission) await assertPermission(user.id, entry.permission, {}); // institute-wide gate, FIRST
  const actor = { userId: user.id };
  return withAuditContext({ actorUserId: user.id, ipAddress, userAgent }, () => entry.run(args, actor));
}
