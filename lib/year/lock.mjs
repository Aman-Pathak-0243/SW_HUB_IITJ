// Lock / unlock an academic year (capability 1 + 5). Locking sets
// academic_year.status='locked', which makes that year STRUCTURALLY read-only:
// the `lock_guard` trigger then rejects every INSERT/UPDATE/DELETE on the year's
// org_unit / appointment / content_item rows (and UPDATE/DELETE on its
// content_revision rows — a revision INSERT stays allowed as the append-errata
// path). Unlocking restores status='active'.
//
// We do NOT re-implement read-only enforcement in app code — the trigger is the
// single source of truth (DL-029). A blocked write surfaces the friendly
// YEAR_LOCKED error via lib/cms/errors.mjs#mapDbError. Updating
// academic_year.status itself is NOT lock-guarded (the guard covers the
// year-scoped child tables, not the year row), so lock/unlock always succeeds.
//
// AUTHORIZATION: `year.lock` (institute-wide). A `system` actor bypasses.
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import {
  assertActorPermission,
  auditedMutation,
  getYear,
  yearSnapshot,
  YEAR_OP_PERMISSIONS,
} from "./context.mjs";

const ENTITY = "academic_year";

// PURE precondition: which locks are allowed. The CURRENT (live, editable) year
// must never be locked — that would freeze the whole live portal. Returns null
// when allowed, or a { code, message } describing why not. Unit-testable.
export function lockBlockReason(year, nextStatus) {
  if (!year) return { code: "CMS_NOT_FOUND", message: "Academic year not found." };
  if (nextStatus === "locked" && year.isCurrent) {
    return {
      code: "CANNOT_LOCK_CURRENT",
      message: "The current (live) academic year cannot be locked. Make another year current first.",
    };
  }
  return null;
}

async function setYearStatus(yearId, nextStatus, actor, verb) {
  await assertActorPermission(actor, YEAR_OP_PERMISSIONS.lock);
  const year = await getYear(yearId);
  if (!year) throw new CmsNotFoundError(`Academic year ${yearId} not found.`);

  const block = lockBlockReason(year, nextStatus);
  if (block) throw new CmsValidationError(block.message, { status: 409, code: block.code });

  // Idempotent: already in the desired state.
  if (year.status === nextStatus) return { year, changed: false };

  return auditedMutation(
    actor,
    async (tx) => {
      const updated = await tx.academicYear.update({
        where: { id: yearId },
        data: { status: nextStatus, updatedById: actor?.userId ?? null },
      });
      return { year: updated, previous: year, changed: true };
    },
    ({ year: updated, previous, changed }) =>
      changed
        ? {
            action: "update",
            entityType: ENTITY,
            entityId: updated.id,
            academicYearId: updated.id,
            before: yearSnapshot(previous),
            after: yearSnapshot(updated),
            summary: `${verb} academic year ${updated.label}`,
          }
        : null
  );
}

// Lock a past year → status='locked' (read-only). Rejects locking the current year.
export async function lockYear(yearId, actor = {}) {
  return setYearStatus(yearId, "locked", actor, "Locked");
}

// Unlock a year → status='active' (editable again, e.g. for controlled errata).
export async function unlockYear(yearId, actor = {}) {
  return setYearStatus(yearId, "active", actor, "Unlocked");
}
