// Roster SYNC — reconciles the club/council PEOPLE in a live database against the
// current dataset in lib/org/data/councils.mjs (2026-27 intake sheet).
//
//   npm run db:sync:roster -- --dry-run   report the diff, write NOTHING
//   npm run db:sync:roster                apply it
//   npm run db:sync:roster -- --draft     apply, but leave new appointments unpublished
//
// WHY this exists (and db:import:org does not do it): the importer is CREATE-ONLY.
// It is keyed by natural key and skips anything that already exists, so re-running it
// against a database that was already imported reports "0 created" and leaves last
// year's coordinators on the page. This script is the UPDATE path — it archives the
// appointments the dataset no longer names and creates the ones it now does.
//
// SCOPE — deliberately narrow. It touches ONLY these positions:
//   council_secretary · pg_representative · pic · coordinator · co_coordinator ·
//   club_associate · hostel_secretary · mess_secretary
// on the council / club / hostel / mess units of the CURRENT academic year, PLUS each
// club's parent council (so a club the dataset has moved between councils follows it —
// 2026-27 moves the five technical clubs from the Academic Council to the Technical
// Council). It never creates, renames or archives a unit, and Associate Deans, wardens,
// caretakers, attendants, mess committee members and all profile content (vision /
// mission / logo / Instagram / meal timings) are left completely alone. A unit in the
// dataset with no match for the year is REPORTED and skipped — run db:import:org first
// to stand up a new club (2026-27 adds Sangam (Media), Hockey and Squash).
//
// SAFETY: archive-before-create, because `pic` and `council_secretary` are singletons
// (position.max_holders = 1) — creating the new holder before freeing the slot trips
// the partial-unique. Every write goes through the audited service layer, so each
// change lands in the audit log attributed to the seeded developer user.
import prisma from "../lib/prisma.mjs";
import { getCurrentYearId } from "../lib/year/context.mjs";
import { buildImportPlan } from "../lib/org/data/index.mjs";
import { POSITIONS } from "../lib/org/structure.mjs";
import { inferPersonType, cleanName } from "../lib/org/normalize.mjs";
import { findOrgUnitBySlug, editOrgUnit } from "../lib/org/units.mjs";
import { upsertPerson, findPersonByName, editPerson } from "../lib/org/people.mjs";
import { createAppointment, findAppointment, publishAppointment, archiveAppointment } from "../lib/org/appointments.mjs";

// The only positions this script reconciles.
const ROSTER_POSITIONS = [
  "council_secretary", "pg_representative",
  "pic", "coordinator", "co_coordinator", "club_associate",
  "hostel_secretary", "mess_secretary",
];

async function waitForDb(maxAttempts = 12, delayMs = 5000) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (e) {
      if (i === maxAttempts) throw e;
      console.log(`DB not ready (attempt ${i}/${maxAttempts}) — waking, retrying...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// Ensure the positions the dataset references exist. On a database seeded before
// `club_associate` was added to lib/org/structure.mjs the row is simply missing, and
// a plain upsert here saves re-running the whole seed.
async function ensurePositions(typeIdByKey, { dryRun }) {
  const have = new Set((await prisma.position.findMany({ select: { key: true } })).map((p) => p.key));
  const missing = POSITIONS.filter((p) => ROSTER_POSITIONS.includes(p.key) && !have.has(p.key));
  for (const p of missing) {
    console.log(`  + position "${p.key}" (${p.name})${dryRun ? "  [dry-run]" : ""}`);
    if (dryRun) continue;
    await prisma.position.create({
      data: {
        key: p.key,
        name: p.name,
        appliesToTypeId: p.appliesToType ? typeIdByKey.get(p.appliesToType) ?? null : null,
        holderKind: p.holderKind,
        maxHolders: p.maxHolders,
        rank: p.rank,
        isLead: p.isLead,
      },
    });
  }
  return missing.length;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run") || args.has("-n");
  const publish = !args.has("--draft");

  await waitForDb();
  const yearId = await getCurrentYearId();
  if (!yearId) throw new Error("No current academic year is set — nothing to sync into.");
  const year = await prisma.academicYear.findUnique({ where: { id: yearId }, select: { label: true } });

  const dev = await prisma.user.findFirst({ where: { isDeveloper: true }, select: { id: true } });
  const actor = dev ? { userId: dev.id } : { system: true };

  console.log(`Roster sync — year ${year?.label ?? yearId}${dryRun ? "  (DRY RUN — no writes)" : ""}`);
  console.log(`Actor: ${dev ? dev.id : "system"} · new appointments: ${publish ? "published" : "draft"}\n`);

  const typeIdByKey = new Map((await prisma.orgUnitType.findMany({ select: { id: true, key: true } })).map((t) => [t.key, t.id]));
  await ensurePositions(typeIdByKey, { dryRun });

  const positions = await prisma.position.findMany({ where: { key: { in: ROSTER_POSITIONS } }, select: { id: true, key: true, holderKind: true } });
  const positionByKey = new Map(positions.map((p) => [p.key, p]));
  const counts = { archived: 0, created: 0, republished: 0, unchanged: 0, peopleCreated: 0, peopleUpdated: 0, moved: 0, missingUnits: [] };
  const plan = buildImportPlan();

  // Reconcile ONE (unit, position) slot: `desired` is the planned people for it.
  async function reconcile(unit, positionKey, desired, label) {
    const position = positionByKey.get(positionKey);
    if (!position) {
      console.log(`    ! position "${positionKey}" missing — skipped (re-run without --dry-run, or npm run db:seed)`);
      return;
    }
    const live = await prisma.appointment.findMany({
      where: { orgUnitId: unit.id, academicYearId: yearId, positionId: position.id, archivedAt: null },
      select: { id: true, status: true, person: { select: { id: true, fullName: true } } },
    });

    const wanted = new Map(desired.map((d) => [cleanName(d.name).toLowerCase(), d]));

    // 1. ARCHIVE first — frees a singleton slot before its new holder is created.
    for (const appt of live) {
      const key = cleanName(appt.person?.fullName ?? "").toLowerCase();
      if (wanted.has(key)) continue;
      console.log(`    - ${label}: ${appt.person?.fullName} (archived)${dryRun ? "  [dry-run]" : ""}`);
      counts.archived++;
      if (!dryRun) await archiveAppointment(appt.id, actor);
    }

    // 2. CREATE / refresh the planned holders.
    let sortOrder = 0;
    for (const d of desired) {
      const name = cleanName(d.name);
      const order = sortOrder++;
      const existingPerson = await findPersonByName(name);

      if (dryRun) {
        const held = live.find((a) => cleanName(a.person?.fullName ?? "").toLowerCase() === name.toLowerCase());
        if (held) {
          if (publish && held.status !== "published") { console.log(`    ~ ${label}: ${name} (publish existing appointment)  [dry-run]`); counts.republished++; }
          else counts.unchanged++;
        } else {
          console.log(`    + ${label}: ${name}${existingPerson ? "" : "  (new person)"}  [dry-run]`);
          counts.created++;
          if (!existingPerson) counts.peopleCreated++;
        }
        continue;
      }

      // upsertPerson only FILLS GAPS, so a person carried over from a previous year keeps
      // their old photo. editPerson overwrites, which is what a roster refresh means.
      const personType = inferPersonType(name, position.holderKind ?? "student");
      const scope = { academicYearId: yearId, orgUnitLineageKey: unit.lineageKey };
      const { person, created } = await upsertPerson(
        { fullName: name, personType, email: d.email ?? null, profileUrl: d.profileUrl ?? null },
        actor,
        { scope }
      );
      if (created) counts.peopleCreated++;

      const patch = {};
      if (d.photo) patch.photoUrl = d.photo;
      if (d.profileUrl) patch.profileUrl = d.profileUrl;
      // Only set an email that is still free — person.email is UNIQUE.
      if (d.email && !(await prisma.person.findFirst({ where: { email: d.email, NOT: { id: person.id } }, select: { id: true } }))) {
        patch.email = d.email;
      }
      if (Object.keys(patch).length) {
        const { changed } = await editPerson(person.id, patch, actor);
        if (changed) counts.peopleUpdated++;
      }

      const existingAppt = await findAppointment(yearId, unit.id, position.id, person.id);
      if (existingAppt) {
        if (publish && existingAppt.status !== "published") {
          await publishAppointment(existingAppt.id, actor);
          console.log(`    ~ ${label}: ${name} (published)`);
          counts.republished++;
        } else {
          counts.unchanged++;
        }
        continue;
      }
      await createAppointment(
        {
          orgUnitId: unit.id,
          positionId: position.id,
          personId: person.id,
          titleOverride: d.titleOverride ?? null,
          sortOrder: order,
          status: publish ? "published" : "draft",
        },
        actor
      );
      console.log(`    + ${label}: ${name}${created ? "  (new person)" : ""}`);
      counts.created++;
    }
  }

  for (const council of plan.councils) {
    const councilUnit = await findOrgUnitBySlug(yearId, council.slug);
    if (!councilUnit) {
      counts.missingUnits.push(council.slug);
      console.log(`\n== ${council.name} — NO unit for this year, skipped (run db:import:org)`);
      continue;
    }
    console.log(`\n== ${council.name}`);
    if (council.secretary) await reconcile(councilUnit, "council_secretary", [council.secretary], "secretary");
    await reconcile(councilUnit, "pg_representative", council.representatives ?? [], "PG rep");

    for (const club of council.clubs) {
      const clubUnit = await findOrgUnitBySlug(yearId, club.slug);
      if (!clubUnit) {
        counts.missingUnits.push(club.slug);
        console.log(`   ${club.name} — NO unit for this year, skipped (run db:import:org)`);
        continue;
      }
      console.log(`   ${club.name}`);
      // The dataset owns which council a club belongs to. On an already-imported DB the
      // unit keeps whatever parent it was created under, so follow the move here — the
      // DB hierarchy guard still enforces council→club, and appointments are keyed by
      // org_unit_id, so a reparent carries the whole roster with it.
      if (clubUnit.parentId !== councilUnit.id) {
        console.log(`    → moved to ${council.name}${dryRun ? "  [dry-run]" : ""}`);
        counts.moved++;
        if (!dryRun) await editOrgUnit(clubUnit.id, { parentId: councilUnit.id }, actor);
      }
      await reconcile(clubUnit, "pic", club.pic ? [club.pic] : [], "PIC");
      await reconcile(clubUnit, "coordinator", club.coordinators.filter((c) => c.positionKey === "coordinator"), "coordinator");
      await reconcile(clubUnit, "co_coordinator", club.coordinators.filter((c) => c.positionKey === "co_coordinator"), "co-coordinator");
      await reconcile(clubUnit, "club_associate", club.associates ?? [], "associate");
    }
  }

  // ── hostels: the student secretary only (wardens/caretakers/attendants untouched) ──
  console.log("\n== Hostels");
  for (const hostel of plan.hostels) {
    const unit = await findOrgUnitBySlug(yearId, hostel.slug);
    if (!unit) {
      counts.missingUnits.push(hostel.slug);
      console.log(`   ${hostel.name} — NO unit for this year, skipped`);
      continue;
    }
    console.log(`   ${hostel.name}`);
    await reconcile(unit, "hostel_secretary", hostel.roles.filter((r) => r.positionKey === "hostel_secretary"), "hostel secretary");
  }

  // ── messes: each mess's OWN secretary (the committee roster is left alone) ──
  console.log("\n== Messes");
  for (const mess of plan.messes) {
    const unit = await findOrgUnitBySlug(yearId, mess.slug);
    if (!unit) {
      counts.missingUnits.push(mess.slug);
      console.log(`   ${mess.name} — NO unit for this year, skipped`);
      continue;
    }
    console.log(`   ${mess.name}`);
    await reconcile(unit, "mess_secretary", mess.secretary ? [mess.secretary] : [], "mess secretary");
  }

  console.log("\n" + "-".repeat(60));
  console.log(`appointments  created ${counts.created} · archived ${counts.archived} · re-published ${counts.republished} · unchanged ${counts.unchanged}`);
  console.log(`people        created ${counts.peopleCreated} · updated ${counts.peopleUpdated}`);
  console.log(`clubs moved   ${counts.moved}`);
  if (counts.missingUnits.length) console.log(`missing units ${counts.missingUnits.length}: ${counts.missingUnits.join(", ")}`);
  if (dryRun) console.log("\nDRY RUN — nothing was written. Re-run without --dry-run to apply.");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Roster sync failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
