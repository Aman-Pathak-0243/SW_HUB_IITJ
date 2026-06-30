import { describe, it, expect } from "vitest";
import { validateFeedbackForm, FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from "../lib/feedback/forms.mjs";
import { shapeFeedback, encodeFeedbackCursor, decodeFeedbackCursor } from "../lib/feedback/service.mjs";

// M7 (DL-070) — feedback validator, shape, and keyset cursor (pure helpers).

describe("validateFeedbackForm", () => {
  it("accepts a complete submission", () => {
    const v = validateFeedbackForm({ category: "bug", subject: "X", body: "Y happened", component: "/events", email: "a@b.co" });
    expect(v.ok).toBe(true);
    expect(v.value).toMatchObject({ category: "bug", subject: "X", body: "Y happened", component: "/events", email: "a@b.co" });
  });
  it("requires category/subject/body", () => {
    const v = validateFeedbackForm({});
    expect(v.ok).toBe(false);
    expect(v.errors).toHaveProperty("category");
    expect(v.errors).toHaveProperty("subject");
    expect(v.errors).toHaveProperty("body");
  });
  it("rejects an unknown category and a bad email", () => {
    expect(validateFeedbackForm({ category: "spam", subject: "s", body: "b" }).errors.category).toBeTruthy();
    expect(validateFeedbackForm({ category: "bug", subject: "s", body: "b", email: "nope" }).errors.email).toBeTruthy();
  });
  it("enforces length caps", () => {
    expect(validateFeedbackForm({ category: "bug", subject: "x".repeat(201), body: "b" }).errors.subject).toBeTruthy();
    expect(validateFeedbackForm({ category: "bug", subject: "s", body: "x".repeat(5001) }).errors.body).toBeTruthy();
  });
  it("exposes the vocabularies", () => {
    expect(FEEDBACK_CATEGORIES).toEqual(["bug", "issue", "query", "suggestion"]);
    expect(FEEDBACK_STATUSES).toContain("in_progress");
  });
});

describe("shapeFeedback / cursor", () => {
  it("shapes a row JSON-safely (dates → ISO, emails via relations)", () => {
    const row = {
      id: "f1", referenceId: "FB-00001", category: "bug", status: "open", subject: "S", body: "B",
      component: null, submitterEmail: null, submitter: { email: "u@x.co" }, submitterUserId: "u1",
      assignedTo: { email: "staff@x.co" }, assignedToUserId: "s1", assignedAt: new Date("2026-06-30T00:00:00Z"),
      resolvedBy: null, resolvedByUserId: null, resolvedAt: null, resolutionNote: null,
      createdAt: new Date("2026-06-30T01:00:00Z"),
    };
    const s = shapeFeedback(row);
    expect(s).toMatchObject({ referenceId: "FB-00001", submitterEmail: "u@x.co", assignedToEmail: "staff@x.co" });
    expect(s.assignedAt).toBe("2026-06-30T00:00:00.000Z");
    expect(s.createdAt).toBe("2026-06-30T01:00:00.000Z");
  });
  it("round-trips the keyset cursor", () => {
    const row = { id: "abc-123", createdAt: new Date("2026-06-30T12:00:00Z") };
    const dec = decodeFeedbackCursor(encodeFeedbackCursor(row));
    expect(dec.id).toBe("abc-123");
    expect(dec.createdAt.toISOString()).toBe("2026-06-30T12:00:00.000Z");
  });
  it("rejects a malformed cursor", () => {
    expect(() => decodeFeedbackCursor(Buffer.from("garbage", "utf8").toString("base64url"))).toThrow();
  });
});
