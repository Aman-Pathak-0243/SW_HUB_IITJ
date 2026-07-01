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
import { upsertPerson, createPerson, editPerson, archivePerson } from "../org/people.mjs";
import { createYear, setCurrentYear } from "../year/context.mjs";
import { lockYear, unlockYear } from "../year/lock.mjs";
import { runTransition } from "../year/transition.mjs";
import { createMediaAsset, updateMediaAsset, archiveMediaAsset } from "../media/service.mjs";
import {
  createUser, updateUser, setUserStatus, setUserPassword,
  createRole, updateRole, grantRole, revokeRole,
  importUsersCsv, deleteUser, forcePasswordReset,
  setUserOverride, removeUserOverride, setUserOverrides,
} from "../users/admin.mjs";
import { recordBackup, markBackupVerified, rollbackMediaMigration, forceTransitionResync } from "../devconsole/backups.mjs";
import { setFeatureFlag } from "../platform/flags.mjs";
import { assignNotification, resolveNotification } from "../notifications/service.mjs";
import { fulfilResetRequest } from "../auth/password-reset.mjs";
import { assignFeedback, setFeedbackStatus } from "../feedback/service.mjs";
import { addMembership, removeMembership, setMembershipStatus, importClubMemberships } from "../memberships/service.mjs";
import { setAchievementCredits } from "../achievements/credits.mjs";
import { setEventOrganizers, createEventEntity, updateEventEntity } from "../events/organizers.mjs";
import { createRound, editRound, deleteRound } from "../events/rounds.mjs";
import { upsertEventSettings } from "../events/settings.mjs";
import { addRegistration, setRegistrationStatus, removeRegistration } from "../events/registration.mjs";
import { setRoundScores, markAttendance } from "../events/scoring.mjs";
import { submitClosureReport, reviewClosureReport } from "../events/closure.mjs";
import { exportEventsOrganizedHistory } from "../events/organized.mjs";
import { exportAuditLog } from "../devconsole/audit.mjs";
import { setTableThreshold, removeTableThreshold, exportTable, truncateTable } from "../devconsole/storage.mjs";
import { addAuthorizedSender, removeAuthorizedSender, sendBulk } from "../mail/service.mjs";

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
  // Person DIRECTORY management (add / update / delete) — the services self-gate on the
  // appointment.* permissions; people span units so these are institute-wide edits.
  "org.person.create": { scoped: true, run: (a, actor) => createPerson(a.input ?? {}, actor) },
  "org.person.edit": { scoped: true, run: (a, actor) => editPerson(a.id, a.patch ?? {}, actor) },
  "org.person.archive": { scoped: true, run: (a, actor) => archivePerson(a.id, actor) },
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
  // M1 (DL-067): the per-account "allow normal (member) view" toggle — delegates to
  // updateUser (one audited row), gated on user.update like other profile edits.
  "user.setAllowNormalView": { permission: "user.update", run: (a, actor) => updateUser(a.id, { allowNormalView: a.allowNormalView }, actor) },
  "user.setPassword": { permission: "user.update", run: (a, actor) => setUserPassword(a.id, a.password, actor) },
  "role.create": { permission: "role.create", run: (a, actor) => createRole(a.input, actor) },
  "role.update": { permission: "role.update", run: (a, actor) => updateRole(a.id, a.patch ?? {}, actor) },
  "role.grant": { permission: "role.assign", run: (a, actor) => grantRole(a.input, actor) },
  "role.revoke": { permission: "role.revoke", run: (a, actor) => revokeRole(a.assignmentId, actor) },
  // Per-email permission overrides (M2) — institute-wide gate; the service adds the
  // DL-062 escalation guard (a GRANT requires the actor to hold that permission).
  "permission.override.set": { permission: "permission.override", run: (a, actor) => setUserOverride(a.input, actor) },
  "permission.override.remove": { permission: "permission.override", run: (a, actor) => removeUserOverride(a.id, actor) },
  // Session 14 (DL-102): bulk-set an account's institute-wide overrides from the checkbox grid.
  "permission.override.setBulk": { permission: "permission.override", run: (a, actor) => setUserOverrides(a.userId, a.entries ?? [], actor) },

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

  // ── Feedback / support tickets (M7) — institute-wide gate on feedback.resolve ──
  "feedback.assign": { permission: "feedback.resolve", run: (a, actor) => assignFeedback(a.id, actor) },
  "feedback.setStatus": { permission: "feedback.resolve", run: (a, actor) => setFeedbackStatus(a.id, { status: a.status, note: a.note }, actor) },

  // ── Club memberships (M3) — SCOPED: the service authorizes membership.manage at
  // the unit's lineage (DL-066/075), which the route boundary can't know up front. ──
  "membership.add": { scoped: true, run: (a, actor) => addMembership(a.input ?? {}, actor) },
  "membership.remove": { scoped: true, run: (a, actor) => removeMembership(a.id, actor) },
  "membership.setStatus": { scoped: true, run: (a, actor) => setMembershipStatus(a.id, a.status, actor) },
  "membership.import": { scoped: true, run: (a, actor) => importClubMemberships(a.input ?? {}, actor) },

  // ── Wall of Fame / achievement CREDITS (M4) — SCOPED: the service authorizes
  // content.update at the achievement's year scope (DL-081/082); the achievement
  // CONTENT itself is created/edited/published via the generic content.* actions. ──
  "achievement.credits.set": { scoped: true, run: (a, actor) => setAchievementCredits(a.itemId, a.credits ?? [], actor) },

  // ── Event Playground (M5) — SCOPED: every service authorizes via the assertEventManage
  // seam (GLOBAL staff/admin/dev OR SCOPED to an organizing club lineage, DL-086); the
  // event CONTENT (details / problem statement / hybrid blocks) uses the generic content.*
  // actions. Member self-registration is NOT here — it is the gated /api/events/participate
  // route (requireMember + assertCanParticipate). Organizer tagging + closure REVIEW +
  // custom entities self-gate on GLOBAL event.manage inside the service. ──
  "event.organizers.set": { scoped: true, run: (a, actor) => setEventOrganizers(a.eventItemId, a.organizers ?? [], actor) },
  "event.entity.create": { scoped: true, run: (a, actor) => createEventEntity(a.input ?? {}, actor) },
  "event.entity.update": { scoped: true, run: (a, actor) => updateEventEntity(a.id, a.patch ?? {}, actor) },
  "event.settings.set": { scoped: true, run: (a, actor) => upsertEventSettings(a.eventItemId, a.patch ?? {}, actor) },
  "event.round.create": { scoped: true, run: (a, actor) => createRound(a.eventItemId, a.input ?? {}, actor) },
  "event.round.edit": { scoped: true, run: (a, actor) => editRound(a.roundId, a.patch ?? {}, actor) },
  "event.round.delete": { scoped: true, run: (a, actor) => deleteRound(a.roundId, actor) },
  "event.registration.add": { scoped: true, run: (a, actor) => addRegistration(a.input ?? {}, actor) },
  "event.registration.setStatus": { scoped: true, run: (a, actor) => setRegistrationStatus(a.id, a.status, actor) },
  "event.registration.remove": { scoped: true, run: (a, actor) => removeRegistration(a.id, actor) },
  "event.scores.set": { scoped: true, run: (a, actor) => setRoundScores(a.eventItemId, a.roundId ?? null, a.scores ?? [], actor) },
  "event.attendance.mark": { scoped: true, run: (a, actor) => markAttendance(a.eventItemId, a.roundId ?? null, a.attendance ?? [], actor) },
  "event.closure.submit": { scoped: true, run: (a, actor) => submitClosureReport(a.input ?? {}, actor) },
  "event.closure.review": { scoped: true, run: (a, actor) => reviewClosureReport(a.id, a.patch ?? {}, actor) },
  // "Events Organized" change-history export (M8 dev-dashboard tab, DL-089) — self-gates
  // on audit.read inside the service; scoped so the route only authenticates.
  "eventsOrganized.exportHistory": { scoped: true, run: (a, actor) => exportEventsOrganizedHistory({ yearId: a.yearId }, actor, { format: a.format }) },

  // ── Developer dashboard — Action Log export (M8). Self-gated via authorizeConsole
  // (audit.read) inside exportAuditLog; scoped so the route only authenticates. ──
  "audit.export": { scoped: true, run: (a, actor) => exportAuditLog(a.filters ?? {}, actor, { format: a.format }) },

  // ── Developer dashboard — storage (M8). DESTRUCTIVE/dev-only: gate storage.manage. ──
  "storage.setThreshold": { permission: "storage.manage", run: (a, actor) => setTableThreshold(a.tableName, a.thresholdBytes, { note: a.note }, actor) },
  "storage.removeThreshold": { permission: "storage.manage", run: (a, actor) => removeTableThreshold(a.tableName, actor) },
  "storage.export": { permission: "storage.manage", run: (a, actor) => exportTable(a.tableName, actor, { format: a.format }) },
  "storage.truncate": { permission: "storage.manage", run: (a, actor) => truncateTable(a.tableName, actor, { confirm: a.confirm === true }) },

  // ── Developer dashboard — bulk mail (M8) ──
  "mail.addSender": { permission: "mail.manage", run: (a, actor) => addAuthorizedSender(a.input ?? {}, actor) },
  "mail.removeSender": { permission: "mail.manage", run: (a, actor) => removeAuthorizedSender(a.id, actor) },
  "mail.sendBulk": { permission: "mail.send", run: (a, actor) => sendBulk(a.input ?? {}, actor) },

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
