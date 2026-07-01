// M5 — event SCORES + ATTENDANCE + RANKING (DL-087).
//
// Scores (round-wise: round_id set; overall: round_id NULL) and attendance are marked
// by ORGANIZERS via the assertEventManage seam, submitted per-round as a SHEET
// (replace-set: the submitted rows become the full set for that round, deduped by
// user), writing ONE semantic audit summary row per submission (cross-stakeholder).
//
// RANKING is computed in the READ layer (no stored rank column): per-round ranking
// orders by that round's points; OVERALL ranking sums a user's scores across rounds
// (+ any explicit overall row). Ranking reads are public playground data — PII-minimized
// (participants by display NAME only). rankEntries (STANDARD competition rank) is PURE
// (lib/events/forms.mjs) so the ordering is unit-tested without a DB.
import prisma from "../prisma.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsValidationError } from "../cms/errors.mjs";
import { normalizeEmail } from "../auth/email.mjs";
import { assertEventManage } from "./authz.mjs";
import { normalizePoints, rankEntries } from "./forms.mjs";

const SCORE_ENTITY = "event_score";
const ATTENDANCE_ENTITY = "event_attendance";

// Validate a roundId belongs to the event (or accept null = overall). Returns the
// resolved roundId (null for overall).
async function resolveRound(eventItemId, roundId, client) {
  if (roundId == null) return null;
  const round = await client.eventRound.findUnique({ where: { id: roundId }, select: { id: true, eventItemId: true } });
  if (!round || round.eventItemId !== eventItemId) throw new CmsValidationError("That round does not belong to this event.");
  return round.id;
}

// Resolve a batch of { userId? | email? } descriptors → a Map(userId) in ONE query
// per lookup kind (no N+1). Missing accounts are reported (never auto-created).
async function resolveUsers(entries, client) {
  const byId = new Map();
  const ids = entries.filter((e) => e.userId).map((e) => e.userId);
  const emails = entries.filter((e) => !e.userId && e.email).map((e) => normalizeEmail(e.email)).filter(Boolean);
  if (ids.length) {
    const rows = await client.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, email: true } });
    for (const r of rows) byId.set(r.id, r);
  }
  const emailToId = new Map();
  if (emails.length) {
    const rows = await client.user.findMany({ where: { email: { in: [...new Set(emails)] } }, select: { id: true, email: true } });
    for (const r of rows) { byId.set(r.id, r); emailToId.set(r.email.toLowerCase(), r.id); }
  }
  return { byId, emailToId };
}

// ── scores (replace-set per round; audited) ──
// entries: [{ userId? | email?, points, note? }]. Missing accounts → reported in the
// return, not created. roundId null = the OVERALL score row.
export async function setRoundScores(eventItemId, roundId, entries = [], actor = {}) {
  const item = await assertEventManage(actor, eventItemId); // authorize FIRST
  if (!Array.isArray(entries)) throw new CmsValidationError("scores must be an array.");
  const resolvedRoundId = await resolveRound(item.id, roundId, prisma);
  const { byId, emailToId } = await resolveUsers(entries, prisma);

  const seen = new Set();
  const rows = [];
  const missing = [];
  for (const e of entries) {
    const userId = e.userId ?? (e.email ? emailToId.get(normalizeEmail(e.email)?.toLowerCase()) : null);
    if (!userId || !byId.has(userId)) { missing.push(e.email ?? e.userId ?? null); continue; }
    if (seen.has(userId)) continue;
    seen.add(userId);
    rows.push({
      eventItemId: item.id,
      roundId: resolvedRoundId,
      userId,
      points: normalizePoints(e.points),
      note: e.note != null ? String(e.note).slice(0, 500) : null,
      createdById: actor?.userId ?? null,
    });
  }

  const { count } = await auditedMutation(
    actor,
    async (tx) => {
      // Replace the full score set for this (event, round): overall uses round_id IS NULL.
      await tx.eventScore.deleteMany({ where: { eventItemId: item.id, roundId: resolvedRoundId } });
      if (rows.length) await tx.eventScore.createMany({ data: rows });
      return { count: rows.length };
    },
    ({ count }) => ({
      action: "update",
      entityType: SCORE_ENTITY,
      entityId: item.id,
      academicYearId: item.academicYearId,
      after: { eventItemId: item.id, roundId: resolvedRoundId, scored: count, missing: missing.length },
      summary: `Set ${count} score(s) for event ${item.id} ${resolvedRoundId ? `round ${resolvedRoundId}` : "(overall)"}`,
    })
  );
  return { scored: count, missing, roundId: resolvedRoundId };
}

// ── attendance (replace-set per round; audited) ──
// entries: [{ userId? | email?, present?, note? }]. roundId null = overall attendance.
export async function markAttendance(eventItemId, roundId, entries = [], actor = {}) {
  const item = await assertEventManage(actor, eventItemId); // authorize FIRST
  if (!Array.isArray(entries)) throw new CmsValidationError("attendance must be an array.");
  const resolvedRoundId = await resolveRound(item.id, roundId, prisma);
  const { byId, emailToId } = await resolveUsers(entries, prisma);

  const seen = new Set();
  const rows = [];
  const missing = [];
  for (const e of entries) {
    const userId = e.userId ?? (e.email ? emailToId.get(normalizeEmail(e.email)?.toLowerCase()) : null);
    if (!userId || !byId.has(userId)) { missing.push(e.email ?? e.userId ?? null); continue; }
    if (seen.has(userId)) continue;
    seen.add(userId);
    rows.push({
      eventItemId: item.id,
      roundId: resolvedRoundId,
      userId,
      present: e.present !== false,
      note: e.note != null ? String(e.note).slice(0, 500) : null,
      createdById: actor?.userId ?? null,
    });
  }

  const { present, count } = await auditedMutation(
    actor,
    async (tx) => {
      await tx.eventAttendance.deleteMany({ where: { eventItemId: item.id, roundId: resolvedRoundId } });
      if (rows.length) await tx.eventAttendance.createMany({ data: rows });
      return { count: rows.length, present: rows.filter((r) => r.present).length };
    },
    ({ present, count }) => ({
      action: "update",
      entityType: ATTENDANCE_ENTITY,
      entityId: item.id,
      academicYearId: item.academicYearId,
      after: { eventItemId: item.id, roundId: resolvedRoundId, marked: count, present },
      summary: `Marked attendance for ${count} member(s) (${present} present) on event ${item.id} ${resolvedRoundId ? `round ${resolvedRoundId}` : "(overall)"}`,
    })
  );
  return { marked: count, present, missing, roundId: resolvedRoundId };
}

// ── reads ──

// GATED score sheet for the organizer editor (carries emails). assertEventManage.
export async function listScores(eventItemId, { roundId = undefined, actor = {}, client = prisma } = {}) {
  const item = await assertEventManage(actor, eventItemId);
  const where = { eventItemId: item.id };
  if (roundId !== undefined) where.roundId = roundId; // null = overall
  const rows = await client.eventScore.findMany({ where, include: { user: { select: { id: true, email: true, name: true } } }, orderBy: { points: "desc" } });
  return rows.map((r) => ({ id: r.id, roundId: r.roundId ?? null, userId: r.userId, userEmail: r.user?.email ?? null, userName: r.user?.name ?? null, points: r.points, note: r.note ?? null }));
}

// PUBLIC per-round ranking (names only). Ungated playground display data — the internal
// app_user uuid is NEVER serialized (PII minimization, DL-082 parity); ranking is by
// display NAME + points + rank only. rankEntries uses userId for a stable tiebreak
// internally, then it is dropped from the returned shape.
export async function getRoundRanking(eventItemId, roundId, { client = prisma } = {}) {
  if (!eventItemId || !roundId) return [];
  const rows = await client.eventScore.findMany({
    where: { eventItemId, roundId },
    include: { user: { select: { id: true, name: true } } },
  });
  const entries = rows.map((r) => ({ userId: r.userId, name: r.user?.name ?? null, points: r.points }));
  return rankEntries(entries).map((e) => ({ name: e.name, points: e.points, rank: e.rank }));
}

// PUBLIC OVERALL ranking — sum of a user's scores across all rounds (+ any overall row).
// Ungated; NAMES only (no app_user uuid). Aggregated in one groupBy + one name lookup (no N+1).
export async function getOverallRanking(eventItemId, { client = prisma } = {}) {
  if (!eventItemId) return [];
  const grouped = await client.eventScore.groupBy({ by: ["userId"], where: { eventItemId }, _sum: { points: true } });
  if (!grouped.length) return [];
  const userIds = grouped.map((g) => g.userId);
  const users = await client.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } });
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  const entries = grouped.map((g) => ({ userId: g.userId, name: nameById.get(g.userId) ?? null, points: g._sum.points ?? 0 }));
  return rankEntries(entries).map((e) => ({ name: e.name, points: e.points, rank: e.rank }));
}

// GATED attendance sheet for the organizer editor (emails). assertEventManage.
export async function listAttendance(eventItemId, { roundId = undefined, actor = {}, client = prisma } = {}) {
  const item = await assertEventManage(actor, eventItemId);
  const where = { eventItemId: item.id };
  if (roundId !== undefined) where.roundId = roundId;
  const rows = await client.eventAttendance.findMany({ where, include: { user: { select: { id: true, email: true, name: true } } }, orderBy: { markedAt: "desc" } });
  return rows.map((r) => ({ id: r.id, roundId: r.roundId ?? null, userId: r.userId, userEmail: r.user?.email ?? null, userName: r.user?.name ?? null, present: r.present, note: r.note ?? null }));
}
