// Transition Wizard (capability 1) — copy an academic year's STRUCTURE forward
// into a target year, optionally cloning rosters, content, and role grants. Each
// run is recorded as a `transition_run` row (source/target, options, per-entity
// counts, status) for auditable, idempotent provenance.
//
// DESIGN — idempotent, NOT one giant transaction.
//   • Copying org_units REUSES each unit's `org_unit_lineage` row (a REAL FK,
//     DL-007) — we never mint a bare uuid; the target year gets a NEW org_unit
//     row pointing at the SAME lineage. The org_unit (academic_year_id,
//     lineage_key) unique therefore makes a re-run a no-op for units already
//     present (one instance of a logical unit per year). Content items reuse
//     their document lineage_key for the same reason.
//   • The copy is performed as a sequence of idempotent statements with
//     auto-audit SUPPRESSED, NOT inside a single interactive transaction: over
//     high-latency Neon a ~40-unit + content copy can exceed any sane tx ceiling,
//     and a partial run is safely resumable because every step skips rows that
//     already exist in the target. Crash-safety comes from idempotence, not
//     atomicity (DL-031). Exactly ONE semantic audit row (action='transition')
//     is written after the run completes.
//   • Re-run semantics: a COMPLETED run for a (source,target) pair makes a plain
//     re-run a no-op (returns the prior run) so the `transition_run_one_completed_uq`
//     partial unique is honored. Pass { force:true } to re-sync newly-added
//     source rows INTO the same completed run row (never a second 'completed').
//
// Defaults (DL-026): copy_structure ON, copy_appointments OFF (people change),
// copy_content OFF (clone latest revision as a target-year DRAFT when ON),
// copy_role_assignments OFF.
//
// AUTHORIZATION: `year.transition` (institute-wide). A `system` actor bypasses.
import prisma, { prismaBase } from "../prisma.mjs";
import { getContentTypeHandler } from "../cms/content-types.mjs";
import { withAuditContext } from "../cms/audit-context.mjs";
import { recordAudit } from "../cms/audit.mjs";
import { CmsValidationError, CmsNotFoundError, mapDbError, withMappedDbErrors } from "../cms/errors.mjs";
import { TX_OPTS } from "../cms/audited-mutation.mjs";
import { assertActorPermission, getYear, YEAR_OP_PERMISSIONS } from "./context.mjs";

const ENTITY = "transition_run";

// ── PURE planning helpers (unit-testable without a DB) ──────────────────────

// Split source rows into those to copy vs. skip, given the set of keys already
// present in the target. `keyOf(row)` derives the dedup key. Used directly by the
// structure phase; the appointment/content/role phases inline an equivalent
// "skip when the key already exists" check (their key depends on a per-row
// resolved target id, so they cannot pre-partition up front).
export function partitionByExisting(sourceRows, existingKeys, keyOf) {
  const existing = existingKeys instanceof Set ? existingKeys : new Set(existingKeys);
  const toCopy = [];
  const toSkip = [];
  for (const row of sourceRows) {
    if (existing.has(keyOf(row))) toSkip.push(row);
    else toCopy.push(row);
  }
  return { toCopy, toSkip };
}

// Index org units by their lineage_key (one unit per lineage per year).
export function indexByLineage(units) {
  const map = new Map();
  for (const u of units) map.set(u.lineageKey, u);
  return map;
}

// Resolve a copied unit's parent in the TARGET year: find the source parent, then
// the target unit sharing that parent's lineage. Returns null when the source had
// no parent or the parent was not copied (leave it a root in the target).
export function resolveTargetParentId(sourceUnit, sourceUnitsById, lineageToTargetUnit) {
  if (!sourceUnit.parentId) return null;
  const sourceParent = sourceUnitsById.get(sourceUnit.parentId);
  if (!sourceParent) return null;
  const targetParent = lineageToTargetUnit.get(sourceParent.lineageKey);
  return targetParent?.id ?? null;
}

// The revision to clone for content copy: the live published one if present, else
// the highest-numbered revision. Returns null when the item has no revisions.
export function pickSourceRevision(item, revisions) {
  if (item.publishedRevisionId) {
    const pub = revisions.find((r) => r.id === item.publishedRevisionId);
    if (pub) return pub;
  }
  if (!revisions.length) return null;
  return revisions.reduce((top, r) => (r.revisionNo > top.revisionNo ? r : top), revisions[0]);
}

function emptyCounts() {
  return {
    orgUnits: { copied: 0, skipped: 0 },
    appointments: { copied: 0, skipped: 0 },
    contentItems: { copied: 0, skipped: 0, skippedNoTargetUnit: 0, skippedNoRevision: 0 },
    roleAssignments: { copied: 0, skipped: 0 },
  };
}

// ── copy phases (each idempotent; client = audit-suppressed prisma) ──────────

// Copy the source year's org units into the target year, reusing lineage rows.
// Two passes: create as roots, then wire parents from the lineage map so the
// org_unit_hierarchy_guard (same-year parent) always sees an existing parent.
async function copyStructure(client, sourceYearId, targetYearId, actorUserId, counts) {
  const sourceUnits = await client.orgUnit.findMany({
    where: { academicYearId: sourceYearId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }],
  });
  const targetUnits = await client.orgUnit.findMany({ where: { academicYearId: targetYearId } });
  const lineageToTarget = indexByLineage(targetUnits);

  const { toCopy, toSkip } = partitionByExisting(sourceUnits, new Set(lineageToTarget.keys()), (u) => u.lineageKey);
  counts.orgUnits.skipped += toSkip.length;

  // Pass 1 — create each new unit as a root (parent wired in pass 2).
  for (const u of toCopy) {
    const created = await client.orgUnit.create({
      data: {
        academicYearId: targetYearId,
        orgUnitTypeId: u.orgUnitTypeId,
        parentId: null,
        lineageKey: u.lineageKey, // REUSE the lineage row (DL-007) — never a new uuid
        slug: u.slug,
        name: u.name,
        sortOrder: u.sortOrder,
        status: "draft", // copied structure starts as a draft for re-confirmation
        createdById: actorUserId,
        updatedById: actorUserId,
      },
    });
    lineageToTarget.set(created.lineageKey, created);
    counts.orgUnits.copied += 1;
  }

  // Pass 2 — reconcile parent_id for EVERY source unit that has a target twin,
  // not just the ones created this run. This self-heals a prior PARTIAL run that
  // created a child as a root (parent_id NULL) but died before wiring its parent:
  // on resume the child is in toSkip, so a "toCopy-only" pass would never fix it.
  // Idempotent — we only issue an update when the twin's parent actually differs.
  const sourceById = new Map(sourceUnits.map((u) => [u.id, u]));
  for (const u of sourceUnits) {
    const self = lineageToTarget.get(u.lineageKey);
    if (!self) continue;
    const targetParentId = resolveTargetParentId(u, sourceById, lineageToTarget);
    if (targetParentId && self.parentId !== targetParentId) {
      await client.orgUnit.update({ where: { id: self.id }, data: { parentId: targetParentId } });
      self.parentId = targetParentId;
    }
  }
  return lineageToTarget; // reused by appointment/content phases
}

// Copy active appointments, mapping each source unit to its target-year twin via
// lineage. Skips rosters whose target unit was not copied, and active duplicates.
async function copyAppointments(client, sourceYearId, targetYearId, lineageToTarget, actorUserId, counts) {
  const sourceUnitsById = new Map(
    (await client.orgUnit.findMany({ where: { academicYearId: sourceYearId }, select: { id: true, lineageKey: true } })).map(
      (u) => [u.id, u]
    )
  );
  const sourceAppts = await client.appointment.findMany({
    where: { academicYearId: sourceYearId, archivedAt: null, status: { not: "archived" } },
  });
  const existing = await client.appointment.findMany({
    where: { academicYearId: targetYearId, archivedAt: null },
    select: { orgUnitId: true, positionId: true, personId: true, isSingleton: true },
  });
  const existingKeys = new Set(existing.map((a) => `${a.orgUnitId}:${a.positionId}:${a.personId}`));
  // Singleton slots (max_holders=1) already filled in the target: copying a
  // DIFFERENT holder into them would trip appointment_singleton_position_uq and
  // abort the whole run, so pre-skip them (a force re-sync with a changed
  // singleton holder leaves the existing target roster for manual reconciliation).
  const singletonFilled = new Set(existing.filter((a) => a.isSingleton).map((a) => `${a.orgUnitId}:${a.positionId}`));

  for (const a of sourceAppts) {
    const srcUnit = sourceUnitsById.get(a.orgUnitId);
    const targetUnit = srcUnit ? lineageToTarget.get(srcUnit.lineageKey) : null;
    if (!targetUnit) {
      counts.appointments.skipped += 1; // no target unit to attach the roster to
      continue;
    }
    if (existingKeys.has(`${targetUnit.id}:${a.positionId}:${a.personId}`)) {
      counts.appointments.skipped += 1;
      continue;
    }
    if (singletonFilled.has(`${targetUnit.id}:${a.positionId}`)) {
      counts.appointments.skipped += 1; // singleton slot already taken by another person
      continue;
    }
    await client.appointment.create({
      data: {
        academicYearId: targetYearId,
        orgUnitId: targetUnit.id,
        orgUnitTypeId: null, // appointment_type_guard auto-fills + sets is_singleton
        positionId: a.positionId,
        personId: a.personId,
        titleOverride: a.titleOverride,
        status: "draft",
        sortOrder: a.sortOrder,
        createdById: actorUserId,
        updatedById: actorUserId,
      },
    });
    existingKeys.add(`${targetUnit.id}:${a.positionId}:${a.personId}`);
    counts.appointments.copied += 1;
  }
}

// Clone content items into the target year as DRAFTS. Reuses each item's document
// lineage_key; for org-bound items, rebinds org_unit_id to the target-year unit
// (skips when that unit is absent). Clones the latest revision's payload (DL-026).
async function copyContent(client, sourceYearId, targetYearId, sourceLabel, actorUserId, counts) {
  const sourceItems = await client.contentItem.findMany({
    where: { academicYearId: sourceYearId, archivedAt: null },
  });
  // Build a fresh source-unit→target-unit map from the DB (works even when
  // copy_structure ran in a PRIOR transition, not this one).
  const sourceUnitsById = new Map(
    (await client.orgUnit.findMany({ where: { academicYearId: sourceYearId }, select: { id: true, lineageKey: true } })).map(
      (u) => [u.id, u]
    )
  );
  const targetUnitByLineage = indexByLineage(
    await client.orgUnit.findMany({ where: { academicYearId: targetYearId }, select: { id: true, lineageKey: true } })
  );
  const existing = await client.contentItem.findMany({
    where: { academicYearId: targetYearId },
    select: { contentType: true, lineageKey: true },
  });
  const existingKeys = new Set(existing.map((i) => `${i.contentType}:${i.lineageKey}`));

  for (const item of sourceItems) {
    if (existingKeys.has(`${item.contentType}:${item.lineageKey}`)) {
      counts.contentItems.skipped += 1;
      continue;
    }
    // Rebind org binding to the target year's unit (org-bound items only).
    let targetOrgUnitId = null;
    if (item.orgUnitId) {
      const srcUnit = sourceUnitsById.get(item.orgUnitId);
      const targetUnit = srcUnit ? targetUnitByLineage.get(srcUnit.lineageKey) : null;
      if (!targetUnit) {
        counts.contentItems.skippedNoTargetUnit += 1; // org-bound but no unit in target
        continue;
      }
      targetOrgUnitId = targetUnit.id;
    }

    const revisions = await client.contentRevision.findMany({ where: { contentItemId: item.id } });
    const sourceRev = pickSourceRevision(item, revisions);
    if (!sourceRev) {
      counts.contentItems.skippedNoRevision += 1; // nothing to clone
      continue;
    }

    const handler = getContentTypeHandler(item.contentType);
    // Make the 4-step clone (item → revision → payload → repoint draft) ATOMIC.
    // The overall transition is deliberately not one big transaction, but a
    // half-created item (header with no revision / no draft pointer) would be
    // skipped forever on re-run (its key already exists), leaving a permanently
    // broken row. A per-item tx rolls back a mid-item failure so the resume
    // re-creates it cleanly. (Auto-audit is still suppressed by the enclosing
    // withAuditContext, so this tx writes no per-statement audit rows.)
    await client.$transaction(async (tx) => {
      const newItem = await tx.contentItem.create({
        data: {
          contentType: item.contentType,
          academicYearId: targetYearId,
          orgUnitId: targetOrgUnitId,
          lineageKey: item.lineageKey, // reuse the document lineage for cross-year continuity
          slug: item.slug,
          status: "draft",
          pinned: item.pinned,
          createdById: actorUserId,
          updatedById: actorUserId,
        },
      });
      const newRev = await tx.contentRevision.create({
        data: {
          contentItemId: newItem.id,
          revisionNo: 1,
          revisionStatus: "draft",
          title: sourceRev.title,
          summary: sourceRev.summary,
          changeNote: `Copied from ${sourceLabel}`,
          createdById: actorUserId,
        },
      });
      if (handler) await handler.copyPayload(tx, sourceRev.id, newRev.id);
      await tx.contentItem.update({ where: { id: newItem.id }, data: { draftRevisionId: newRev.id } });
    }, TX_OPTS);
    existingKeys.add(`${item.contentType}:${item.lineageKey}`);
    counts.contentItems.copied += 1;
  }
}

// Copy active, year-scoped role assignments forward (default OFF — DL-026). The
// active-grant partial unique (user,role,lineage,year NULLS NOT DISTINCT) makes
// re-runs idempotent; we also pre-skip known duplicates to avoid noisy errors.
async function copyRoleAssignments(client, sourceYearId, targetYearId, actorUserId, counts) {
  const sourceGrants = await client.roleAssignment.findMany({
    where: { academicYearId: sourceYearId, revokedAt: null },
  });
  const existing = await client.roleAssignment.findMany({
    where: { academicYearId: targetYearId, revokedAt: null },
    select: { userId: true, roleId: true, orgUnitLineageKey: true },
  });
  const keyOf = (g) => `${g.userId}:${g.roleId}:${g.orgUnitLineageKey ?? ""}`;
  const existingKeys = new Set(existing.map(keyOf));

  for (const g of sourceGrants) {
    if (existingKeys.has(keyOf(g))) {
      counts.roleAssignments.skipped += 1;
      continue;
    }
    await client.roleAssignment.create({
      data: {
        userId: g.userId,
        roleId: g.roleId,
        orgUnitLineageKey: g.orgUnitLineageKey,
        academicYearId: targetYearId,
        grantedById: actorUserId,
      },
    });
    existingKeys.add(keyOf(g));
    counts.roleAssignments.copied += 1;
  }
}

// ── orchestrator ────────────────────────────────────────────────────────────

// Run the Transition Wizard.
// input: { sourceYearId, targetYearId, copyStructure?, copyAppointments?,
//          copyContent?, copyRoleAssignments?, force? }
export async function runTransition(input, actor = {}) {
  const {
    sourceYearId,
    targetYearId,
    copyStructure: doStructure = true,
    copyAppointments: doAppointments = false,
    copyContent: doContent = false,
    copyRoleAssignments: doRoles = false,
    force = false,
  } = input ?? {};

  if (!sourceYearId || !targetYearId) {
    throw new CmsValidationError("Both sourceYearId and targetYearId are required.");
  }
  if (sourceYearId === targetYearId) {
    throw new CmsValidationError("A year cannot be transitioned into itself.", { code: "TRANSITION_SELF" });
  }
  await assertActorPermission(actor, YEAR_OP_PERMISSIONS.transition);

  const [source, target] = await Promise.all([getYear(sourceYearId), getYear(targetYearId)]);
  if (!source) throw new CmsNotFoundError(`Source year ${sourceYearId} not found.`);
  if (!target) throw new CmsNotFoundError(`Target year ${targetYearId} not found.`);
  // We WRITE structure/content into the target; a locked target would trip the
  // lock_guard mid-batch, so reject up front with the friendly error.
  if (target.status === "locked") {
    throw new CmsValidationError(
      "The target year is locked and read-only. Unlock it before running a transition into it.",
      { status: 409, code: "YEAR_LOCKED" }
    );
  }

  const actorUserId = actor?.userId ?? null;

  // Re-run guard: a completed run for this pair is a no-op unless forced.
  const priorCompleted = await prisma.transitionRun.findFirst({
    where: { sourceYearId, targetYearId, status: "completed" },
  });
  if (priorCompleted && !force) {
    return { run: priorCompleted, counts: priorCompleted.counts, alreadyCompleted: true, idempotentSkip: true };
  }

  return withAuditContext({ actorUserId, suppressAuto: true }, async () => {
    // Reuse the existing completed run on a forced re-sync (never a 2nd 'completed'
    // row); otherwise open a fresh run.
    let run = priorCompleted;
    try {
      run = await withMappedDbErrors(() =>
        priorCompleted
          ? prisma.transitionRun.update({
              where: { id: priorCompleted.id },
              data: { status: "running", startedAt: new Date(), runById: actorUserId },
            })
          : prisma.transitionRun.create({
              data: {
                sourceYearId,
                targetYearId,
                copyStructure: doStructure,
                copyAppointments: doAppointments,
                copyContent: doContent,
                copyRoleAssignments: doRoles,
                status: "running",
                startedAt: new Date(),
                runById: actorUserId,
              },
            })
      );

      const counts = emptyCounts();
      // Record provenance on the target year (academic_year is not lock-guarded).
      if (!target.transitionedFromYearId) {
        await prisma.academicYear.update({
          where: { id: targetYearId },
          data: { transitionedFromYearId: sourceYearId, updatedById: actorUserId },
        });
      }

      let lineageToTarget;
      if (doStructure) {
        lineageToTarget = await withMappedDbErrors(() =>
          copyStructure(prisma, sourceYearId, targetYearId, actorUserId, counts)
        );
      } else {
        // Phases that need the map but didn't run structure resolve it from the DB.
        lineageToTarget = indexByLineage(await prisma.orgUnit.findMany({ where: { academicYearId: targetYearId } }));
      }
      if (doAppointments) {
        await withMappedDbErrors(() =>
          copyAppointments(prisma, sourceYearId, targetYearId, lineageToTarget, actorUserId, counts)
        );
      }
      if (doContent) {
        await withMappedDbErrors(() =>
          copyContent(prisma, sourceYearId, targetYearId, source.label, actorUserId, counts)
        );
      }
      if (doRoles) {
        await withMappedDbErrors(() => copyRoleAssignments(prisma, sourceYearId, targetYearId, actorUserId, counts));
      }

      const completed = await prisma.transitionRun.update({
        where: { id: run.id },
        data: { status: "completed", completedAt: new Date(), counts },
      });

      await recordAudit(prismaBase, {
        actorUserId,
        action: "transition",
        entityType: ENTITY,
        entityId: completed.id,
        academicYearId: targetYearId,
        after: { sourceYearId, targetYearId, options: { doStructure, doAppointments, doContent, doRoles }, counts },
        summary: `Transitioned ${source.label} → ${target.label} (units +${counts.orgUnits.copied}, content +${counts.contentItems.copied}, roster +${counts.appointments.copied})`,
      }).catch((e) => console.warn(`[audit] transition audit failed:`, e?.message ?? e));

      return { run: completed, counts, alreadyCompleted: false, idempotentSkip: false };
    } catch (err) {
      // Best-effort failure bookkeeping. A forced re-sync REUSED the prior
      // completed run row, so failing it must NOT destroy that successful run's
      // provenance — restore its prior status/counts/timestamps instead. A fresh
      // run is simply marked 'failed' with the error.
      if (run?.id) {
        const failureData = priorCompleted
          ? {
              status: priorCompleted.status,
              counts: priorCompleted.counts,
              startedAt: priorCompleted.startedAt,
              completedAt: priorCompleted.completedAt,
            }
          : { status: "failed", counts: { error: String(err?.message ?? err) } };
        await prisma.transitionRun.update({ where: { id: run.id }, data: failureData }).catch(() => {});
      }
      throw mapDbError(err);
    }
  });
}

// List transition runs for a target year (provenance view), newest first.
export async function listTransitionRuns({ targetYearId, sourceYearId } = {}, { client = prisma } = {}) {
  return client.transitionRun.findMany({
    where: {
      ...(targetYearId ? { targetYearId } : {}),
      ...(sourceYearId ? { sourceYearId } : {}),
    },
    orderBy: [{ createdAt: "desc" }],
  });
}
