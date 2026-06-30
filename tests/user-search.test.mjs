import { describe, it, expect } from "vitest";
import {
  matchesUserFilter,
  filterUsers,
  userFilterFacets,
  instituteEmailPrefix,
  normalizeLevel,
  userEmailIdentity,
} from "../lib/users/search.mjs";

// Shaped-user fixtures (the shape lib/users/admin.mjs#listUsers returns).
const u = (email, over = {}) => ({ email, name: over.name ?? "", status: over.status ?? "active", roles: over.roles ?? [] });

const USERS = [
  u("2023ume0243@iitjammu.ac.in", { roles: [{ key: "coordinator", name: "Coordinator" }] }),
  u("2023ucs0101@iitjammu.ac.in", { roles: [{ key: "normal_user", name: "Normal User" }] }),
  u("2021pme1001@iitjammu.ac.in", { status: "inactive", roles: [{ key: "staff", name: "Staff" }] }),
  u("2020rma0007@iitjammu.ac.in", { roles: [] }),
  u("warden.egret@iitjammu.ac.in", { name: "Warden", roles: [{ key: "admin", name: "Administrator" }] }),
];

describe("normalizeLevel", () => {
  it("accepts codes and full words", () => {
    expect(normalizeLevel("u")).toBe("ug");
    expect(normalizeLevel("p")).toBe("pg");
    expect(normalizeLevel("r")).toBe("research");
    expect(normalizeLevel("ug")).toBe("ug");
    expect(normalizeLevel("RESEARCH")).toBe("research");
  });
  it("rejects junk", () => {
    expect(normalizeLevel("x")).toBeNull();
    expect(normalizeLevel("")).toBeNull();
    expect(normalizeLevel(undefined)).toBeNull();
  });
});

describe("instituteEmailPrefix (DB coarse-narrowing prefix)", () => {
  it("needs a 4-digit year to anchor", () => {
    expect(instituteEmailPrefix({})).toBeNull();
    expect(instituteEmailPrefix({ level: "ug", branch: "me" })).toBeNull(); // no leading year
    expect(instituteEmailPrefix({ year: "20" })).toBeNull();
  });
  it("builds year[+level[+branch]] contiguously", () => {
    expect(instituteEmailPrefix({ year: 2023 })).toBe("2023");
    expect(instituteEmailPrefix({ year: 2023, level: "ug" })).toBe("2023u");
    expect(instituteEmailPrefix({ year: 2023, level: "u", branch: "me" })).toBe("2023ume");
    expect(instituteEmailPrefix({ year: 2023, level: "pg", branch: "CS" })).toBe("2023pcs");
  });
  it("drops branch when no level (branch isn't contiguous then)", () => {
    expect(instituteEmailPrefix({ year: 2023, branch: "me" })).toBe("2023");
  });
});

describe("matchesUserFilter", () => {
  it("no criteria matches everyone", () => {
    expect(USERS.every((x) => matchesUserFilter(x, {}))).toBe(true);
  });
  it("year filter excludes other years AND non-institute emails", () => {
    const got = filterUsers(USERS, { year: 2023 });
    expect(got.map((x) => x.email)).toEqual([
      "2023ume0243@iitjammu.ac.in",
      "2023ucs0101@iitjammu.ac.in",
    ]);
  });
  it("level filter (accepts code or word)", () => {
    expect(filterUsers(USERS, { level: "pg" }).map((x) => x.email)).toEqual(["2021pme1001@iitjammu.ac.in"]);
    expect(filterUsers(USERS, { level: "p" }).map((x) => x.email)).toEqual(["2021pme1001@iitjammu.ac.in"]);
    expect(filterUsers(USERS, { level: "research" }).map((x) => x.email)).toEqual(["2020rma0007@iitjammu.ac.in"]);
  });
  it("branch filter is case-insensitive", () => {
    expect(filterUsers(USERS, { branch: "ME" }).map((x) => x.email).sort()).toEqual([
      "2021pme1001@iitjammu.ac.in",
      "2023ume0243@iitjammu.ac.in",
    ]);
  });
  it("combined year+level+branch", () => {
    expect(filterUsers(USERS, { year: 2023, level: "ug", branch: "cs" }).map((x) => x.email)).toEqual([
      "2023ucs0101@iitjammu.ac.in",
    ]);
  });
  it("category matches a role key", () => {
    expect(filterUsers(USERS, { category: "staff" }).map((x) => x.email)).toEqual(["2021pme1001@iitjammu.ac.in"]);
    expect(filterUsers(USERS, { category: "admin" }).map((x) => x.email)).toEqual(["warden.egret@iitjammu.ac.in"]);
  });
  it("status filter", () => {
    expect(filterUsers(USERS, { status: "inactive" }).map((x) => x.email)).toEqual(["2021pme1001@iitjammu.ac.in"]);
  });
  it("free-text q matches email or name (case-insensitive)", () => {
    expect(filterUsers(USERS, { q: "WARDEN" }).map((x) => x.email)).toEqual(["warden.egret@iitjammu.ac.in"]);
    expect(filterUsers(USERS, { q: "ucs" }).map((x) => x.email)).toEqual(["2023ucs0101@iitjammu.ac.in"]);
  });
  it("q is PER-FIELD — it never matches across the email→name boundary (no server drift)", () => {
    // 'in warden' would span the email's trailing '.ac.in' and the name 'Warden' if
    // the fields were concatenated; per-field matching (like the DB where.OR) rejects it.
    expect(filterUsers(USERS, { q: "in warden" })).toEqual([]);
  });
  it("an invalid level matches nobody (no silent pass-through)", () => {
    expect(filterUsers(USERS, { level: "xx" })).toEqual([]);
  });
  it("criteria are AND-combined", () => {
    expect(filterUsers(USERS, { year: 2023, category: "coordinator" }).map((x) => x.email)).toEqual([
      "2023ume0243@iitjammu.ac.in",
    ]);
    expect(filterUsers(USERS, { year: 2023, category: "staff" })).toEqual([]); // staff is a 2021 user
  });
});

describe("userFilterFacets + userEmailIdentity", () => {
  it("collects distinct years (desc), levels, branches, categories", () => {
    const f = userFilterFacets(USERS);
    expect(f.years).toEqual([2023, 2021, 2020]);
    expect(f.levels.sort()).toEqual(["pg", "research", "ug"]);
    expect(f.branches).toEqual(["cs", "ma", "me"]);
    expect(f.categories).toEqual(["admin", "coordinator", "normal_user", "staff"]);
  });
  it("identity is null for non-institute student emails", () => {
    expect(userEmailIdentity({ email: "warden.egret@iitjammu.ac.in" })).toBeNull();
    expect(userEmailIdentity({ email: "2023ume0243@iitjammu.ac.in" })).toMatchObject({ year: 2023, level: "ug", branch: "me" });
  });
});
