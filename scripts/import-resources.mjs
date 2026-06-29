// Runnable entry point for the V1 → V2 resources import (Session 7). Migrates the
// V1 per-unit infrastructure PDFs / Drive links into Postgres as published
// current-year CMS content (content_type='resource', org-bound).
//   npm run db:import:resources               (dotenv-cli loads .env.local)
//   npm run db:import:resources -- --draft    (import WITHOUT publishing)
//   npm run db:import:resources -- --no-media  (skip media_asset inventory rows)
//
// PREREQUISITE: run `npm run db:import:org` first — resources bind to org units;
// a resource whose unit is absent is skipped (counted as missingUnit) and picked
// up on a later re-run. Idempotent: a second run reports 0 created. Mirrors
// import-events.mjs (attributes audit rows to the seeded developer, else system).
import prisma from "../lib/prisma.mjs";
import { importResources } from "../lib/resources/import.mjs";

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

  console.log(`Importing V1 resources (publish=${publish}, withMedia=${withMedia}, actor=${dev ? dev.id : "system"})...`);
  const result = await importResources({ publish, withMedia }, actor);
  console.log("Resources import complete:", JSON.stringify(result, null, 2));
  if (result.counts.resources.missingUnit) {
    console.log(`Note: ${result.counts.resources.missingUnit} resource(s) skipped — their org unit is not in this year yet. Run db:import:org, then re-run.`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Resources import failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
