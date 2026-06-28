// Live-DB integration tests for the Session-4 Academic Year Engine against the
// seeded Neon database. Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set,
// so the default `npm test` (and CI without DB creds) stays green. Run with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/year.db.test.mjs
//
// Exercises: current-year resolution + set-current, cross-year history queries +
// org_unit_lineage follow, a full Transition Wizard run (structure-only; then
// structure+appointments+content into a second target), idempotent re-run, the
// one-semantic-row transition audit, and lock/unlock behavior (YEAR_LOCKED).
//
// Uses throwaway years far in the future (2090-91 source, 2091-92 / 2092-93
// targets) so the live current year is never disturbed. All fixtures are removed
// in afterAll via the BASE (audit-bypassing) client.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;

const DB_TEST_TIMEOUT = 180000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

let prisma, prismaBase, context, history, transition, lock, pub;
let actor, dev, councilTypeId, clubTypeId, secretaryPositionId, viewerRoleId;

// Tracked for cleanup.
const created = { years: [], orgUnits: [], lineages: [], items: [], persons: [], runs: [] };

const SOURCE_LABEL = "2090-91";
const TARGET1_LABEL = "2091-92"; // structure-only
const TARGET2_LABEL = "2092-93"; // structure + appointments + content
let sourceYearId, councilLineageKey, clubLineageKey, sourceClubUnitId, sourceItemId, sourceItemLineageKey;

async function load() {
  const p = await import("../lib/prisma.mjs");
  prisma = p.prisma;
  prismaBase = p.prismaBase;
  context = await import("../lib/year/context.mjs");
  history = await import("../lib/year/history.mjs");
  transition = await import("../lib/year/transition.mjs");
  lock = await import("../lib/year/lock.mjs");
  pub = await import("../lib/year/public.mjs");
}

// Fixtures are created via the AUDIT-BYPASSING prismaBase client so the suite
// does not leak per-create audit_log rows (for years/lineages especially, whose
// auto-audit rows carry no academicYearId and would survive academicYearId-based
// cleanup). The transition + content service paths under test still go through
// the audited `prisma` client.
async function makeYear(label, overrides = {}) {
  const y = await prismaBase.academicYear.create({
    data: {
      label,
      startDate: new Date(`${label.slice(0, 4)}-07-01`),
      endDate: new Date(`${Number(label.slice(0, 4)) + 1}-06-30`),
      status: "active",
      isCurrent: false,
      ...overrides,
    },
  });
  created.years.push(y.id);
  return y;
}

describe.skipIf(!RUN)("Academic Year Engine (live Neon)", () => {
  beforeAll(async () => {
    await load();
    for (let i = 1; i <= 12; i++) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    dev = await prisma.user.findFirst({ where: { isDeveloper: true } });
    actor = { userId: dev.id };
    councilTypeId = (await prisma.orgUnitType.findUniqueOrThrow({ where: { key: "council" } })).id;
    clubTypeId = (await prisma.orgUnitType.findUniqueOrThrow({ where: { key: "club" } })).id;
    secretaryPositionId = (await prisma.position.findUniqueOrThrow({ where: { key: "secretary" } })).id;
    viewerRoleId = (await prisma.role.findUniqueOrThrow({ where: { key: "viewer" } })).id;

    // ── Source year fixture: council (root) → club (child), one secretary
    //    appointment, one published club_profile content item, one year-scoped
    //    role grant. Built via prismaBase (no audit noise). ──
    const source = await makeYear(SOURCE_LABEL);
    sourceYearId = source.id;

    const councilLineage = await prismaBase.orgUnitLineage.create({ data: { canonicalName: "ZZ Year Council" } });
    councilLineageKey = councilLineage.lineageKey;
    created.lineages.push(councilLineageKey);
    const clubLineage = await prismaBase.orgUnitLineage.create({ data: { canonicalName: "ZZ Year Club" } });
    clubLineageKey = clubLineage.lineageKey;
    created.lineages.push(clubLineageKey);

    const council = await prismaBase.orgUnit.create({
      data: { academicYearId: sourceYearId, orgUnitTypeId: councilTypeId, lineageKey: councilLineageKey, slug: "zz-council", name: "ZZ Council", status: "published" },
    });
    created.orgUnits.push(council.id);
    const club = await prismaBase.orgUnit.create({
      data: { academicYearId: sourceYearId, orgUnitTypeId: clubTypeId, parentId: council.id, lineageKey: clubLineageKey, slug: "zz-club", name: "ZZ Club", status: "published" },
    });
    created.orgUnits.push(club.id);
    sourceClubUnitId = club.id;

    const person = await prismaBase.person.create({ data: { fullName: "ZZ Secretary", personType: "student" } });
    created.persons.push(person.id);
    await prismaBase.appointment.create({
      data: { academicYearId: sourceYearId, orgUnitId: club.id, positionId: secretaryPositionId, personId: person.id, status: "published" },
    });
    // a year-scoped role grant on the source year (for copy_role_assignments)
    await prismaBase.roleAssignment.create({ data: { userId: dev.id, roleId: viewerRoleId, academicYearId: sourceYearId } });

    // create + publish a club_profile on the source club (a published revision to clone)
    const cms = await import("../lib/cms/content.mjs");
    const { item } = await cms.createDraft(
      { contentType: "club_profile", academicYearId: sourceYearId, orgUnitId: club.id, slug: "zz-club-profile", title: "ZZ Club Profile", payload: { vision: "year-engine", missionPoints: [{ text: "persist" }] } },
      actor
    );
    await cms.publish(item.id, {}, actor);
    sourceItemId = item.id;
    sourceItemLineageKey = item.lineageKey;
    created.items.push(item.id);
  }, 120000);

  afterAll(async () => {
    if (!prismaBase) return;
    const years = created.years;
    // Make sure no test year is left locked (would block the structural deletes).
    if (years.length) await prismaBase.academicYear.updateMany({ where: { id: { in: years } }, data: { status: "active" } }).catch(() => {});
    if (years.length) {
      await prismaBase.auditLog.deleteMany({ where: { academicYearId: { in: years } } }).catch(() => {});
    }
    if (created.runs.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: created.runs } } }).catch(() => {});
    if (created.persons.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: created.persons } } }).catch(() => {});
    if (years.length) {
      await prismaBase.contentItem.deleteMany({ where: { academicYearId: { in: years } } }).catch(() => {});
      await prismaBase.appointment.deleteMany({ where: { academicYearId: { in: years } } }).catch(() => {});
      // role_assignment FKs to academic_year + org_unit_lineage are ON DELETE
      // RESTRICT, so clear copied grants before the lineage/year deletes.
      await prismaBase.roleAssignment.deleteMany({ where: { academicYearId: { in: years } } }).catch(() => {});
      // Break parent links before deleting (parent_id is ON DELETE RESTRICT).
      await prismaBase.orgUnit.updateMany({ where: { academicYearId: { in: years } }, data: { parentId: null } }).catch(() => {});
      await prismaBase.orgUnit.deleteMany({ where: { academicYearId: { in: years } } }).catch(() => {});
    }
    if (created.persons.length) await prismaBase.person.deleteMany({ where: { id: { in: created.persons } } }).catch(() => {});
    if (created.lineages.length) await prismaBase.orgUnitLineage.deleteMany({ where: { lineageKey: { in: created.lineages } } }).catch(() => {});
    if (years.length) await prismaBase.transitionRun.deleteMany({ where: { OR: [{ sourceYearId: { in: years } }, { targetYearId: { in: years } }] } }).catch(() => {});
    if (years.length) await prismaBase.academicYear.deleteMany({ where: { id: { in: years } } }).catch(() => {});
    await prisma.$disconnect();
  }, 120000);

  dbit("current-year resolution + set-current (restores afterwards)", async () => {
    const current = await context.resolveCurrentYear();
    expect(current?.isCurrent).toBe(true);
    expect(await context.getCurrentYearId()).toBe(current.id);

    // set-current to the source year, then restore the original — in a finally so
    // the live portal is never left pointing at a throwaway year.
    const originalId = current.id;
    // Audit watermark: the restore writes an 'update' row against the LIVE year
    // (not a throwaway), which academicYearId-based cleanup would miss; delete
    // exactly the rows this test creates against the live year afterward.
    const auditWatermark = (await prismaBase.auditLog.aggregate({ _max: { id: true } }))._max.id ?? 0n;
    try {
      const res = await context.setCurrentYear(sourceYearId, actor);
      expect(res.changed).toBe(true);
      expect(res.year.isCurrent).toBe(true);
      expect((await context.resolveCurrentYear()).id).toBe(sourceYearId);
      // the partial unique holds: exactly one current year
      expect(await prisma.academicYear.count({ where: { isCurrent: true } })).toBe(1);
    } finally {
      await context.setCurrentYear(originalId, actor);
      await prismaBase.auditLog
        .deleteMany({ where: { entityId: originalId, id: { gt: auditWatermark } } })
        .catch(() => {});
    }
    expect((await context.resolveCurrentYear()).id).toBe(originalId);
  });

  dbit("history queries read a year's structure/roster and follow lineage across years", async () => {
    const units = await history.listOrgUnitsForYear(sourceYearId);
    expect(units.map((u) => u.slug).sort()).toEqual(["zz-club", "zz-council"]);
    const roster = await history.listAppointmentsForYear(sourceYearId, { orgUnitId: sourceClubUnitId });
    expect(roster).toHaveLength(1);
    expect(roster[0].position.key).toBe("secretary");
    const content = await history.listContentForYear(sourceYearId, { contentType: "club_profile" });
    expect(content.map((c) => c.id)).toContain(sourceItemId);

    // lineage follow finds the club in the source year (more years appear after transitions).
    const timeline = await history.followLineage(clubLineageKey);
    expect(timeline.some((t) => t.year.id === sourceYearId)).toBe(true);
  });

  dbit("structure-only transition: units copied (lineage reused, parent remapped), content/roster NOT copied, idempotent + audited", async () => {
    const target = await makeYear(TARGET1_LABEL);
    const res = await transition.runTransition({ sourceYearId, targetYearId: target.id, copyStructure: true }, actor);
    created.runs.push(res.run.id);
    expect(res.idempotentSkip).toBe(false);
    expect(res.counts.orgUnits.copied).toBe(2);
    expect(res.counts.appointments.copied).toBe(0);
    expect(res.counts.contentItems.copied).toBe(0);

    const targetUnits = await prisma.orgUnit.findMany({ where: { academicYearId: target.id } });
    expect(targetUnits).toHaveLength(2);
    const targetClub = targetUnits.find((u) => u.lineageKey === clubLineageKey);
    const targetCouncil = targetUnits.find((u) => u.lineageKey === councilLineageKey);
    expect(targetClub).toBeTruthy(); // lineage row REUSED, not a new uuid
    expect(targetClub.status).toBe("draft"); // copied structure starts as draft
    expect(targetClub.parentId).toBe(targetCouncil.id); // parent remapped within the target year

    // content + roster were NOT copied (defaults OFF)
    expect(await prisma.contentItem.count({ where: { academicYearId: target.id } })).toBe(0);
    expect(await prisma.appointment.count({ where: { academicYearId: target.id } })).toBe(0);

    // provenance recorded on the target year
    expect((await prisma.academicYear.findUnique({ where: { id: target.id } })).transitionedFromYearId).toBe(sourceYearId);

    // idempotent re-run is a no-op (no second completed run, no duplicate units)
    const again = await transition.runTransition({ sourceYearId, targetYearId: target.id, copyStructure: true }, actor);
    expect(again.idempotentSkip).toBe(true);
    expect(await prisma.orgUnit.count({ where: { academicYearId: target.id } })).toBe(2);
    expect(await prisma.transitionRun.count({ where: { sourceYearId, targetYearId: target.id, status: "completed" } })).toBe(1);

    // exactly one semantic transition audit row for this run, attributed + with counts
    const auditRows = await prisma.auditLog.findMany({ where: { entityType: "transition_run", entityId: res.run.id, action: "transition" } });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0].actorUserId).toBe(actor.userId);
    expect(auditRows[0].after.counts.orgUnits.copied).toBe(2);
    // the headline DL-012/028 invariant: auto-audit was SUPPRESSED during the
    // copy — the 2 org_unit creates wrote ZERO per-statement 'create' rows.
    expect(await prisma.auditLog.count({ where: { academicYearId: target.id, action: "create" } })).toBe(0);
  });

  dbit("structure+appointments+content transition clones roster + content as target-year drafts", async () => {
    const target = await makeYear(TARGET2_LABEL);
    const res = await transition.runTransition(
      { sourceYearId, targetYearId: target.id, copyStructure: true, copyAppointments: true, copyContent: true },
      actor
    );
    created.runs.push(res.run.id);
    expect(res.counts.orgUnits.copied).toBe(2);
    expect(res.counts.appointments.copied).toBe(1);
    expect(res.counts.contentItems.copied).toBe(1);

    const targetClub = await prisma.orgUnit.findFirst({ where: { academicYearId: target.id, lineageKey: clubLineageKey } });

    // content cloned as a DRAFT, rebound to the target club unit, reusing the document lineage
    const item = await prisma.contentItem.findFirst({ where: { academicYearId: target.id, contentType: "club_profile" } });
    expect(item.status).toBe("draft");
    expect(item.draftRevisionId).toBeTruthy();
    expect(item.publishedRevisionId).toBeNull();
    expect(item.orgUnitId).toBe(targetClub.id);
    expect(item.lineageKey).toBe(sourceItemLineageKey);
    created.items.push(item.id);

    const cms = await import("../lib/cms/content.mjs");
    const view = await cms.getRevision(item.draftRevisionId);
    expect(view.payload.vision).toBe("year-engine");
    expect(view.payload.missionPoints).toEqual([{ text: "persist", sortOrder: 0 }]);

    // roster cloned as a DRAFT appointment, type-guard set is_singleton for the secretary
    const appt = await prisma.appointment.findFirst({ where: { academicYearId: target.id, orgUnitId: targetClub.id } });
    expect(appt.positionId).toBe(secretaryPositionId);
    expect(appt.status).toBe("draft");
    expect(appt.isSingleton).toBe(true);

    // public selector: a draft target year shows nothing public yet
    expect(await pub.listPublicContentForYear(target.id, { contentType: "club_profile" })).toHaveLength(0);
  });

  dbit("full copy + role assignments, then idempotent re-run and forced re-sync (picks up new source rows, no duplicate completed run)", async () => {
    const target = await makeYear("2093-94");
    // First run copies everything incl. the year-scoped role grant.
    const first = await transition.runTransition(
      { sourceYearId, targetYearId: target.id, copyStructure: true, copyAppointments: true, copyContent: true, copyRoleAssignments: true },
      actor
    );
    created.runs.push(first.run.id);
    expect(first.counts.orgUnits.copied).toBe(2);
    expect(first.counts.appointments.copied).toBe(1);
    expect(first.counts.contentItems.copied).toBe(1);
    expect(first.counts.roleAssignments.copied).toBe(1);
    const copiedItem = await prisma.contentItem.findFirst({ where: { academicYearId: target.id, contentType: "club_profile" } });
    created.items.push(copiedItem.id);

    // Plain re-run (no force) is the idempotent no-op guard.
    const noop = await transition.runTransition(
      { sourceYearId, targetYearId: target.id, copyStructure: true, copyAppointments: true, copyContent: true, copyRoleAssignments: true },
      actor
    );
    expect(noop.idempotentSkip).toBe(true);

    // Add a NEW unit to the SOURCE year, then FORCE a re-sync.
    const newLineage = await prismaBase.orgUnitLineage.create({ data: { canonicalName: "ZZ Year Club 2" } });
    created.lineages.push(newLineage.lineageKey);
    const sourceCouncil = await prismaBase.orgUnit.findFirstOrThrow({ where: { academicYearId: sourceYearId, lineageKey: councilLineageKey } });
    const newClub = await prismaBase.orgUnit.create({
      data: { academicYearId: sourceYearId, orgUnitTypeId: clubTypeId, parentId: sourceCouncil.id, lineageKey: newLineage.lineageKey, slug: "zz-club-2", name: "ZZ Club 2", status: "published" },
    });
    created.orgUnits.push(newClub.id);

    const forced = await transition.runTransition(
      { sourceYearId, targetYearId: target.id, copyStructure: true, copyAppointments: true, copyContent: true, copyRoleAssignments: true, force: true },
      actor
    );
    expect(forced.idempotentSkip).toBe(false);
    // only the NEW unit is copied; the existing two are skipped (idempotent)
    expect(forced.counts.orgUnits.copied).toBe(1);
    expect(forced.counts.orgUnits.skipped).toBe(2);
    // existing roster / content / role grants are all skipped — no duplicates
    expect(forced.counts.appointments.copied).toBe(0);
    expect(forced.counts.contentItems.copied).toBe(0);
    expect(forced.counts.roleAssignments.copied).toBe(0);

    // forced re-sync REUSED the same completed run row (no second 'completed')
    expect(forced.run.id).toBe(first.run.id);
    expect(await prisma.transitionRun.count({ where: { sourceYearId, targetYearId: target.id, status: "completed" } })).toBe(1);

    // end state: 3 units, 1 content item, 1 appointment, 1 role grant (no dups)
    expect(await prisma.orgUnit.count({ where: { academicYearId: target.id } })).toBe(3);
    expect(await prisma.contentItem.count({ where: { academicYearId: target.id } })).toBe(1);
    expect(await prisma.appointment.count({ where: { academicYearId: target.id } })).toBe(1);
    expect(await prisma.roleAssignment.count({ where: { academicYearId: target.id, revokedAt: null } })).toBe(1);
    // the new club was wired under the copied council (parent remap)
    const newTargetClub = await prisma.orgUnit.findFirst({ where: { academicYearId: target.id, lineageKey: newLineage.lineageKey } });
    const targetCouncil = await prisma.orgUnit.findFirst({ where: { academicYearId: target.id, lineageKey: councilLineageKey } });
    expect(newTargetClub.parentId).toBe(targetCouncil.id);
  });

  dbit("lock/unlock: cannot lock the current year; locking blocks writes (YEAR_LOCKED); transition into a locked target is rejected", async () => {
    const currentId = await context.getCurrentYearId();
    await expect(lock.lockYear(currentId, actor)).rejects.toMatchObject({ code: "CANNOT_LOCK_CURRENT" });

    const target1 = await prisma.academicYear.findFirstOrThrow({ where: { label: TARGET1_LABEL } });
    const locked = await lock.lockYear(target1.id, actor);
    expect(locked.year.status).toBe("locked");

    // a direct structural write to the locked year trips the real lock_guard trigger
    await expect(
      prisma.orgUnit.create({ data: { academicYearId: target1.id, orgUnitTypeId: clubTypeId, lineageKey: clubLineageKey, slug: "zz-blocked", name: "blocked" } })
    ).rejects.toThrow(/lock_guard/);

    // a (forced) transition INTO the locked target is rejected up front with the friendly error
    await expect(
      transition.runTransition({ sourceYearId, targetYearId: target1.id, copyStructure: true, force: true }, actor)
    ).rejects.toMatchObject({ code: "YEAR_LOCKED", status: 409 });

    const unlocked = await lock.unlockYear(target1.id, actor);
    expect(unlocked.year.status).toBe("active");
  });
});
