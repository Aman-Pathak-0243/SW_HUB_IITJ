// Transport-agnostic real-time BROADCASTER (Session 16, DL-107). The SSE routes
// (app/api/live/*) subscribe to a named channel here; the quiz/registration services
// publish events to it. Two layers:
//   • IN-PROCESS: a channel → Set(listener) registry cached on globalThis (like the
//     Prisma singleton) so every route handler in ONE Node process shares it. This is
//     all that a single-instance PM2 fork (the committed topology, systemRequirements
//     §8) needs — no Redis required.
//   • CROSS-INSTANCE (optional): when Redis is available, publish() ALSO forwards to a
//     Redis pub/sub channel, and a single subscriber connection re-emits messages from
//     OTHER processes into the local registry. Messages are tagged with this process's
//     origin nonce so a process never re-delivers its own message twice.
//
// Everything is best-effort and never throws into a caller: a publish failure must not
// break a registration or an answer write. PII discipline is the caller's job — only
// publish display-safe payloads (names, counts, ranks — never emails/uuids).
import { randomUUID } from "node:crypto";
import { getRedis, getRedisSubscriber } from "./redis.mjs";

const REDIS_CHANNEL = "iitj:rt"; // one Redis pub/sub channel; the app-channel is in the payload

const g = globalThis;
const state = (g.__iitBroadcast ??= {
  listeners: new Map(), // channel -> Set<fn>
  origin: randomUUID(), // this process's nonce (dedupe self-echo from Redis)
  redisWired: false, // have we attached the Redis subscriber yet?
});

// Subscribe `listener` to a channel. Returns an unsubscribe function. Lazily wires the
// Redis subscriber the first time anyone subscribes (a no-op when Redis is absent).
export function subscribe(channel, listener) {
  let set = state.listeners.get(channel);
  if (!set) {
    set = new Set();
    state.listeners.set(channel, set);
  }
  set.add(listener);
  ensureRedisWired();
  return () => {
    const s = state.listeners.get(channel);
    if (!s) return;
    s.delete(listener);
    if (s.size === 0) state.listeners.delete(channel);
  };
}

// Deliver a payload to every local listener on a channel. Never throws.
function emitLocal(channel, payload) {
  const set = state.listeners.get(channel);
  if (!set || set.size === 0) return;
  for (const fn of [...set]) {
    try { fn(payload); } catch (e) { console.warn("[broadcast] listener error:", e?.message ?? e); }
  }
}

// Publish an event to a channel. `payload` should be a small JSON-safe object
// (e.g. { type, ... }). Delivered to local listeners immediately AND, when Redis is
// available, forwarded to other instances. Best-effort; never throws.
export async function publish(channel, payload) {
  emitLocal(channel, payload);
  try {
    const redis = await getRedis();
    if (redis?.publish) {
      const envelope = JSON.stringify({ origin: state.origin, channel, payload });
      await redis.publish(REDIS_CHANNEL, envelope);
    }
  } catch (e) {
    console.warn("[broadcast] redis publish failed (local delivery still happened):", e?.message ?? e);
  }
}

// Attach the Redis subscriber ONCE per process. Messages from OTHER origins are
// re-emitted locally; our own echo is dropped (we already delivered it in publish()).
function ensureRedisWired() {
  if (state.redisWired) return;
  state.redisWired = true; // set first so a concurrent subscribe() doesn't double-wire
  (async () => {
    const sub = await getRedisSubscriber();
    if (!sub?.subscribe) {
      state.redisWired = false; // no Redis — allow a later retry if it becomes available
      return;
    }
    try {
      await sub.subscribe(REDIS_CHANNEL);
      sub.on?.("message", (_ch, raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }
        if (!msg || msg.origin === state.origin) return; // drop our own echo
        emitLocal(msg.channel, msg.payload);
      });
    } catch (e) {
      console.warn("[broadcast] redis subscribe failed:", e?.message ?? e);
      state.redisWired = false;
    }
  })();
}

// ── channel-name helpers (one authority so publishers + SSE routes agree) ──
export const channels = {
  quiz: (sessionId) => `quiz:${sessionId}`,
  registration: (eventItemId) => `registration:${eventItemId}`,
};
