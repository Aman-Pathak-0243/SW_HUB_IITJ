import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "../lib/auth/password.mjs";

describe("password hashing (argon2id)", () => {
  it("produces an argon2id-encoded hash that is not the plaintext", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain("correct horse battery");
  });

  it("verifies the correct password", async () => {
    const hash = await hashPassword("S3cretPassw0rd!");
    expect(await verifyPassword(hash, "S3cretPassw0rd!")).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("S3cretPassw0rd!");
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });

  it("salts: two hashes of the same password differ", async () => {
    const a = await hashPassword("same-password-123");
    const b = await hashPassword("same-password-123");
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "same-password-123")).toBe(true);
    expect(await verifyPassword(b, "same-password-123")).toBe(true);
  });

  it("rejects passwords shorter than the minimum", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
  });

  it("verify is safe against null/empty inputs", async () => {
    expect(await verifyPassword(null, "x")).toBe(false);
    expect(await verifyPassword("$argon2id$invalid", "x")).toBe(false);
    expect(await verifyPassword(await hashPassword("abcdefgh"), "")).toBe(false);
  });
});
