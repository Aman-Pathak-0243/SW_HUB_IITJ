// LAZY + INJECTABLE Redis (Session 16, DL-107). The Tier-B live path uses Redis for
// cross-instance pub/sub FAN-OUT (SSE across app instances). Like nodemailer (DL-073),
// Redis is NEVER a hard dependency: `ioredis` is dynamically imported ONLY when REDIS_URL
// is set, and ANY failure (unset URL / package missing / unreachable) degrades silently to
// the in-process broadcaster. Single-instance is the committed topology (systemRequirements
// §8/§10), so the app is fully functional without Redis; the build + the whole test suite
// run WITHOUT `ioredis` installed. (The leaderboard is read AUTHORITATIVELY from Postgres —
// lib/quiz/leaderboard.mjs — not a Redis cache; see that file's note.)
//
// Two clients are provisioned lazily: a COMMAND client (publish) and, on demand, a
// SUBSCRIBER client (ioredis requires a dedicated connection for SUB mode).
let commandClient; // undefined = not yet resolved; null = unavailable; else the client
let injected = null; // test seam

// Inject a fake { publish, subscribe, duplicate, zincrby, zrevrange, zrevrank, ... } in
// tests (and force the Redis code path without a real server). Pass null to reset.
export function setRedisForTest(fake) {
  injected = fake;
  commandClient = undefined;
}

export function isRedisConfigured(env = process.env) {
  return !!(env?.REDIS_URL && String(env.REDIS_URL).trim());
}

async function loadIoredis() {
  try {
    const mod = await import("ioredis");
    return mod?.default ?? mod?.Redis ?? mod;
  } catch {
    return null; // not installed on this deployment — fall back
  }
}

// The memoized COMMAND client, or null if Redis is unconfigured/uninstalled/failed.
// Never throws — a null return is the signal to use the fallback path.
export async function getRedis(env = process.env) {
  if (injected !== null) return injected;
  if (commandClient !== undefined) return commandClient;
  if (!isRedisConfigured(env)) {
    commandClient = null;
    return null;
  }
  const Redis = await loadIoredis();
  if (typeof Redis !== "function") {
    console.warn("[redis] REDIS_URL is set but `ioredis` is not installed — run `npm install ioredis`. Using fallback.");
    commandClient = null;
    return null;
  }
  try {
    const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: true });
    if (typeof client.on === "function") client.on("error", (e) => console.warn("[redis] error:", e?.message ?? e));
    commandClient = client;
    return client;
  } catch (e) {
    console.warn("[redis] connection failed, using fallback:", e?.message ?? e);
    commandClient = null;
    return null;
  }
}

// A DEDICATED subscriber connection (ioredis SUB mode can't share the command client).
// Returns null when Redis is unavailable. The injected fake, if any, is returned as-is.
export async function getRedisSubscriber(env = process.env) {
  const client = await getRedis(env);
  if (!client) return null;
  if (injected !== null) return injected; // the fake plays both roles in tests
  try {
    return typeof client.duplicate === "function" ? client.duplicate() : client;
  } catch (e) {
    console.warn("[redis] subscriber duplicate failed:", e?.message ?? e);
    return null;
  }
}
