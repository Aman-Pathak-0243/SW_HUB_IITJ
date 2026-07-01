// M5 — event ROUNDS / stages (DL-087). CRUD gated by the assertEventManage seam
// (DL-086): an organizing club's coordinator (scoped) OR staff/admin (global) may
// manage an event's rounds. One semantic audit row per op (EventRound ∈ AUTO_AUDIT_SKIP).
import prisma from "../prisma.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import { assertEventManage } from "./authz.mjs";
import { validateRoundInput } from "./forms.mjs";

const ENTITY = "event_round";

export function shapeRound(r) {
  if (!r) return null;
  return {
    id: r.id,
    eventItemId: r.eventItemId,
    roundNo: r.roundNo,
    name: r.name,
    description: r.description ?? null,
    startsAt: r.startsAt instanceof Date ? r.startsAt.toISOString() : r.startsAt ?? null,
    endsAt: r.endsAt instanceof Date ? r.endsAt.toISOString() : r.endsAt ?? null,
    sortOrder: r.sortOrder ?? 0,
  };
}

// Next round number for an event (max + 1) — so callers can omit roundNo.
async function nextRoundNo(client, eventItemId) {
  const top = await client.eventRound.findFirst({ where: { eventItemId }, orderBy: { roundNo: "desc" }, select: { roundNo: true } });
  return (top?.roundNo ?? 0) + 1;
}

export async function createRound(eventItemId, input = {}, actor = {}) {
  const item = await assertEventManage(actor, eventItemId); // authorize FIRST
  const clean = validateRoundInput(input, { isCreate: true });
  const roundNo = clean.roundNo ?? (await nextRoundNo(prisma, item.id));
  const { round } = await auditedMutation(
    actor,
    async (tx) => ({
      round: await tx.eventRound.create({
        data: {
          eventItemId: item.id,
          roundNo,
          name: clean.name,
          description: clean.description ?? null,
          startsAt: clean.startsAt ?? null,
          endsAt: clean.endsAt ?? null,
          sortOrder: clean.sortOrder ?? roundNo,
          createdById: actor?.userId ?? null,
        },
      }),
    }),
    ({ round }) => ({
      action: "create",
      entityType: ENTITY,
      entityId: round.id,
      academicYearId: item.academicYearId,
      after: { eventItemId: item.id, roundNo: round.roundNo, name: round.name },
      summary: `Added round ${round.roundNo} "${round.name}" to event ${item.id}`,
    })
  );
  return { round: shapeRound(round) };
}

export async function editRound(roundId, patch = {}, actor = {}) {
  const existing = await prisma.eventRound.findUnique({ where: { id: roundId } });
  if (!existing) throw new CmsNotFoundError(`Round ${roundId} not found.`);
  const item = await assertEventManage(actor, existing.eventItemId);
  const data = validateRoundInput(patch, { isCreate: false });
  if (!Object.keys(data).length) return { round: shapeRound(existing), changed: false };
  const { round } = await auditedMutation(
    actor,
    async (tx) => ({ round: await tx.eventRound.update({ where: { id: roundId }, data }) }),
    ({ round }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: round.id,
      academicYearId: item.academicYearId,
      before: { name: existing.name, roundNo: existing.roundNo },
      after: { name: round.name, roundNo: round.roundNo },
      summary: `Edited round ${round.roundNo} of event ${item.id}`,
    })
  );
  return { round: shapeRound(round), changed: true };
}

// Delete a round (its scores + attendance cascade at the DB level).
export async function deleteRound(roundId, actor = {}) {
  const existing = await prisma.eventRound.findUnique({ where: { id: roundId } });
  if (!existing) throw new CmsNotFoundError(`Round ${roundId} not found.`);
  const item = await assertEventManage(actor, existing.eventItemId);
  await auditedMutation(
    actor,
    async (tx) => {
      await tx.eventRound.delete({ where: { id: roundId } });
      return { existing };
    },
    () => ({
      action: "delete",
      entityType: ENTITY,
      entityId: existing.id,
      academicYearId: item.academicYearId,
      before: { roundNo: existing.roundNo, name: existing.name },
      summary: `Deleted round ${existing.roundNo} "${existing.name}" of event ${item.id}`,
    })
  );
  return { removed: true };
}

// Read an event's rounds (ordered). Ungated (public playground display data).
export async function listRounds(eventItemId, { client = prisma } = {}) {
  if (!eventItemId) return [];
  const rows = await client.eventRound.findMany({ where: { eventItemId }, orderBy: [{ sortOrder: "asc" }, { roundNo: "asc" }] });
  return rows.map(shapeRound);
}
