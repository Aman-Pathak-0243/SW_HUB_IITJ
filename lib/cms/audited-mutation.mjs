// Shared post-commit audited-mutation wrapper + the Neon-safe interactive-tx
// ceiling. Used by BOTH the CMS content service (lib/cms/content.mjs) and the
// Academic Year engine (lib/year/*), so the "one semantic audit row per business
// action" pattern lives in exactly one place (DL-012 / DL-028).
//
// Pattern: run the mutation in a transaction with auto-audit SUPPRESSED, then
// write exactly ONE semantic audit_log row AFTER commit via the un-extended
// `prismaBase` client (recursion-safe). Auditing is best-effort: a failed audit
// write is logged and never rolls back / masks the committed mutation.
import prisma, { prismaBase } from "../prisma.mjs";
import { withAuditContext } from "./audit-context.mjs";
import { recordAudit } from "./audit.mjs";
import { withMappedDbErrors } from "./errors.mjs";

// Interactive-transaction options. A business operation runs several sequential
// statements in one transaction; on a cold / latent Neon serverless compute the
// default 5s ceiling can be exceeded (P2028 "Transaction not found"). These are
// generous SAFETY ceilings — when Neon is warm the work finishes well under a
// second; they never trip in normal serverless operation.
export const TX_OPTS = { timeout: 30000, maxWait: 20000 };

// Run `txFn` inside one transaction with auto-audit suppressed, then derive and
// write one semantic audit entry via `auditEntryFor(result)` (return a falsy
// value to skip the audit row, e.g. on a no-op). DB-guard violations inside the
// transaction surface as friendly CmsErrors (withMappedDbErrors).
export async function auditedMutation(actor, txFn, auditEntryFor) {
  const result = await withAuditContext({ actorUserId: actor?.userId ?? null, suppressAuto: true }, () =>
    withMappedDbErrors(() => prisma.$transaction(txFn, TX_OPTS))
  );
  const entry = auditEntryFor(result);
  if (entry) {
    await recordAudit(prismaBase, { actorUserId: actor?.userId ?? null, ...entry }).catch((e) => {
      console.warn(`[audit] semantic ${entry.action} on ${entry.entityType} failed:`, e?.message ?? e);
    });
  }
  return result;
}
