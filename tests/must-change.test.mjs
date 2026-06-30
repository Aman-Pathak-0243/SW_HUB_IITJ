import { describe, it, expect } from "vitest";
import { shouldForcePasswordChange, isPasswordChangeExempt, PASSWORD_CHANGE_PATH } from "../lib/auth/must-change.mjs";

describe("forced first-login password change (M0 middleware decision)", () => {
  it("never redirects when the flag is off", () => {
    expect(shouldForcePasswordChange({ mustChange: false, pathname: "/admin" })).toBe(false);
    expect(shouldForcePasswordChange({ mustChange: undefined, pathname: "/anything" })).toBe(false);
  });

  it("redirects a must-change user away from a normal page", () => {
    expect(shouldForcePasswordChange({ mustChange: true, pathname: "/admin" })).toBe(true);
    expect(shouldForcePasswordChange({ mustChange: true, pathname: "/" })).toBe(true);
    expect(shouldForcePasswordChange({ mustChange: true, pathname: "/events" })).toBe(true);
  });

  it("exempts the change page, its API, auth endpoints, and assets (no redirect loop)", () => {
    for (const p of [
      PASSWORD_CHANGE_PATH,
      "/api/account/password",
      "/api/auth/session",
      "/api/auth/signout",
      "/_next/static/chunk.js",
      "/favicon.ico",
    ]) {
      expect(isPasswordChangeExempt(p)).toBe(true);
      expect(shouldForcePasswordChange({ mustChange: true, pathname: p })).toBe(false);
    }
  });

  it("does not exempt a lookalike path", () => {
    expect(isPasswordChangeExempt("/account/passwordless")).toBe(true); // prefix match is acceptable (under /account/password*)
    expect(isPasswordChangeExempt("/admin/account/password")).toBe(false);
  });
});
