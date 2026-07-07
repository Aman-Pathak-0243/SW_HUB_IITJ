// PURE, client-safe validators / normalizers / scoring for the LIVE-QUIZ subsystem
// (Session 16, DL-104..106). Mirrored on the client and the server (DL-051): the quiz
// authoring service (lib/quiz/questions.mjs) calls normalizeQuestion() before storage;
// the answer write path (lib/quiz/answers.mjs) calls scoreAnswer() with the SERVER-
// measured elapsed time; the client host/player forms import the same helpers — so the
// rules never drift. No DB / server-only imports here.
//
// SCORING is SERVER-AUTHORITATIVE (DL-106): the caller supplies the elapsed time the
// SERVER measured (now − quiz_session.question_started_at), never a client claim. A
// correct answer earns the question's base points plus a linear speed bonus for the
// time remaining; a wrong / late / empty answer earns 0.
import { CmsValidationError } from "../cms/errors.mjs";
import { rankEntries } from "../events/forms.mjs";

export const QUIZ_SESSION_STATES = ["pending", "active", "reveal", "ended"];
export const QUIZ_SESSION_STATE_SET = new Set(QUIZ_SESSION_STATES);

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;
export const DEFAULT_POINTS = 1000;
export const MAX_POINTS = 100000;
export const DEFAULT_TIME_LIMIT = 20; // seconds
export const MAX_TIME_LIMIT = 3600; // seconds (matches the DB CHECK)
export const MAX_PROMPT = 2000;
export const MAX_OPTION_TEXT = 500;
// A late answer received within this grace window past the deadline is still accepted
// (clock skew / network jitter); its points are still computed against the true limit,
// so a grace-window answer scores ~0 speed bonus. Kept small + server-side only.
export const ANSWER_GRACE_MS = 1500;
// Fraction of a question's base points reserved for the SPEED bonus (the rest is the
// flat correctness award). 0.5 ⇒ half the points for being right, half for being fast.
export const SPEED_BONUS_FRACTION = 0.5;

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

function trimStr(v, max) {
  if (v === undefined || v === null) return "";
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function toIntOr(v, fallback) {
  if (v === undefined || v === null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

// ── question authoring ───────────────────────────────────────────────────────
// Normalize + validate a question for storage. Accepts options as an array of strings
// OR of { id?, text } objects; assigns stable letter ids (a, b, c, …) when none given.
// `correct` may be a single id/index or an array of them. Returns the canonical shape
// { prompt, options:[{id,text}], correctOptionIds:[…], points, timeLimitSeconds, sortOrder }.
// Throws CmsValidationError (422-shaped) on any invalid input.
export function normalizeQuestion(input = {}) {
  const prompt = trimStr(input.prompt, MAX_PROMPT);
  if (!prompt) throw new CmsValidationError("A question prompt is required.", { status: 422, code: "QUIZ_INVALID" });

  const rawOptions = Array.isArray(input.options) ? input.options : [];
  const options = [];
  const seenIds = new Set();
  rawOptions.forEach((opt, i) => {
    const text = trimStr(typeof opt === "string" ? opt : opt?.text, MAX_OPTION_TEXT);
    if (!text) return; // drop blank options
    let id = trimStr(typeof opt === "object" && opt ? opt.id : "", 40).toLowerCase();
    if (!id) id = LETTERS[i] ?? `o${i}`;
    if (seenIds.has(id)) throw new CmsValidationError(`Duplicate option id '${id}'.`, { status: 422, code: "QUIZ_INVALID" });
    seenIds.add(id);
    options.push({ id, text });
  });
  if (options.length < MIN_OPTIONS) throw new CmsValidationError(`A question needs at least ${MIN_OPTIONS} options.`, { status: 422, code: "QUIZ_INVALID" });
  if (options.length > MAX_OPTIONS) throw new CmsValidationError(`A question allows at most ${MAX_OPTIONS} options.`, { status: 422, code: "QUIZ_INVALID" });

  // Resolve correct answer(s): accept an array or a single value; a value may be an
  // option id (string) or a 0-based index (number) into the normalized option list.
  const rawCorrect = input.correctOptionIds ?? input.correct ?? input.correctOptionId;
  const correctList = Array.isArray(rawCorrect) ? rawCorrect : rawCorrect === undefined || rawCorrect === null ? [] : [rawCorrect];
  const optionIds = new Set(options.map((o) => o.id));
  const correctOptionIds = [];
  for (const c of correctList) {
    let id = null;
    if (typeof c === "number" && Number.isInteger(c) && options[c]) id = options[c].id;
    else id = trimStr(c, 40).toLowerCase();
    if (!id || !optionIds.has(id)) throw new CmsValidationError(`Correct answer '${c}' is not one of the options.`, { status: 422, code: "QUIZ_INVALID" });
    if (!correctOptionIds.includes(id)) correctOptionIds.push(id);
  }
  if (!correctOptionIds.length) throw new CmsValidationError("Mark at least one correct answer.", { status: 422, code: "QUIZ_INVALID" });

  let points = toIntOr(input.points, DEFAULT_POINTS);
  if (points < 0) points = 0;
  if (points > MAX_POINTS) points = MAX_POINTS;

  let timeLimitSeconds = toIntOr(input.timeLimitSeconds, DEFAULT_TIME_LIMIT);
  if (timeLimitSeconds < 1) timeLimitSeconds = 1;
  if (timeLimitSeconds > MAX_TIME_LIMIT) timeLimitSeconds = MAX_TIME_LIMIT;

  const out = { prompt, options, correctOptionIds, points, timeLimitSeconds };
  if (input.sortOrder !== undefined) out.sortOrder = toIntOr(input.sortOrder, 0);
  return out;
}

// A partial patch for an EDIT — only the provided keys are validated + returned, so an
// omitted key leaves the stored value unchanged. Options/correct are validated together
// (correctness must reference the options) whenever EITHER is supplied.
export function normalizeQuestionPatch(input = {}) {
  const patch = {};
  if (input.prompt !== undefined) {
    const prompt = trimStr(input.prompt, MAX_PROMPT);
    if (!prompt) throw new CmsValidationError("A question prompt cannot be blank.", { status: 422, code: "QUIZ_INVALID" });
    patch.prompt = prompt;
  }
  if (input.options !== undefined || input.correctOptionIds !== undefined || input.correct !== undefined) {
    // Re-run the full normalizer over a synthesized whole so options ↔ correctness stay consistent.
    const full = normalizeQuestion({
      prompt: input.prompt ?? "•", // placeholder; prompt handled above, not returned here
      options: input.options,
      correctOptionIds: input.correctOptionIds ?? input.correct,
    });
    patch.options = full.options;
    patch.correctOptionIds = full.correctOptionIds;
  }
  if (input.points !== undefined) {
    let points = toIntOr(input.points, DEFAULT_POINTS);
    patch.points = Math.min(Math.max(points, 0), MAX_POINTS);
  }
  if (input.timeLimitSeconds !== undefined) {
    let t = toIntOr(input.timeLimitSeconds, DEFAULT_TIME_LIMIT);
    patch.timeLimitSeconds = Math.min(Math.max(t, 1), MAX_TIME_LIMIT);
  }
  if (input.sortOrder !== undefined) patch.sortOrder = toIntOr(input.sortOrder, 0);
  if (Object.keys(patch).length === 0) throw new CmsValidationError("No editable fields supplied.", { status: 422, code: "QUIZ_INVALID" });
  return patch;
}

// ── answer scoring (SERVER-AUTHORITATIVE, DL-106) ──────────────────────────────
// True when a selection exactly matches the question's correct set (order-independent).
// Multi-select requires ALL correct and NO incorrect ids; single-select is the 1-of-1 case.
export function isSelectionCorrect(correctOptionIds = [], selectedOptionIds = []) {
  const correct = new Set((correctOptionIds ?? []).map((s) => String(s).toLowerCase()));
  const selected = new Set((selectedOptionIds ?? []).map((s) => String(s).toLowerCase()));
  if (correct.size === 0 || selected.size !== correct.size) return false;
  for (const id of selected) if (!correct.has(id)) return false;
  return true;
}

// Score one answer. `question` is { correctOptionIds, points, timeLimitSeconds }.
// `elapsedMs` is the SERVER-measured time since the question opened (never client-claimed).
// Returns { isCorrect, pointsAwarded, withinWindow }. A late (past limit + grace) or
// empty/incorrect answer scores 0; a correct answer earns the flat correctness share
// plus a linear speed bonus for the remaining time. Rounds to an integer.
export function scoreAnswer(question = {}, selectedOptionIds = [], elapsedMs = 0) {
  const timeLimitMs = Math.max(1, Number(question.timeLimitSeconds ?? DEFAULT_TIME_LIMIT) * 1000);
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const withinWindow = elapsed <= timeLimitMs + ANSWER_GRACE_MS;
  const correct = isSelectionCorrect(question.correctOptionIds, selectedOptionIds);
  if (!withinWindow || !correct) return { isCorrect: correct, pointsAwarded: 0, withinWindow };
  const base = Math.max(0, Number(question.points ?? DEFAULT_POINTS) || 0);
  const flat = base * (1 - SPEED_BONUS_FRACTION);
  const remainingFraction = Math.max(0, Math.min(1, 1 - elapsed / timeLimitMs));
  const speed = base * SPEED_BONUS_FRACTION * remainingFraction;
  return { isCorrect: true, pointsAwarded: Math.round(flat + speed), withinWindow };
}

// ── session state transitions (pure guard) ────────────────────────────────────
// The legal next states from each state — the service enforces these before writing so
// the state machine can't be driven backwards or skipped. `next` = advance to the next
// question (from pending or reveal → active); `reveal` closes the current question.
export const QUIZ_TRANSITIONS = {
  pending: ["active", "ended"],
  active: ["reveal", "ended"],
  reveal: ["active", "ended"],
  ended: [],
};
export function canTransition(from, to) {
  return QUIZ_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── leaderboard compute (PURE) ─────────────────────────────────────────────────
// Given [{ userId, name, score }] rows, return them ranked (standard competition rank,
// stable tiebreak) via the shared rankEntries — the SAME semantics as the event
// leaderboards (DL-087). Used by the Postgres fallback path and to shape the Redis path.
export function computeLeaderboard(rows = []) {
  return rankEntries((rows ?? []).map((r) => ({ userId: r.userId, name: r.name ?? null, points: Number(r.score ?? r.points ?? 0) })))
    .map((r) => ({ userId: r.userId, name: r.name ?? null, score: r.points, rank: r.rank }));
}

// Strip the internal user id from a leaderboard for public/client display (PII parity,
// DL-082): name + score + rank only. Pass keepIdFor to retain ONE viewer's id (so the
// client can highlight "you") — but callers should map to a boolean flag instead.
export function publicLeaderboard(entries = [], { meUserId = null } = {}) {
  return (entries ?? []).map((e) => ({
    name: e.name ?? null,
    score: e.score ?? e.points ?? 0,
    rank: e.rank,
    isMe: meUserId != null && e.userId === meUserId,
  }));
}
