// Prisma Client singleton. Cached on globalThis so Next.js hot-reload / serverless
// warm invocations reuse one client instead of exhausting connections (the V1
// Mongoose connection-caching bug, KNOWN_ISSUES #6/#7, does not recur here).
// DATABASE_URL is the POOLED (PgBouncer) Neon URL; migrations use DIRECT_URL.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__iitPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__iitPrisma = prisma;
}

export default prisma;
