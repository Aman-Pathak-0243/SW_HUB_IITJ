// Ambient actor context for the central audit writer (DL-012). The audit
// extension needs to know WHO performed a mutation (actor user id) and request
// metadata (ip / user-agent) without threading those args through every service
// call. AsyncLocalStorage gives us a per-request/per-operation store that the
// extension reads transparently.
//
// Usage (route handler / server action):
//   import { withAuditContext } from "lib/cms/audit-context.mjs";
//   await withAuditContext({ actorUserId: user.id, ipAddress, userAgent }, () =>
//     contentService.publish(itemId, {}, { userId: user.id })
//   );
//
// The CMS service also sets `suppressAuto: true` inside its transactions so the
// per-statement auto-audit stands down and exactly one SEMANTIC audit row is
// written per business operation (publish/restore/...). See lib/cms/audit.mjs.
import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

// Run `fn` with the given audit context merged over any enclosing context.
export function withAuditContext(ctx, fn) {
  const merged = { ...(storage.getStore() ?? {}), ...(ctx ?? {}) };
  return storage.run(merged, fn);
}

// Current audit context ({} when none is active — e.g. seeds, scripts, tests).
export function getAuditContext() {
  return storage.getStore() ?? {};
}

// The acting user id, or null for system/cron/anonymous mutations.
export function getActorUserId() {
  return getAuditContext().actorUserId ?? null;
}

// True while a SEMANTIC audited operation owns the audit row for this scope, so
// the per-statement auto-audit extension should not also write one.
export function isAutoAuditSuppressed() {
  return getAuditContext().suppressAuto === true;
}
