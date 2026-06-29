// Backups / restore / rollback (Session 8) — the operational recovery surface.
//
// TWO things live here, both gated behind backup.* / dev.console:
//   1. The `backup_record` LEDGER — register / verify / list the verified backup
//      artifacts produced out-of-band by scripts/backup.sh (which itself zips +
//      re-extracts + checksums; this records that an artifact exists, where, and
//      whether it verified). These are real mutations, so they go through the
//      shared `auditedMutation` (one semantic audit row each), exactly like every
//      other service.
//   2. RECOVERY actions that are THIN DELEGATES to the EXISTING services — no new
//      mutation/rollback pipeline is built here (NEXT_TASK guard rail):
//        • rollbackMediaMigration → lib/media/migrate.mjs#rollbackMigration (DL-043,
//          reversible /public→Cloudinary, dry-run-able);
//        • forceTransitionResync  → lib/year/transition.mjs#runTransition({force})
//          (DL-031, re-sync new source rows into an already-completed run).
//      The console adds its OWN backup.restore gate FIRST (defense-in-depth); the
//      underlying tool then ALSO enforces its own permission (media.migrate /
//      year.transition) with the SAME actor — a caller needs both, which a
//      developer/super_admin satisfies via grants_all.
import prisma from "../prisma.mjs";
import { authorizeConsole } from "./authorize.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import { rollbackMigration } from "../media/migrate.mjs";
import { runTransition } from "../year/transition.mjs";

const ENTITY = "backup_record";

// ── backup_record ledger ─────────────────────────────────────────────────────

// Compact JSON-safe view of a backup_record row (bytes BigInt → Number; dates ISO).
export function shapeBackup(b) {
  if (!b) return null;
  return {
    id: b.id,
    scope: b.scope,
    format: b.format,
    location: b.location,
    checksum: b.checksum ?? null,
    bytes: b.bytes != null ? Number(b.bytes) : null,
    verified: b.verified,
    verifiedAt: b.verifiedAt instanceof Date ? b.verifiedAt.toISOString() : b.verifiedAt ?? null,
    createdById: b.createdById ?? null,
    createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt ?? null,
  };
}

// Register a backup artifact in the ledger. Authorizes backup.create; one audit row.
// input: { scope, location, format?='zip', checksum?, bytes?, verified?=false }
export async function recordBackup(input = {}, actor = {}) {
  await authorizeConsole(actor, ["backup.create", "dev.console"]);
  if (!input.scope) throw new CmsValidationError("A backup scope is required (e.g. 'public', 'db', 'full').");
  if (!input.location) throw new CmsValidationError("A backup location is required (path / URL).");
  // Validate bytes up front (friendly 422) — a bare BigInt() throws a raw
  // RangeError/SyntaxError for a float / non-numeric string that mapDbError doesn't
  // recognize, so it would surface as an opaque 500 instead (Session-8 review).
  let bytes = null;
  if (input.bytes != null) {
    const n = Number(input.bytes);
    if (!Number.isInteger(n) || n < 0) throw new CmsValidationError("bytes must be a non-negative whole number of bytes.");
    bytes = BigInt(n);
  }

  const { record } = await auditedMutation(
    actor,
    async (tx) => {
      const created = await tx.backupRecord.create({
        data: {
          scope: String(input.scope),
          format: String(input.format ?? "zip"),
          location: String(input.location),
          checksum: input.checksum ?? null,
          bytes,
          verified: !!input.verified,
          verifiedAt: input.verified ? new Date() : null,
          createdById: actor?.userId ?? null,
        },
      });
      return { record: created };
    },
    ({ record }) => ({
      action: "create",
      entityType: ENTITY,
      entityId: record.id,
      after: shapeBackup(record),
      summary: `Recorded ${record.scope} backup (${record.format})${record.verified ? ", verified" : ""}`,
    })
  );
  // Return the SHAPED row (BigInt → Number, dates → ISO) — never hand a raw BigInt
  // `bytes` back to a caller (JSON.stringify would throw); matches listBackups.
  return { record: shapeBackup(record) };
}

// Flip a backup record's verified flag (sets/clears verifiedAt). Authorizes
// backup.create; one audit row. Idempotent when the flag already matches.
export async function markBackupVerified(id, actor = {}, { verified = true } = {}) {
  await authorizeConsole(actor, ["backup.create", "dev.console"]);
  const existing = await prisma.backupRecord.findUnique({ where: { id } });
  if (!existing) throw new CmsNotFoundError(`Backup record ${id} not found.`);
  if (existing.verified === verified) return { record: shapeBackup(existing) };

  const { record } = await auditedMutation(
    actor,
    async (tx) => {
      const updated = await tx.backupRecord.update({
        where: { id },
        data: { verified, verifiedAt: verified ? new Date() : null },
      });
      return { record: updated };
    },
    ({ record }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: record.id,
      before: shapeBackup(existing),
      after: shapeBackup(record),
      summary: `${verified ? "Marked verified" : "Marked unverified"}: ${record.scope} backup`,
    })
  );
  return { record: shapeBackup(record) };
}

// List backup records (newest first), optional scope / verified filters. Gated read.
export async function listBackups({ scope, verified, take = 100 } = {}, actor = {}, { client = prisma } = {}) {
  await authorizeConsole(actor, ["backup.create", "backup.restore", "dev.console"]);
  const where = {};
  if (scope) where.scope = String(scope);
  if (verified != null) where.verified = !!verified;
  const rows = await client.backupRecord.findMany({ where, orderBy: { createdAt: "desc" }, take });
  return rows.map(shapeBackup);
}

// ── recovery delegates (existing services; no new pipeline) ───────────────────

// Reverse a /public→Cloudinary media migration (DL-043). Gated on backup.restore;
// delegates to the EXISTING reversible tool (which ALSO enforces media.migrate with
// the same actor). Pass { dryRun:true } to preview. Returns the tool's result.
export async function rollbackMediaMigration(opts = {}, actor = {}) {
  await authorizeConsole(actor, ["backup.restore", "dev.console"]);
  return rollbackMigration(opts, actor);
}

// Force a Transition Wizard re-sync into an already-completed (source→target) run
// (DL-031) — the recovery path when new source rows must be pulled into a year that
// was already transitioned (never creates a 2nd 'completed' row; restores prior
// provenance on failure). Gated on backup.restore; delegates to the EXISTING wizard
// (which ALSO enforces year.transition with the same actor).
export async function forceTransitionResync(input = {}, actor = {}) {
  await authorizeConsole(actor, ["backup.restore", "dev.console"]);
  return runTransition({ ...input, force: true }, actor);
}
