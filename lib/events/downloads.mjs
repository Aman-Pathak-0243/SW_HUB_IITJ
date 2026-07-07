// M5 — event CSV DOWNLOAD orchestration (DL-087). Organizers / admin / staff / dev
// download participants / scores / attendance (round-wise + overall). GATED by the
// assertEventManage seam (a coordinator of an organizing club, or staff/admin), then
// fetches the (bounded, per-event) rows and serializes via the PURE lib/events/csv.mjs.
// Reads only — no mutation, no audit row (a download is not a state change; the audit
// export IS separately audited for the Events-Organized doc history, DL-089).
import prisma from "../prisma.mjs";
import { CmsValidationError } from "../cms/errors.mjs";
import { assertEventManage } from "./authz.mjs";
import { rankEntries } from "./forms.mjs";
import { participantsToCsv, scoresToCsv, attendanceToCsv, rankingToCsv } from "./csv.mjs";

export const DOWNLOAD_KINDS = ["participants", "scores", "attendance", "ranking"];

const roundLabel = (roundId, roundMap) => (roundId ? roundMap.get(roundId) ?? `Round ${roundId}` : "Overall");

// Build a { filename, contentType, content, count } CSV payload for an event.
// kind: participants | scores | attendance | ranking. `roundId` scopes scores/attendance
// (undefined = all rounds; null = the overall row only). authorize FIRST.
export async function exportEventCsv(eventItemId, kind, actor = {}, { roundId = undefined, client = prisma } = {}) {
  if (!DOWNLOAD_KINDS.includes(kind)) throw new CmsValidationError(`Unknown download '${kind}'. Allowed: ${DOWNLOAD_KINDS.join(", ")}.`);
  const item = await assertEventManage(actor, eventItemId); // authorize FIRST

  // Round labels for the round column (one query).
  const rounds = await client.eventRound.findMany({ where: { eventItemId: item.id }, select: { id: true, name: true, roundNo: true } });
  const roundMap = new Map(rounds.map((r) => [r.id, `${r.roundNo}. ${r.name}`]));
  const slug = item.slug || item.id;

  if (kind === "participants") {
    const regs = await client.eventRegistration.findMany({
      where: { eventItemId: item.id },
      orderBy: [{ status: "asc" }, { registeredAt: "asc" }],
      include: { user: { select: { email: true, name: true } } },
    });
    const rows = regs.map((r) => ({
      userName: r.user?.name ?? null,
      userEmail: r.user?.email ?? null,
      status: r.status,
      teamName: r.teamName ?? null,
      registeredAt: r.registeredAt instanceof Date ? r.registeredAt.toISOString() : r.registeredAt ?? null,
    }));
    return { filename: `event-${slug}-participants.csv`, contentType: "text/csv", content: participantsToCsv(rows), count: rows.length };
  }

  if (kind === "scores") {
    const where = { eventItemId: item.id };
    if (roundId !== undefined) where.roundId = roundId;
    const scores = await client.eventScore.findMany({ where, orderBy: [{ roundId: "asc" }, { points: "desc" }], include: { user: { select: { email: true, name: true } } } });
    const rows = scores.map((s) => ({
      userName: s.user?.name ?? null,
      userEmail: s.user?.email ?? null,
      round: roundLabel(s.roundId, roundMap),
      points: s.points,
      note: s.note ?? null,
    }));
    return { filename: `event-${slug}-scores.csv`, contentType: "text/csv", content: scoresToCsv(rows), count: rows.length };
  }

  if (kind === "attendance") {
    const where = { eventItemId: item.id };
    if (roundId !== undefined) where.roundId = roundId;
    const att = await client.eventAttendance.findMany({ where, orderBy: [{ roundId: "asc" }, { markedAt: "asc" }], include: { user: { select: { email: true, name: true } } } });
    const rows = att.map((a) => ({
      userName: a.user?.name ?? null,
      userEmail: a.user?.email ?? null,
      round: roundLabel(a.roundId, roundMap),
      present: a.present,
      note: a.note ?? null,
    }));
    return { filename: `event-${slug}-attendance.csv`, contentType: "text/csv", content: attendanceToCsv(rows), count: rows.length };
  }

  // ranking (overall) — sum of a user's scores, ranked (names only; already gated).
  const grouped = await client.eventScore.groupBy({ by: ["userId"], where: { eventItemId: item.id }, _sum: { points: true } });
  const users = grouped.length ? await client.user.findMany({ where: { id: { in: grouped.map((g) => g.userId) } }, select: { id: true, name: true } }) : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const ranked = rankEntries(grouped.map((g) => ({ userId: g.userId, name: nameById.get(g.userId) ?? null, points: g._sum.points ?? 0 })));
  return { filename: `event-${slug}-ranking.csv`, contentType: "text/csv", content: rankingToCsv(ranked), count: ranked.length };
}
