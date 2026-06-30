import { describe, it, expect } from "vitest";
import { parseUserCsv } from "../lib/users/admin.mjs";

describe("bulk-account CSV parsing (M0)", () => {
  it("parses email,password[,name] and skips an optional header row", () => {
    const csv = [
      "email,password,name",
      "2023ume0243@iitjammu.ac.in,Welcome#2026,Asha Rao",
      "2022bme0111@iitjammu.ac.in,Change#Me99",
    ].join("\n");
    const { rows, errors } = parseUserCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ email: "2023ume0243@iitjammu.ac.in", password: "Welcome#2026", name: "Asha Rao" });
    expect(rows[1].name).toBeUndefined();
  });

  it("rejects invalid emails and policy-failing passwords with the line number", () => {
    const csv = ["nope-no-at,Welcome#2026", "ok@iitjammu.ac.in,weak"].join("\n");
    const { rows, errors } = parseUserCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ line: 1, reason: expect.stringMatching(/Invalid email/) });
    expect(errors[1]).toMatchObject({ line: 2, reason: expect.stringMatching(/Password/) });
  });

  it("flags an in-file duplicate email (idempotency at parse time)", () => {
    const csv = ["dup@iitjammu.ac.in,Welcome#2026", "dup@iitjammu.ac.in,Another#2026"].join("\n");
    const { rows, errors } = parseUserCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toMatch(/Duplicate/);
  });

  it("ignores blank lines and trims whitespace", () => {
    const csv = "  \n a@iitjammu.ac.in , Welcome#2026 \n\n";
    const { rows, errors } = parseUserCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([{ email: "a@iitjammu.ac.in", password: "Welcome#2026" }]);
  });
});
