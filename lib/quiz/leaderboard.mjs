// LIVE-QUIZ running-score leaderboard (Session 16, DL-106/107). A member's score is the
// SUM of their per-question points_awarded in a session, read AUTHORITATIVELY from Postgres
// as ONE indexed groupBy over quiz_answer(session_id, user_id) — cheap on local Postgres
// (systemRequirements §9) and IDENTICAL for every viewer. Ranking is the pure
// computeLeaderboard (standard competition rank, stable tiebreak). Names are resolved only
// for the displayed slice (top-N + the viewer), never the whole set.
//
// NOTE (Session-16 adversarial review): a Redis sorted-set cache was intentionally REMOVED.
// It was populated by a best-effort write-through that swallows per-command failures, so a
// single dropped ZINCRBY left the cache non-null-but-INCOMPLETE while the answer's durable
// Postgres row was still committed; the read then trusted any non-null cache over Postgres
// and corrupted ranks (and a 0-score answerer diverged between the two paths). The indexed
// groupBy is cheap at institute scale, so Postgres is the single source of truth here;
// Redis's role in this feature is real-time pub/sub fan-out (lib/realtime/broadcast.mjs),
// NOT the leaderboard read.
import prisma from "../prisma.mjs";
import { computeLeaderboard } from "./forms.mjs";

// [{ userId, score }] — the authoritative aggregate (one grouped sum over the indexed
// (session_id, user_id)); INCLUDES members who answered but scored 0 (their rows exist).
async function scoreRows(sessionId, client) {
  const grouped = await client.quizAnswer.groupBy({
    by: ["userId"],
    where: { sessionId },
    _sum: { pointsAwarded: true },
  });
  return grouped.map((g) => ({ userId: g.userId, score: g._sum.pointsAwarded ?? 0 }));
}

// The full leaderboard for a session, shaped for the host + the SSE publisher.
// Returns { top: [{ userId, name, score, rank }], players, me } where `players` is the
// number of SCORED members and `me` is the viewer's own entry (or a zero-score entry).
// PII: userId is included for the server/host + the isMe mapping; the SSE/public path
// strips it via publicLeaderboard (lib/quiz/forms.mjs).
export async function getLeaderboard(sessionId, { top = 20, meUserId = null, client = prisma } = {}) {
  if (!sessionId) return { top: [], players: 0, me: null };
  const ranked = computeLeaderboard(await scoreRows(sessionId, client)); // [{ userId, name:null, score, rank }]
  const topSlice = ranked.slice(0, Math.max(1, top));

  // Resolve display names only for the shown slice (+ the viewer) — bounded, no N+1.
  const meEntry = meUserId ? ranked.find((r) => r.userId === meUserId) ?? null : null;
  const need = new Set(topSlice.map((r) => r.userId));
  if (meUserId && meEntry) need.add(meUserId);
  const nameById = new Map();
  if (need.size) {
    const users = await client.user.findMany({ where: { id: { in: [...need] } }, select: { id: true, name: true } });
    for (const u of users) nameById.set(u.id, u.name ?? null);
  }
  const withNames = topSlice.map((r) => ({ userId: r.userId, name: nameById.get(r.userId) ?? null, score: r.score, rank: r.rank }));
  const me = meUserId
    ? meEntry
      ? { userId: meUserId, name: nameById.get(meUserId) ?? null, score: meEntry.score, rank: meEntry.rank }
      : { userId: meUserId, name: null, score: 0, rank: null } // answered nothing / not yet scored
    : null;
  return { top: withNames, players: ranked.length, me };
}
