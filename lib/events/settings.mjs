// M5 — event operational SETTINGS (DL-084/087): capacity + registration window,
// kept OUT of the versioned event_payload (capacity drives the waitlist backstop and
// must be one stable value). 1:1 with the event content_item. Managed via the
// assertEventManage seam (an organizing coordinator OR staff/admin); one audit row.
import prisma from "../prisma.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsValidationError } from "../cms/errors.mjs";
import { assertEventManage } from "./authz.mjs";
import { normalizeCapacity } from "./forms.mjs";
import { promoteWaitlistForCapacity } from "./registration.mjs";

const ENTITY = "event_settings";

export function shapeSettings(s, eventItemId) {
  if (!s) return { eventItemId, capacity: null, registrationOpensAt: null, registrationClosesAt: null, registrationClosed: false };
  return {
    eventItemId: s.eventItemId,
    capacity: s.capacity ?? null,
    registrationOpensAt: s.registrationOpensAt instanceof Date ? s.registrationOpensAt.toISOString() : s.registrationOpensAt ?? null,
    registrationClosesAt: s.registrationClosesAt instanceof Date ? s.registrationClosesAt.toISOString() : s.registrationClosesAt ?? null,
    registrationClosed: s.registrationClosed === true,
  };
}

function normalizeWindowDate(v, field) {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) throw new CmsValidationError(`${field} is not a valid date.`);
  return d;
}

// Read an event's settings (or a defaults shape when no row exists). Ungated — the
// registration window + capacity are shown on the playground so members know if
// registration is open (the roster/PII is gated separately).
export async function getEventSettings(eventItemId, { client = prisma } = {}) {
  if (!eventItemId) return null;
  const row = await client.eventSettings.findUnique({ where: { eventItemId } });
  return shapeSettings(row, eventItemId);
}

// Upsert an event's settings. patch: { capacity?, registrationOpensAt?,
// registrationClosesAt?, registrationClosed? } — an omitted key leaves the stored value.
export async function upsertEventSettings(eventItemId, patch = {}, actor = {}) {
  const item = await assertEventManage(actor, eventItemId); // authorize FIRST
  const existing = await prisma.eventSettings.findUnique({ where: { eventItemId: item.id } });

  const data = {};
  const capacity = normalizeCapacity(patch.capacity);
  if (capacity !== undefined) data.capacity = capacity;
  const opens = normalizeWindowDate(patch.registrationOpensAt, "registrationOpensAt");
  if (opens !== undefined) data.registrationOpensAt = opens;
  const closes = normalizeWindowDate(patch.registrationClosesAt, "registrationClosesAt");
  if (closes !== undefined) data.registrationClosesAt = closes;
  if (patch.registrationClosed !== undefined) data.registrationClosed = patch.registrationClosed === true;

  const { settings } = await auditedMutation(
    actor,
    async (tx) => ({
      settings: await tx.eventSettings.upsert({
        where: { eventItemId: item.id },
        create: { eventItemId: item.id, ...data, updatedById: actor?.userId ?? null },
        update: { ...data, updatedById: actor?.userId ?? null },
      }),
    }),
    ({ settings }) => ({
      action: existing ? "update" : "create",
      entityType: ENTITY,
      entityId: item.id,
      academicYearId: item.academicYearId,
      before: existing ? shapeSettings(existing) : undefined,
      after: shapeSettings(settings),
      summary: `${existing ? "Updated" : "Set"} registration settings for event ${item.id}`,
    })
  );

  // If capacity was (re)set, fill any seats it opened from the waitlist so a raised or
  // newly-unlimited capacity never strands waitlisted members (consolidation review B4).
  // Runs AFTER the settings commit above so it reads the new capacity; a no-op when the
  // capacity was lowered/unchanged or there is no waitlist.
  let promoted = 0;
  if (capacity !== undefined) {
    try {
      ({ promoted } = await promoteWaitlistForCapacity(item.id));
    } catch (e) {
      console.warn(`[event_settings] waitlist promotion after capacity change failed for ${item.id}:`, e?.message ?? e);
    }
  }
  return { settings: shapeSettings(settings), promoted };
}
