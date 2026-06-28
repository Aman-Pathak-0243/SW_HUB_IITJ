// Runnable entry point for the Admin Media Migration Tool (Session 7) — the
// idempotent, reversible /public → Cloudinary migration.
//
//   npm run db:migrate:media                  DRY-RUN (default, safe): print the plan
//   npm run db:migrate:media -- --apply       upload /public assets → Cloudinary
//   npm run db:migrate:media -- --rollback    DRY-RUN of the rollback plan
//   npm run db:migrate:media -- --rollback --apply   restore migrated assets → /public
//
// DRY-RUN is the default so an operator always previews before mutating. A real
// --apply needs CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET
// in .env.local (the tool fails fast with a clear message otherwise). Idempotent:
// re-running --apply migrates 0 (already-migrated rows are skipped). Attributes the
// audit row to the seeded developer when present, else a system actor.
import prisma from "../lib/prisma.mjs";
import { migratePublicAssets, rollbackMigration } from "../lib/media/migrate.mjs";
import { getCloudinaryConfig } from "../lib/media/cloudinary.mjs";

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
  const apply = args.has("--apply");
  const rollback = args.has("--rollback");
  const dryRun = !apply;

  await waitForDb();
  const dev = await prisma.user.findFirst({ where: { isDeveloper: true }, select: { id: true } });
  const actor = dev ? { userId: dev.id } : { system: true };
  const cfg = getCloudinaryConfig();

  if (rollback) {
    console.log(`Media migration ROLLBACK (${dryRun ? "dry-run" : "APPLY"})...`);
    const result = await rollbackMigration({ dryRun }, actor);
    console.log(JSON.stringify(result.counts, null, 2));
    if (dryRun) console.log(`${result.plan.length} asset(s) would be restored to /public. Re-run with --rollback --apply to apply.`);
    return;
  }

  console.log(`Media migration to Cloudinary (${dryRun ? "dry-run" : "APPLY"}; cloud=${cfg?.cloudName ?? "UNCONFIGURED"})...`);
  const result = await migratePublicAssets({ dryRun }, actor);
  console.log(JSON.stringify(result.counts, null, 2));
  if (result.base64Pending) {
    console.log(`${result.base64Pending} base64 placeholder(s) pending — their bytes live in the Session-1 Mongo backup (DL-039); supply a base64Resolver to reconcile.`);
  }
  if (dryRun) {
    const uploadable = result.plan.filter((p) => p.action === "upload").length;
    console.log(`${uploadable} /public asset(s) would be uploaded. Re-run with --apply to migrate (requires CLOUDINARY_* in .env.local).`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Media migration failed:", e?.message ?? e);
    await prisma.$disconnect();
    process.exit(1);
  });
