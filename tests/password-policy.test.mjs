import { describe, it, expect } from "vitest";
import { validatePasswordPolicy, passwordRequirements, PASSWORD_POLICY } from "../lib/auth/password-policy.mjs";
import { generatePassword } from "../lib/auth/password-generator.mjs";

describe("password policy (M0)", () => {
  it("accepts a compliant password", () => {
    const r = validatePasswordPolicy("Welcome#2026");
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("rejects too-short / missing-class passwords with specific errors", () => {
    expect(validatePasswordPolicy("short1A").ok).toBe(false); // < minLength
    expect(validatePasswordPolicy("alllowercase123").errors).toContain("Include an uppercase letter");
    expect(validatePasswordPolicy("ALLUPPERCASE123").errors).toContain("Include a lowercase letter");
    expect(validatePasswordPolicy("NoDigitsHereAtAll").errors).toContain("Include a digit");
  });

  it("rejects a single repeated character even if long", () => {
    expect(validatePasswordPolicy("aaaaaaaaaaaa").ok).toBe(false);
  });

  it("rejects a too-long password", () => {
    expect(validatePasswordPolicy("Aa1" + "x".repeat(PASSWORD_POLICY.maxLength)).ok).toBe(false);
  });

  it("is safe against non-string input", () => {
    expect(validatePasswordPolicy(null).ok).toBe(false);
    expect(validatePasswordPolicy(undefined).ok).toBe(false);
  });

  it("requirements checklist lists the rule", () => {
    const reqs = passwordRequirements();
    expect(reqs[0]).toMatch(/at least 10/i);
    expect(reqs).toContain("A digit");
  });
});

describe("password generator (M0)", () => {
  it("produces a policy-compliant password of the requested length", () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword({ length: 16 });
      expect(pw).toHaveLength(16);
      expect(validatePasswordPolicy(pw).ok).toBe(true);
    }
  });

  it("never goes below the policy minimum length", () => {
    const pw = generatePassword({ length: 4 });
    expect(pw.length).toBeGreaterThanOrEqual(PASSWORD_POLICY.minLength);
  });

  it("uses the injected RNG deterministically", () => {
    // a constant byte source still yields a compliant password (guaranteed classes)
    const constRng = (n) => Buffer.alloc(n, 7);
    const pw = generatePassword({ length: 12, randomFn: constRng });
    expect(pw).toHaveLength(12);
    expect(validatePasswordPolicy(pw).ok).toBe(true);
  });

  it("excludes visually ambiguous characters (0 O 1 l I)", () => {
    for (let i = 0; i < 30; i++) {
      expect(generatePassword({ length: 20 })).not.toMatch(/[0O1lI]/);
    }
  });
});
