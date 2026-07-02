// OPTIONAL cleanup for simulation data (the /simulations kit + tests/*-simulation.test.mjs).
// Removes the demo accounts, demo events (and ALL their cascaded rounds/scores/attendance/
// registrations/quiz sessions+questions+answers/organizers/settings/revisions/payloads),
// and the demo clubs. Everything is matched by the `sim` naming convention, so real data is
// never touched.
//
//   npm run sim:clean            # DRY RUN — just report what would be deleted
//   npm run sim:clean -- --apply # actually delete
//
// ⚠ Runs against whatever DATABASE_URL is in .env.local. NEVER point this at production.
import prisma, { prismaBase } from "../lib/prisma.mjs";

const APPLY = process.argv.includes("--apply");

async function main() {
  const dbHost = (process.env.DATABASE_URL || "").split("@")[1] ?? "(configured DB)";
  console.log(`Simulation cleanup — target DB: ${dbHost}`);
  console.log(APPLY ? "MODE: APPLY (will delete)\n" : "MODE: DRY RUN (nothing will be deleted)\n");

  // Match the sim naming convention only.
  const events = await prisma.contentItem.findMany({ where: { contentType: "event", slug: { startsWith: "sim-" } }, select: { id: true, slug: true } });
  const eventIds = events.map((e) => e.id);
  const users = await prisma.user.findMany({ where: { email: { startsWith: "sim." } }, select: { id: true, email: true } });
  const clubs = await prisma.orgUnit.findMany({ where: { slug: { startsWith: "sim-" } }, select: { id: true, slug: true, lineageKey: true } });

  const regs = eventIds.length ? await prisma.eventRegistration.count({ where: { eventItemId: { in: eventIds } } }) : 0;
  const scores = eventIds.length ? await prisma.eventScore.count({ where: { eventItemId: { in: eventIds } } }) : 0;
  const rounds = eventIds.length ? await prisma.eventRound.count({ where: { eventItemId: { in: eventIds } } }) : 0;
  const questions = eventIds.length ? await prisma.quizQuestion.count({ where: { eventItemId: { in: eventIds } } }) : 0;
  const answers = eventIds.length ? await prisma.quizAnswer.count({ where: { session: { eventItemId: { in: eventIds } } } }) : 0;

  console.log("Would delete (matched by 'sim' convention):");
  console.log(`  ${events.length} event(s): ${events.map((e) => e.slug).join(", ") || "—"}`);
  console.log(`    ↳ cascades: ${rounds} round(s), ${scores} score(s), ${regs} registration(s), ${questions} quiz question(s), ${answers} quiz answer(s)`);
  console.log(`  ${users.length} user account(s) (email starts with "sim.")`);
  console.log(`  ${clubs.length} club(s): ${clubs.map((c) => c.slug).join(", ") || "—"}\n`);

  if (!APPLY) {
    console.log("DRY RUN complete — nothing was deleted. Re-run with `-- --apply` to delete.");
    return;
  }

  // Delete order respects FKs: events (cascade all event/quiz data) → users → clubs → lineages.
  // Use the un-audited base client so cleanup doesn't flood the audit log.
  if (eventIds.length) await prismaBase.contentItem.deleteMany({ where: { id: { in: eventIds } } });
  if (users.length) await prismaBase.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  if (clubs.length) {
    await prismaBase.orgUnit.deleteMany({ where: { id: { in: clubs.map((c) => c.id) } } });
    await prismaBase.orgUnitLineage.deleteMany({ where: { lineageKey: { in: clubs.map((c) => c.lineageKey) } } });
  }
  console.log("✓ Simulation data deleted.");
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error("Cleanup failed:", e); await prisma.$disconnect(); process.exit(1); });
