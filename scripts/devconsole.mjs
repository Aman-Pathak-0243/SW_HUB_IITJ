// Developer Console — terminal status dump (Session 8). READ-ONLY: prints the
// system-status dashboard (DB connectivity, migration status, transition history,
// media-migration plan) + the testing/cost reports, and optionally a slice of the
// audit log. The Session-9 admin panel renders the same readers as a UI; this is
// the operator-facing CLI for now (mirrors scripts/migrate-media.mjs).
//
//   npm run db:console                 status + reports (JSON)
//   npm run db:console -- --audit      + the 20 most-recent audit entries
//   npm run db:console -- --audit --action=publish --take=50
//
// Runs as the seeded developer when one exists (grants_all short-circuit), else a
// system actor — both bypass the console gate, which is correct for an operator CLI.
import prisma from "../lib/prisma.mjs";
import { getSystemStatus } from "../lib/devconsole/status.mjs";
import { getDevConsoleReports } from "../lib/devconsole/reports.mjs";
import { listAuditLog, getAuditStats } from "../lib/devconsole/audit.mjs";

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

function parseArgs(argv) {
  const out = { flags: new Set(), opts: {} };
  for (const a of argv) {
    if (a.startsWith("--") && a.includes("=")) {
      const [k, v] = a.slice(2).split("=");
      out.opts[k] = v;
    } else if (a.startsWith("--")) {
      out.flags.add(a.slice(2));
    }
  }
  return out;
}

async function main() {
  const { flags, opts } = parseArgs(process.argv.slice(2));
  await waitForDb();
  const dev = await prisma.user.findFirst({ where: { isDeveloper: true }, select: { id: true } });
  const actor = dev ? { userId: dev.id } : { system: true };

  const [status, reports] = await Promise.all([getSystemStatus(actor), getDevConsoleReports(actor)]);
  console.log("\n===== DEVELOPER CONSOLE — SYSTEM STATUS =====");
  console.log(JSON.stringify(status, null, 2));
  console.log("\n===== TESTING + COST REPORTS =====");
  console.log(JSON.stringify(reports, null, 2));

  if (flags.has("audit")) {
    const filters = {
      action: opts.action,
      entityType: opts.entityType,
      academicYearId: opts.academicYearId,
      take: opts.take ?? 20,
    };
    const [page, stats] = await Promise.all([listAuditLog(filters, actor), getAuditStats(filters, actor)]);
    console.log("\n===== AUDIT LOG (most recent) =====");
    console.log(JSON.stringify({ stats, ...page }, null, 2));
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Developer console failed:", e?.message ?? e);
    await prisma.$disconnect();
    process.exit(1);
  });
