// Static unit tests for the PURE live-quiz layer (Session 16, DL-104..106): question
// normalization/validation, SERVER-authoritative scoring, session transitions, and the
// leaderboard compute. No DB — these are the mirrored client+server rules (DL-051).
import { describe, it, expect } from "vitest";
import {
  normalizeQuestion,
  normalizeQuestionPatch,
  isSelectionCorrect,
  scoreAnswer,
  canTransition,
  computeLeaderboard,
  publicLeaderboard,
  QUIZ_SESSION_STATES,
  DEFAULT_POINTS,
  MAX_TIME_LIMIT,
  ANSWER_GRACE_MS,
} from "../lib/quiz/forms.mjs";

describe("normalizeQuestion", () => {
  it("normalizes prompt + assigns letter ids + resolves correct by id", () => {
    const q = normalizeQuestion({ prompt: "  2+2?  ", options: ["3", "4", "5"], correctOptionIds: ["b"] });
    expect(q.prompt).toBe("2+2?");
    expect(q.options).toEqual([{ id: "a", text: "3" }, { id: "b", text: "4" }, { id: "c", text: "5" }]);
    expect(q.correctOptionIds).toEqual(["b"]);
    expect(q.points).toBe(DEFAULT_POINTS);
    expect(q.timeLimitSeconds).toBe(20);
  });

  it("accepts {id,text} options and a numeric-index correct answer", () => {
    const q = normalizeQuestion({ prompt: "Pick", options: [{ id: "x", text: "one" }, { id: "y", text: "two" }], correct: 1 });
    expect(q.correctOptionIds).toEqual(["y"]);
  });

  it("supports multi-select correct answers", () => {
    const q = normalizeQuestion({ prompt: "All evens", options: ["1", "2", "4"], correctOptionIds: ["b", "c"] });
    expect(q.correctOptionIds.sort()).toEqual(["b", "c"]);
  });

  it("drops blank options and requires at least two", () => {
    expect(() => normalizeQuestion({ prompt: "q", options: ["only", "", "  "], correctOptionIds: ["a"] })).toThrow(/at least 2/i);
  });

  it("rejects a correct answer that is not an option", () => {
    expect(() => normalizeQuestion({ prompt: "q", options: ["a", "b"], correctOptionIds: ["z"] })).toThrow(/not one of the options/i);
  });

  it("requires at least one correct answer", () => {
    expect(() => normalizeQuestion({ prompt: "q", options: ["a", "b"], correctOptionIds: [] })).toThrow(/at least one correct/i);
  });

  it("rejects a blank prompt and duplicate option ids", () => {
    expect(() => normalizeQuestion({ prompt: "   ", options: ["a", "b"], correctOptionIds: ["a"] })).toThrow(/prompt is required/i);
    expect(() => normalizeQuestion({ prompt: "q", options: [{ id: "a", text: "x" }, { id: "a", text: "y" }], correctOptionIds: ["a"] })).toThrow(/duplicate/i);
  });

  it("clamps points and time limit into bounds", () => {
    const q = normalizeQuestion({ prompt: "q", options: ["a", "b"], correctOptionIds: ["a"], points: -5, timeLimitSeconds: 999999 });
    expect(q.points).toBe(0);
    expect(q.timeLimitSeconds).toBe(MAX_TIME_LIMIT);
  });
});

describe("normalizeQuestionPatch", () => {
  it("returns only provided fields and keeps options↔correct consistent", () => {
    const p = normalizeQuestionPatch({ points: 500, options: ["a", "b", "c"], correctOptionIds: ["c"] });
    expect(p.points).toBe(500);
    expect(p.correctOptionIds).toEqual(["c"]);
    expect(p.prompt).toBeUndefined();
  });
  it("throws when no editable fields are supplied", () => {
    expect(() => normalizeQuestionPatch({})).toThrow(/no editable fields/i);
  });
  it("rejects a blank prompt on edit", () => {
    expect(() => normalizeQuestionPatch({ prompt: "  " })).toThrow(/cannot be blank/i);
  });
});

describe("isSelectionCorrect", () => {
  it("matches a single correct answer exactly", () => {
    expect(isSelectionCorrect(["b"], ["b"])).toBe(true);
    expect(isSelectionCorrect(["b"], ["a"])).toBe(false);
    expect(isSelectionCorrect(["b"], [])).toBe(false);
  });
  it("requires ALL and ONLY the correct ids for multi-select", () => {
    expect(isSelectionCorrect(["a", "c"], ["c", "a"])).toBe(true); // order-independent
    expect(isSelectionCorrect(["a", "c"], ["a"])).toBe(false); // missing one
    expect(isSelectionCorrect(["a", "c"], ["a", "b", "c"])).toBe(false); // extra wrong
  });
  it("is case-insensitive on option ids", () => {
    expect(isSelectionCorrect(["B"], ["b"])).toBe(true);
  });
});

describe("scoreAnswer (server-authoritative)", () => {
  const q = { correctOptionIds: ["b"], points: 1000, timeLimitSeconds: 20 };

  it("awards full-ish points for an instant correct answer", () => {
    const r = scoreAnswer(q, ["b"], 0);
    expect(r.isCorrect).toBe(true);
    expect(r.pointsAwarded).toBe(1000); // flat 500 + full speed 500
    expect(r.withinWindow).toBe(true);
  });

  it("awards the flat half at the deadline (no speed bonus)", () => {
    const r = scoreAnswer(q, ["b"], 20000);
    expect(r.pointsAwarded).toBe(500);
  });

  it("gives more points to a faster correct answer (monotonic)", () => {
    const fast = scoreAnswer(q, ["b"], 2000).pointsAwarded;
    const slow = scoreAnswer(q, ["b"], 15000).pointsAwarded;
    expect(fast).toBeGreaterThan(slow);
    expect(slow).toBeGreaterThanOrEqual(500);
  });

  it("scores 0 for a wrong answer even if instant", () => {
    expect(scoreAnswer(q, ["a"], 0)).toMatchObject({ isCorrect: false, pointsAwarded: 0 });
  });

  it("scores 0 and reports the window closed past the limit + grace", () => {
    const late = scoreAnswer(q, ["b"], 20000 + ANSWER_GRACE_MS + 500);
    expect(late.withinWindow).toBe(false);
    expect(late.pointsAwarded).toBe(0);
  });

  it("still accepts an answer inside the grace window", () => {
    const grace = scoreAnswer(q, ["b"], 20000 + ANSWER_GRACE_MS - 100);
    expect(grace.withinWindow).toBe(true);
    expect(grace.isCorrect).toBe(true);
  });

  it("scores an empty selection as 0", () => {
    expect(scoreAnswer(q, [], 0).pointsAwarded).toBe(0);
  });
});

describe("canTransition", () => {
  it("allows the legal state machine and blocks illegal jumps", () => {
    expect(canTransition("pending", "active")).toBe(true);
    expect(canTransition("active", "reveal")).toBe(true);
    expect(canTransition("reveal", "active")).toBe(true);
    expect(canTransition("pending", "reveal")).toBe(false); // can't reveal before a question
    expect(canTransition("ended", "active")).toBe(false); // terminal
    expect(canTransition("active", "active")).toBe(false);
  });
  it("exposes the four canonical states", () => {
    expect(QUIZ_SESSION_STATES).toEqual(["pending", "active", "reveal", "ended"]);
  });
});

describe("computeLeaderboard + publicLeaderboard", () => {
  it("ranks by score desc with standard competition rank + stable tiebreak", () => {
    const lb = computeLeaderboard([
      { userId: "u1", name: "A", score: 100 },
      { userId: "u2", name: "B", score: 300 },
      { userId: "u3", name: "C", score: 300 },
    ]);
    expect(lb.map((e) => e.rank)).toEqual([1, 1, 3]); // two tied at 300 → both rank 1, next rank 3
    expect(lb[0].score).toBe(300);
  });

  it("strips the internal userId and flags the viewer for the client", () => {
    const lb = computeLeaderboard([{ userId: "u1", name: "A", score: 10 }, { userId: "u2", name: "B", score: 5 }]);
    const pub = publicLeaderboard(lb, { meUserId: "u2" });
    expect(pub[0]).toEqual({ name: "A", score: 10, rank: 1, isMe: false });
    expect(pub[1]).toEqual({ name: "B", score: 5, rank: 2, isMe: true });
    expect(pub[0]).not.toHaveProperty("userId");
  });
});
