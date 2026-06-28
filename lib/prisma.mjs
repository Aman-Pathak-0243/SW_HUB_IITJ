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

// The application client: base + central audit extension.
export const prisma = globalForPrisma.__iitPrisma ?? base.$extends(buildAuditExtension(base));

// Re-export the un-extended client for the rare caller that must bypass audit
// (e.g. the audit reader itself, or a migration/repair script). Prefer `prisma`.
export const prismaBase = base;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__iitPrismaBase = base;
  globalForPrisma.__iitPrisma = prisma;
}

export default prisma;
