// Prisma Client singleton. Cached on globalThis so Next.js hot-reload / serverless
// warm invocations reuse one client instead of exhausting connections (the V1
// Mongoose connection-caching bug, KNOWN_ISSUES #6/#7, does not recur here).
// DATABASE_URL is the POOLED (PgBouncer) Neon URL; migrations use DIRECT_URL.
//
// The exported `prisma` is the BASE client extended with the CENTRAL audit-write
// extension (DL-012 / DL-025): every mutating op on an audited model is recorded
// in audit_log automatically (capability 8). The extension uses the un-extended
// `base` client internally for before-reads + the audit write, so it never
// recurses. See lib/cms/audit.mjs for the two audit paths (auto vs semantic) and
// lib/cms/audit-context.mjs for the actor context the writer reads.
import { PrismaClient } from "@prisma/client";
import { buildAuditExtension } from "./cms/audit.mjs";

const globalForPrisma = globalThis;

// The raw client (no extension). Cached so before-reads/audit writes reuse it.
const base =
  globalForPrisma.__iitPrismaBase ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// Transient Neon connectivity is RETRIED transparently. A suspended Neon free-tier
// compute takes ~7s to cold-wake and the first connection through the pooler can
// fail outright (P1001 "Can't reach database server"); P1017 is a dropped
// connection and P2024 a pool-acquire timeout. Without this the FIRST request
// after idle crashed the page (500). The hook re-runs the operation with backoff,
// which both waits for and triggers the compute wake — mirroring the waitForDb
// loop in prisma/seed.mjs / scripts/dev-cli.mjs, but applied to every query.
const RETRYABLE_DB_CODES = new Set(["P1001", "P1017", "P2024"]);
function isRetryableDbError(e) {
  if (e && RETRYABLE_DB_CODES.has(e.code)) return true;
  const msg = String(e?.message ?? "");
  return msg.includes("Can't reach database server") || msg.includes("Server has closed the connection");
}
function buildRetryExtension() {
  const BACKOFF_MS = [400, 900, 1800, 3000];
  return {
    name: "neon-retry",
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          let attempt = 0;
          for (;;) {
            try {
              return await query(args);
            } catch (e) {
              if (!isRetryableDbError(e) || attempt >= BACKOFF_MS.length) throw e;
              await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt++]));
            }
          }
        },
      },
    },
  };
}

// The application client: base + central audit extension + Neon-retry (outermost,
// so a retried op re-runs through the audit hook too).
export const prisma =
  globalForPrisma.__iitPrisma ?? base.$extends(buildAuditExtension(base)).$extends(buildRetryExtension());

// Re-export the un-extended client for the rare caller that must bypass audit
// (e.g. the audit reader itself, or a migration/repair script). Prefer `prisma`.
export const prismaBase = base;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__iitPrismaBase = base;
  globalForPrisma.__iitPrisma = prisma;
}

export default prisma;
