// Static tests for the real-time transport (Session 16, DL-107): the in-process
// broadcaster fan-out, the lazy Redis client's fallback + injection seam, and the SSE
// Response shape. No DB, no real Redis server.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { subscribe, publish, channels } from "../lib/realtime/broadcast.mjs";
import { isRedisConfigured, getRedis, getRedisSubscriber, setRedisForTest } from "../lib/realtime/redis.mjs";
import { sseResponse } from "../lib/realtime/sse.mjs";

describe("broadcast (in-process)", () => {
  it("delivers a published payload to every subscriber on a channel", async () => {
    const got = [];
    const unsub = subscribe("t:1", (p) => got.push(p));
    await publish("t:1", { type: "x", n: 1 });
    await publish("t:1", { type: "x", n: 2 });
    expect(got).toEqual([{ type: "x", n: 1 }, { type: "x", n: 2 }]);
    unsub();
  });

  it("stops delivering after unsubscribe and isolates channels", async () => {
    const a = [];
    const b = [];
    const unsubA = subscribe("t:a", (p) => a.push(p));
    subscribe("t:b", (p) => b.push(p));
    unsubA();
    await publish("t:a", { v: 1 });
    await publish("t:b", { v: 2 });
    expect(a).toEqual([]); // unsubscribed
    expect(b).toEqual([{ v: 2 }]); // other channel unaffected
  });

  it("a throwing listener does not break delivery to others", async () => {
    const good = [];
    subscribe("t:c", () => { throw new Error("boom"); });
    subscribe("t:c", (p) => good.push(p));
    await expect(publish("t:c", { ok: true })).resolves.toBeUndefined();
    expect(good).toEqual([{ ok: true }]);
  });

  it("builds stable channel names", () => {
    expect(channels.quiz("s1")).toBe("quiz:s1");
    expect(channels.registration("e1")).toBe("registration:e1");
  });
});

describe("redis (lazy + injectable, pub/sub only)", () => {
  afterEach(() => setRedisForTest(null));

  it("is unconfigured + returns null when REDIS_URL is unset (so the app runs without Redis)", async () => {
    setRedisForTest(null);
    expect(isRedisConfigured({})).toBe(false);
    expect(isRedisConfigured({ REDIS_URL: "redis://127.0.0.1:6379" })).toBe(true);
    expect(await getRedis({})).toBe(null);
    expect(await getRedisSubscriber({})).toBe(null);
  });

  it("returns an injected fake for both the command + subscriber roles", async () => {
    const fake = { publish: async () => 1, subscribe: async () => undefined, on: () => {} };
    setRedisForTest(fake);
    expect(await getRedis()).toBe(fake);
    expect(await getRedisSubscriber()).toBe(fake);
  });
});

describe("sseResponse", () => {
  it("returns a streaming Response with SSE headers", () => {
    const ac = new AbortController();
    const res = sseResponse({ channels: "t:sse", signal: ac.signal, onOpen: () => ({ type: "snapshot" }) });
    expect(res).toBeInstanceOf(Response);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(res.headers.get("cache-control")).toMatch(/no-cache/);
    ac.abort(); // clean up the stream
  });
});
