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

const { authorizeCredentials, authOptions } = await import("../lib/auth/options.mjs");

const ACTIVE = {
  id: "u1",
  email: "admin@iitjammu.ac.in",
  name: "Admin",
  image: null,
  passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$abc$def",
  status: "active",
  mustChangePassword: false,
};

beforeEach(() => findUnique.mockReset());

describe("authorizeCredentials (email/password login)", () => {
  it("returns the user (incl. mustChangePassword) for a valid active credential", async () => {
    findUnique.mockResolvedValue(ACTIVE);
    const u = await authorizeCredentials({ email: "admin@iitjammu.ac.in", password: "correct-password" });
    expect(u).toEqual({ id: "u1", email: "admin@iitjammu.ac.in", name: "Admin", image: null, mustChangePassword: false });
  });

  it("surfaces mustChangePassword=true so the JWT/middleware can force a change", async () => {
    findUnique.mockResolvedValue({ ...ACTIVE, mustChangePassword: true });
    const u = await authorizeCredentials({ email: "admin@iitjammu.ac.in", password: "correct-password" });
    expect(u.mustChangePassword).toBe(true);
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

  it("rejects REVOKED accounts but ADMITS inactive ones (M1, DL-065)", async () => {
    // revoked cannot log in at all
    findUnique.mockResolvedValue({ ...ACTIVE, status: "revoked" });
    expect(await authorizeCredentials({ email: "admin@iitjammu.ac.in", password: "correct-password" })).toBeNull();
    // inactive CAN log in (it browses as a member; it just can't participate in events)
    findUnique.mockResolvedValue({ ...ACTIVE, status: "inactive" });
    const u = await authorizeCredentials({ email: "admin@iitjammu.ac.in", password: "correct-password" });
    expect(u).toMatchObject({ id: "u1", email: "admin@iitjammu.ac.in" });
  });

  it("rejects missing/empty credentials", async () => {
    expect(await authorizeCredentials(null)).toBeNull();
    expect(await authorizeCredentials({})).toBeNull();
    expect(await authorizeCredentials({ email: "admin@iitjammu.ac.in" })).toBeNull();
    expect(await authorizeCredentials({ password: "correct-password" })).toBeNull();
  });
});

// The signIn callback is the SECOND documented revoked-enforcement point (M1, DL-065)
// — it also covers a previously-linked account. For a non-Google provider it skips the
// plugin check and gates purely on live account status.
describe("signIn callback (account-status boundary)", () => {
  const signIn = () =>
    authOptions.callbacks.signIn({ user: { id: "u1" }, account: { provider: "credentials" } });

  it("rejects revoked, admits active & inactive", async () => {
    findUnique.mockResolvedValue({ status: "revoked" });
    expect(await signIn()).toBe(false);
    findUnique.mockResolvedValue({ status: "inactive" });
    expect(await signIn()).toBe(true);
    findUnique.mockResolvedValue({ status: "active" });
    expect(await signIn()).toBe(true);
  });
});
