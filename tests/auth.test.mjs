import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the prisma singleton and the password module before importing options.mjs.
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("../lib/prisma.mjs", () => {
  const client = { user: { findUnique, create: vi.fn() } };
  return { default: client, prisma: client };
});

vi.mock("../lib/auth/password.mjs", () => ({
  // "correct-password" verifies; anything else fails.
  verifyPassword: vi.fn(async (_hash, pw) => pw === "correct-password"),
  hashPassword: vi.fn(),
  MIN_PASSWORD_LENGTH: 8,
}));

const { authorizeCredentials } = await import("../lib/auth/options.mjs");

const ACTIVE = {
  id: "u1",
  email: "admin@iitjammu.ac.in",
  name: "Admin",
  image: null,
  passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$abc$def",
  status: "active",
};

beforeEach(() => findUnique.mockReset());

describe("authorizeCredentials (email/password login)", () => {
  it("returns the user for a valid active credential", async () => {
    findUnique.mockResolvedValue(ACTIVE);
    const u = await authorizeCredentials({ email: "admin@iitjammu.ac.in", password: "correct-password" });
    expect(u).toEqual({ id: "u1", email: "admin@iitjammu.ac.in", name: "Admin", image: null });
  });

  it("rejects a wrong password", async () => {
    findUnique.mockResolvedValue(ACTIVE);
    expect(await authorizeCredentials({ email: "admin@iitjammu.ac.in", password: "wrong" })).toBeNull();
  });

  it("rejects an unknown email", async () => {
    findUnique.mockResolvedValue(null);
    expect(await authorizeCredentials({ email: "nobody@x.com", password: "correct-password" })).toBeNull();
  });

  it("rejects OAuth-only accounts (no passwordHash)", async () => {
    findUnique.mockResolvedValue({ ...ACTIVE, passwordHash: null });
    expect(await authorizeCredentials({ email: "admin@iitjammu.ac.in", password: "correct-password" })).toBeNull();
  });

  it("rejects suspended / disabled accounts", async () => {
    for (const status of ["suspended", "disabled", "invited"]) {
      findUnique.mockResolvedValue({ ...ACTIVE, status });
      expect(await authorizeCredentials({ email: "admin@iitjammu.ac.in", password: "correct-password" })).toBeNull();
    }
  });

  it("rejects missing/empty credentials", async () => {
    expect(await authorizeCredentials(null)).toBeNull();
    expect(await authorizeCredentials({})).toBeNull();
    expect(await authorizeCredentials({ email: "admin@iitjammu.ac.in" })).toBeNull();
    expect(await authorizeCredentials({ password: "correct-password" })).toBeNull();
  });
});
