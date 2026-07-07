import { describe, it, expect } from "vitest";
import { groupByWindow } from "../lib/events/public.mjs";
import { encodeNotificationCursor, decodeNotificationCursor } from "../lib/notifications/service.mjs";

// M7 (DL-074) — the reusable past/current/upcoming windowing primitive + the
// notification keyset cursor (pure).

describe("groupByWindow", () => {
  const now = new Date("2026-06-30T12:00:00Z");
  it("partitions by [startsAt, endsAt] vs now", () => {
    const items = [
      { id: "up", startsAt: "2026-07-10T00:00:00Z", endsAt: "2026-07-11T00:00:00Z" },
      { id: "cur", startsAt: "2026-06-29T00:00:00Z", endsAt: "2026-07-01T00:00:00Z" },
      { id: "past", startsAt: "2026-06-01T00:00:00Z", endsAt: "2026-06-02T00:00:00Z" },
      { id: "nostart", endsAt: "2026-12-01T00:00:00Z" }, // started/ongoing → current
    ];
    const g = groupByWindow(items, { now });
    expect(g.upcoming.map((x) => x.id)).toEqual(["up"]);
    expect(g.current.map((x) => x.id).sort()).toEqual(["cur", "nostart"]);
    expect(g.past.map((x) => x.id)).toEqual(["past"]);
  });
  it("honors custom field keys", () => {
    const g = groupByWindow([{ id: "a", from: "2026-07-01T00:00:00Z" }], { now, fromKey: "from", untilKey: "to" });
    expect(g.upcoming.map((x) => x.id)).toEqual(["a"]);
  });
  it("handles empty/nullish input", () => {
    expect(groupByWindow(null, { now })).toEqual({ upcoming: [], current: [], past: [] });
  });
});

describe("notification keyset cursor", () => {
  it("round-trips createdAt + id", () => {
    const dec = decodeNotificationCursor(encodeNotificationCursor({ id: "n-9", createdAt: new Date("2026-06-30T08:00:00Z") }));
    expect(dec.id).toBe("n-9");
    expect(dec.createdAt.toISOString()).toBe("2026-06-30T08:00:00.000Z");
  });
});
