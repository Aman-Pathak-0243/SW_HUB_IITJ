import { describe, it, expect } from "vitest";
import { normalizeEmail, parseInstituteEmail } from "../lib/auth/email.mjs";

describe("normalizeEmail", () => {
  it("trims + accepts valid emails", () => {
    expect(normalizeEmail("  Foo@bar.com ")).toBe("Foo@bar.com");
  });
  it("rejects malformed emails", () => {
    for (const bad of ["", "no-at", "a@b", "a@@b.com", "a b@c.com", null, undefined]) {
      expect(normalizeEmail(bad)).toBeNull();
    }
  });
});

describe("parseInstituteEmail (M2 smart-search seed)", () => {
  it("parses a standard student email", () => {
    expect(parseInstituteEmail("2023ume0243@iitjammu.ac.in")).toEqual({
      email: "2023ume0243@iitjammu.ac.in",
      year: 2023,
      level: "ug",
      levelCode: "u",
      branch: "me",
      serial: "0243",
    });
  });
  it("maps level codes u/p/r", () => {
    expect(parseInstituteEmail("2021pcs1001@iitjammu.ac.in").level).toBe("pg");
    expect(parseInstituteEmail("2020rma0007@iitjammu.ac.in").level).toBe("research");
  });
  it("is case-insensitive on the local part", () => {
    expect(parseInstituteEmail("2023UME0243@iitjammu.ac.in")?.branch).toBe("me");
  });
  it("returns null for non-institute hosts or non-matching local parts", () => {
    expect(parseInstituteEmail("2023ume0243@gmail.com")).toBeNull();
    expect(parseInstituteEmail("warden.egret@iitjammu.ac.in")).toBeNull();
    expect(parseInstituteEmail("admin@iitjammu.ac.in")).toBeNull();
  });
});
