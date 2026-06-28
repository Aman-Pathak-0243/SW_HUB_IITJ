// Runnable entry point for the V1 → V2 events import (Session 6). Migrates the 3
// backed-up Mongo `events` documents into Postgres as published current-year CMS
// events (content_type='event').
//   npm run db:import:events              (dotenv-cli loads .env.local)
//   npm run db:import:events -- --draft   (import WITHOUT publishing — draft only)
//   npm run db:import:events -- --no-media (skip media_asset inventory rows)
//
// Idempotent: safe to re-run (a second run reports 0 created). Attributes audit
// rows to the seeded developer user when present (RBAC bypassed via is_developer),
// else runs as a system actor. Honors Neon cold-start. Mirrors import-org.mjs.
import prisma from "../lib/prisma.mjs";
import { importEvents } from "../lib/events/import.mjs";

async function waitForDb(maxAttempts = 12, delayMs = 5000) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (e) {
      if (i === maxAttempts) throw e;
      console.log(`DB not ready (attempt ${i}/${maxAttempts}) — waking Neon, retrying...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const publish = !args.has("--draft");
  const withMedia = !args.has("--no-media");

  await waitForDb();
  const dev = await prisma.user.findFirst({ where: { isDeveloper: true }, select: { id: true } });
  const actor = dev ? { userId: dev.id } : { system: true };

  console.log(`Importing V1 events (publish=${publish}, withMedia=${withMedia}, actor=${dev ? dev.id : "system"})...`);
  const result = await importEvents({ publish, withMedia }, actor);
  console.log("Events import complete:", JSON.stringify(result, null, 2));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Events import failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
