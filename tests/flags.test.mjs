import { describe, it, expect, beforeEach, vi } from "vitest";
import { isFeatureEnabled, clearFlagCache, shapeFlag, MEMBER_PLATFORM_FLAG, PLUGIN_DEFS } from "../lib/platform/flags.mjs";

beforeEach(() => clearFlagCache());

describe("feature flags / plugin gating (M0)", () => {
  it("the member_platform plugin is in the seed catalog", () => {
    expect(PLUGIN_DEFS.some((p) => p.key === MEMBER_PLATFORM_FLAG)).toBe(true);
  });

  it("reads the enabled state from the injected client", async () => {
    const client = { featureFlag: { findUnique: vi.fn().mockResolvedValue({ enabled: true }) } };
    expect(await isFeatureEnabled("k1", { client, useCache: false, now: 1000 })).toBe(true);
  });

  it("caches within the TTL (does not re-query)", async () => {
    const findUnique = vi.fn().mockResolvedValue({ enabled: true });
    const client = { featureFlag: { findUnique } };
    await isFeatureEnabled("k2", { client, now: 1000 });
    await isFeatureEnabled("k2", { client, now: 1005 }); // within 10s
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it("re-queries after the TTL expires", async () => {
    const findUnique = vi.fn().mockResolvedValue({ enabled: true });
    const client = { featureFlag: { findUnique } };
    await isFeatureEnabled("k3", { client, now: 1000 });
    await isFeatureEnabled("k3", { client, now: 1000 + 11_000 }); // past 10s TTL
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("fails CLOSED (false) on a missing row", async () => {
    const client = { featureFlag: { findUnique: vi.fn().mockResolvedValue(null) } };
    expect(await isFeatureEnabled("k4", { client, useCache: false, now: 1 })).toBe(false);
  });

  it("fails CLOSED (false) when the DB read throws — never accidental activation", async () => {
    const client = { featureFlag: { findUnique: vi.fn().mockRejectedValue(new Error("neon down")) } };
    expect(await isFeatureEnabled("k5", { client, useCache: false, now: 1 })).toBe(false);
  });

  it("returns onError on a DB error (allow/deny callers fail toward deny) and does NOT cache it", async () => {
    const findUnique = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce({ enabled: true });
    const client = { featureFlag: { findUnique } };
    // error → onError:true returned (e.g. the Google-reject auth check)
    expect(await isFeatureEnabled("k6", { client, useCache: false, now: 1, onError: true })).toBe(true);
    // the error result was NOT cached, so the next call re-reads and gets the real value
    expect(await isFeatureEnabled("k6", { client, now: 2 })).toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it("shapeFlag exposes the display fields", () => {
    const s = shapeFlag({ key: "x", name: "X", description: "d", enabled: true, category: "plugin", updatedAt: new Date("2026-06-30T00:00:00Z"), updatedBy: { email: "dev@iitjammu.ac.in" } });
    expect(s).toMatchObject({ key: "x", enabled: true, updatedByEmail: "dev@iitjammu.ac.in" });
    expect(s.updatedAt).toBe("2026-06-30T00:00:00.000Z");
  });
});
