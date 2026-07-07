import { describe, it, expect } from "vitest";
import { chunk, remainingAllowance, mailProgress, normalizeRecipients, DEFAULT_RATE_PER_MINUTE } from "../lib/mail/progress.mjs";

// M8 (DL-073) — bulk-mail rate-limit + progress accounting (pure).

describe("mail progress helpers", () => {
  it("chunks recipients into rate-sized batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 10)).toEqual([]);
    expect(chunk([1, 2], 0)).toEqual([[1], [2]]); // bad size → 1
  });
  it("computes the remaining window allowance", () => {
    expect(remainingAllowance({ limit: 60, sentInWindow: 10 })).toBe(50);
    expect(remainingAllowance({ limit: 60, sentInWindow: 80 })).toBe(0);
    expect(remainingAllowance({})).toBe(DEFAULT_RATE_PER_MINUTE);
  });
  it("reports progress with an integer percent", () => {
    expect(mailProgress({ total: 10, sent: 3, failed: 2 })).toMatchObject({ total: 10, sent: 3, failed: 2, done: 5, remaining: 5, percent: 50 });
    expect(mailProgress({ total: 0 }).percent).toBe(0);
    expect(mailProgress({ total: 3, sent: 3 }).percent).toBe(100);
    // FLOOR, not round: 199/200 = 99.5% must read 99 (not 100) while one send pends (review fix)
    expect(mailProgress({ total: 200, sent: 199 }).percent).toBe(99);
  });
  it("normalizes + de-dupes recipients and splits invalid", () => {
    const { valid, invalid } = normalizeRecipients(["A@B.co", "a@b.co", "  c@d.co ", "nope", ""]);
    expect(valid).toEqual(["a@b.co", "c@d.co"]);
    expect(invalid).toEqual(["nope"]);
  });
});
