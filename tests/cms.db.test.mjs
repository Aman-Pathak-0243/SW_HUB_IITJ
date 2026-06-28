// Live-DB integration tests for the Session-3 CMS Foundation against the seeded
// Neon database. Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set, so the
// default `npm test` (and CI without DB creds) stays green. Run with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/cms.db.test.mjs
//
// Exercises: draft/publish lifecycle, edit, restore (overwrite-in-place + new
// draft), version history + diff, the central audit-log coverage (exactly one
// SEMANTIC row per operation, no per-statement duplication), and the public
// visibility rule incl. event publish windows.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;

// CMS operations run multi-statement interactive transactions; against a remote
// / cold Neon compute each round-trip can cost ~1–2s, so a multi-op test needs a
// generous ceiling. (Warm, in-region these finish in well under a second.)
const DB_TEST_TIMEOUT = 180000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

let prisma, prismaBase, cms, visibility;
const created = { items: [], orgUnits: [], lineages: [] };

async function load() {
  const p = await import("../lib/prisma.mjs");
  prisma = p.prisma;
  prismaBase = p.prismaBase;
  cms = await import("../lib/cms/content.mjs");
  visibility = await import("../lib/cms/visibility.mjs");
}

let actor, yearId, clubTypeId;

describe.skipIf(!RUN)("CMS Foundation (live Neon)", () => {
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
    const dev = await prisma.user.findFirst({ where: { isDeveloper: true } });
    actor = { userId: dev.id };
    const year = await prisma.academicYear.findFirstOrThrow({ where: { isCurrent: true } });
    yearId = year.id;
    clubTypeId = (await prisma.orgUnitType.findUniqueOrThrow({ where: { key: "club" } })).id;
  }, 90000);

  afterAll(async () => {
    // Clean up via the BASE client (bypasses the audit extension) and batch the
    // deletes — at this latency, per-row loops would blow the hook timeout.
    // audit_log has no FK to entities, so its rows are cleared explicitly.
    if (prismaBase) {
      if (created.items.length) {
        await prismaBase.auditLog.deleteMany({ where: { entityId: { in: created.items } } }).catch(() => {});
        await prismaBase.contentItem.deleteMany({ where: { id: { in: created.items } } }).catch(() => {});
      }
      if (created.orgUnits.length) await prismaBase.orgUnit.deleteMany({ where: { id: { in: created.orgUnits } } }).catch(() => {});
      if (created.lineages.length) await prismaBase.orgUnitLineage.deleteMany({ where: { lineageKey: { in: created.lineages } } }).catch(() => {});
    }
    if (prisma) await prisma.$disconnect();
  }, 120000);

  async function makeClub(suffix) {
    const lineage = await prisma.orgUnitLineage.create({ data: { canonicalName: `ZZ CMS Club ${suffix}` } });
    created.lineages.push(lineage.lineageKey);
    const unit = await prisma.orgUnit.create({
      data: { academicYearId: yearId, orgUnitTypeId: clubTypeId, lineageKey: lineage.lineageKey, slug: `zz-cms-${suffix}`, name: `ZZ CMS Club ${suffix}` },
    });
    created.orgUnits.push(unit.id);
    return unit;
  }

  dbit("full lifecycle: create → publish → edit → publish, with revision history", async () => {
    const suffix = `${Date.now()}-a`;
    const unit = await makeClub(suffix);
    const { item, revision } = await cms.createDraft(
      {
        contentType: "club_profile",
        academicYearId: yearId,
        orgUnitId: unit.id,
        slug: `coding-${suffix}`,
        title: "Coding Club",
        changeNote: "initial",
        payload: { vision: "v1", missionPoints: [{ text: "ship" }] },
      },
      actor
    );
    created.items.push(item.id);
    expect(item.status).toBe("draft");
    expect(item.draftRevisionId).toBe(revision.id);
    expect(item.publishedRevisionId).toBeNull();
    expect(revision.revisionNo).toBe(1);

    // editing the already-open draft edits IN PLACE (no second draft) — honors
    // the one-open-draft partial unique.
    const inPlace = await cms.editDraft(item.id, { payload: { vision: "v1b" } }, actor);
    expect(inPlace.openedNewDraft).toBe(false);
    expect(inPlace.draftRevisionId).toBe(revision.id);
    expect(await prisma.contentRevision.count({ where: { contentItemId: item.id, revisionStatus: "draft" } })).toBe(1);

    // publish #1
    const pub1 = await cms.publish(item.id, {}, actor);
    expect(pub1.item.status).toBe("published");
    expect(pub1.item.publishedRevisionId).toBe(revision.id);
    expect(pub1.item.draftRevisionId).toBeNull();
    let live = await prisma.contentRevision.findUnique({ where: { id: revision.id } });
    expect(live.revisionStatus).toBe("published");

    // edit (opens a fresh draft from the published revision)
    const edit = await cms.editDraft(item.id, { payload: { vision: "v2", missionPoints: [{ text: "ship" }, { text: "learn" }] }, changeNote: "v2" }, actor);
    expect(edit.openedNewDraft).toBe(true);
    const draft2 = await prisma.contentRevision.findUnique({ where: { id: edit.draftRevisionId } });
    expect(draft2.revisionNo).toBe(2);
    expect(draft2.revisionStatus).toBe("draft");
    // the live (published) revision is untouched by the new draft's edits: it
    // still holds "v1b" (the value published at #1), not the draft's "v2".
    const stillLive = await cms.getRevision(revision.id);
    expect(stillLive.payload.vision).toBe("v1b");

    // publish #2 — supersedes revision 1
    const pub2 = await cms.publish(item.id, {}, actor);
    expect(pub2.item.publishedRevisionId).toBe(edit.draftRevisionId);
    const rev1After = await prisma.contentRevision.findUnique({ where: { id: revision.id } });
    expect(rev1After.revisionStatus).toBe("superseded");

    // version history: two revisions, monotonic numbers
    const history = await cms.listRevisions(item.id);
    expect(history.map((r) => r.revisionNo)).toEqual([1, 2]);
  });

  dbit("DB enforces at-most-one published / one draft (cache pointers stay consistent)", async () => {
    const suffix = `${Date.now()}-b`;
    const unit = await makeClub(suffix);
    const { item } = await cms.createDraft(
      { contentType: "club_profile", academicYearId: yearId, orgUnitId: unit.id, slug: `b-${suffix}`, title: "B", payload: { vision: "x" } },
      actor
    );
    created.items.push(item.id);
    await cms.publish(item.id, {}, actor);
    // exactly one published revision row for this item
    const publishedCount = await prisma.contentRevision.count({ where: { contentItemId: item.id, revisionStatus: "published" } });
    expect(publishedCount).toBe(1);
    const fresh = await prisma.contentItem.findUnique({ where: { id: item.id } });
    expect(fresh.draftRevisionId).toBeNull();
    expect(fresh.publishedRevisionId).toBeTruthy();
  });

  dbit("restore overwrites the open draft in place and records provenance", async () => {
    const suffix = `${Date.now()}-c`;
    const unit = await makeClub(suffix);
    const { item, revision: r1 } = await cms.createDraft(
      { contentType: "club_profile", academicYearId: yearId, orgUnitId: unit.id, slug: `c-${suffix}`, title: "C1", payload: { vision: "first", missionPoints: [{ text: "m1" }] } },
      actor
    );
    created.items.push(item.id);
    await cms.publish(item.id, {}, actor); // r1 published

    // open a second draft + publish so we have a v2 to diff/restore from
    await cms.editDraft(item.id, { title: "C2", payload: { vision: "second", missionPoints: [{ text: "m1" }, { text: "m2" }] } }, actor);
    await cms.publish(item.id, {}, actor);

    // restore r1 — no open draft, so a NEW draft (revision 3) is created from r1
    const res = await cms.restore(item.id, r1.id, {}, actor);
    expect(res.openedNewDraft).toBe(true);
    const draft = await prisma.contentRevision.findUnique({ where: { id: res.draftRevisionId } });
    expect(draft.revisionStatus).toBe("draft");
    expect(draft.revisionNo).toBe(3);
    expect(draft.isRestoreOfRevisionId).toBe(r1.id);
    const draftView = await cms.getRevision(res.draftRevisionId);
    expect(draftView.payload.vision).toBe("first");
    expect(draftView.payload.missionPoints).toEqual([{ text: "m1", sortOrder: 0 }]);

    // restore AGAIN while a draft is open → overwrites that same draft in place
    const res2 = await cms.restore(item.id, r1.id, { changeNote: "second restore" }, actor);
    expect(res2.openedNewDraft).toBe(false);
    expect(res2.draftRevisionId).toBe(res.draftRevisionId); // same row reused
    const draftCount = await prisma.contentRevision.count({ where: { contentItemId: item.id, revisionStatus: "draft" } });
    expect(draftCount).toBe(1); // honored the one-open-draft partial unique

    // diff: published v2 vs draft (restored v1) shows the changed fields
    const fresh = await prisma.contentItem.findUnique({ where: { id: item.id } });
    const diff = await cms.diffRevisions(fresh.publishedRevisionId, res2.draftRevisionId);
    expect(diff.changed).toContain("vision");
    expect(diff.changed).toContain("missionPoints");
    expect(diff.changes.vision).toEqual({ from: "second", to: "first" });

    // each restore is audited exactly once (invariant 6 includes restore)
    const restoreRows = await prisma.auditLog.findMany({ where: { entityType: "content_item", entityId: item.id, action: "restore" } });
    expect(restoreRows).toHaveLength(2);
    expect(restoreRows[0].actorUserId).toBe(actor.userId);
  });

  dbit("central audit log records exactly one semantic row per operation", async () => {
    const suffix = `${Date.now()}-d`;
    const unit = await makeClub(suffix);
    const { item } = await cms.createDraft(
      { contentType: "club_profile", academicYearId: yearId, orgUnitId: unit.id, slug: `d-${suffix}`, title: "D", payload: { vision: "v" } },
      actor
    );
    created.items.push(item.id);
    await cms.publish(item.id, {}, actor);
    await cms.editDraft(item.id, { payload: { vision: "v2" } }, actor);
    await cms.unpublish(item.id, actor);
    await cms.archive(item.id, actor);

    const rows = await prisma.auditLog.findMany({
      where: { entityType: "content_item", entityId: item.id },
      orderBy: { id: "asc" },
    });
    expect(rows.map((r) => r.action)).toEqual(["create", "publish", "update", "unpublish", "archive"]);
    // every row attributes the developer actor + carries the year context
    for (const r of rows) {
      expect(r.actorUserId).toBe(actor.userId);
      expect(r.academicYearId).toBe(yearId);
    }
    // transitions captured before/after snapshots
    const publishRow = rows.find((r) => r.action === "publish");
    expect(publishRow.before.status).toBe("draft");
    expect(publishRow.after.status).toBe("published");
  });

  dbit("public visibility: only published, current-year, in-window items are returned", async () => {
    const suffix = `${Date.now()}-e`;
    const now = new Date();
    const past = new Date(now.getTime() - 86400000);
    const future = new Date(now.getTime() + 86400000);

    // open-window event (visible)
    const open = await cms.createDraft(
      { contentType: "event", academicYearId: yearId, slug: `ev-open-${suffix}`, title: "Open Event", payload: { body: "b", publishFrom: past, publishUntil: future } },
      actor
    );
    created.items.push(open.item.id);
    await cms.publish(open.item.id, {}, actor);

    // future-window event (published but not yet within window → hidden)
    const futureEv = await cms.createDraft(
      { contentType: "event", academicYearId: yearId, slug: `ev-future-${suffix}`, title: "Future Event", payload: { body: "b", publishFrom: future } },
      actor
    );
    created.items.push(futureEv.item.id);
    await cms.publish(futureEv.item.id, {}, actor);

    // draft-only event (never published → hidden)
    const draftEv = await cms.createDraft(
      { contentType: "event", academicYearId: yearId, slug: `ev-draft-${suffix}`, title: "Draft Event", payload: { body: "b" } },
      actor
    );
    created.items.push(draftEv.item.id);

    const visible = await visibility.listPublicContent({ contentType: "event", now });
    const ids = visible.map((v) => v.item.id);
    expect(ids).toContain(open.item.id);
    expect(ids).not.toContain(futureEv.item.id);
    expect(ids).not.toContain(draftEv.item.id);

    // by-slug fetch respects the same rule
    const bySlug = await visibility.getPublicItemBySlug("event", `ev-open-${suffix}`, { now });
    expect(bySlug?.item.id).toBe(open.item.id);
    expect(await visibility.getPublicItemBySlug("event", `ev-future-${suffix}`, { now })).toBeNull();
  });

  dbit("surfaces friendly errors (not raw dumps) for bad operations / input", async () => {
    const suffix = `${Date.now()}-f`;
    const unit = await makeClub(suffix);
    const { item } = await cms.createDraft(
      { contentType: "club_profile", academicYearId: yearId, orgUnitId: unit.id, slug: `f-${suffix}`, title: "F", payload: { vision: "v" } },
      actor
    );
    created.items.push(item.id);
    await cms.publish(item.id, {}, actor); // consumes the draft
    // publishing with no open draft → friendly 422 (app-side validation)
    await expect(cms.publish(item.id, {}, actor)).rejects.toMatchObject({ code: "CMS_VALIDATION", status: 422 });
    // creating an announcement without its required body → friendly 422, not a 500
    // (the required-field check runs inside the tx but maps cleanly).
    await expect(
      cms.createDraft({ contentType: "announcement", academicYearId: yearId, slug: `ann-${suffix}`, title: "A", payload: {} }, actor)
    ).rejects.toMatchObject({ code: "CMS_VALIDATION", status: 422 });
  });

  dbit("unpublish then republish honors the supersede ordering and pointers", async () => {
    const suffix = `${Date.now()}-g`;
    const unit = await makeClub(suffix);
    const { item, revision: r1 } = await cms.createDraft(
      { contentType: "club_profile", academicYearId: yearId, orgUnitId: unit.id, slug: `g-${suffix}`, title: "G", payload: { vision: "v1" } },
      actor
    );
    created.items.push(item.id);
    await cms.publish(item.id, {}, actor);

    // unpublish with NO open draft → the published revision becomes the editable draft
    const un = await cms.unpublish(item.id, actor);
    expect(un.item.status).toBe("draft");
    expect(un.item.publishedRevisionId).toBeNull();
    expect(un.item.draftRevisionId).toBe(r1.id);
    expect((await prisma.contentRevision.findUnique({ where: { id: r1.id } })).revisionStatus).toBe("draft");

    // republish the same revision → exactly one published, no orphan drafts
    const re = await cms.publish(item.id, {}, actor);
    expect(re.item.publishedRevisionId).toBe(r1.id);
    expect(re.item.draftRevisionId).toBeNull();
    expect(await prisma.contentRevision.count({ where: { contentItemId: item.id, revisionStatus: "published" } })).toBe(1);
    expect(await prisma.contentRevision.count({ where: { contentItemId: item.id, revisionStatus: "draft" } })).toBe(0);
  });

  dbit("locked year: edits map to YEAR_LOCKED (real trigger) while revision append is allowed", async () => {
    const suffix = `${Date.now()}-h`;
    // a throwaway, non-current year we can lock without disturbing the live one
    const lockYear = await prisma.academicYear.create({
      data: { label: `2099-00`, startDate: new Date("2099-07-01"), endDate: new Date("2100-06-30"), status: "active", isCurrent: false },
    });
    const lineage = await prisma.orgUnitLineage.create({ data: { canonicalName: `ZZ Lock ${suffix}` } });
    created.lineages.push(lineage.lineageKey);
    const unit = await prisma.orgUnit.create({
      data: { academicYearId: lockYear.id, orgUnitTypeId: clubTypeId, lineageKey: lineage.lineageKey, slug: `zz-lock-${suffix}`, name: "ZZ Lock" },
    });
    created.orgUnits.push(unit.id);
    const { item, revision } = await cms.createDraft(
      { contentType: "club_profile", academicYearId: lockYear.id, orgUnitId: unit.id, slug: `lock-${suffix}`, title: "L", payload: { vision: "v" } },
      actor
    );
    created.items.push(item.id);

    try {
      // lock the year, then attempt an in-place edit → the lock_guard trigger
      // fires and mapDbError turns the REAL Postgres RAISE into YEAR_LOCKED.
      await prisma.academicYear.update({ where: { id: lockYear.id }, data: { status: "locked" } });
      await expect(cms.editDraft(item.id, { payload: { vision: "v2" } }, actor)).rejects.toMatchObject({ code: "YEAR_LOCKED", status: 409 });

      // the append-errata path: a NEW content_revision INSERT is allowed in a
      // locked year (lock_guard exempts content_revision INSERT).
      const top = await prismaBase.contentRevision.findFirst({ where: { contentItemId: item.id }, orderBy: { revisionNo: "desc" } });
      const appended = await prismaBase.contentRevision.create({
        data: { contentItemId: item.id, revisionNo: top.revisionNo + 1, revisionStatus: "superseded", title: "errata", createdById: actor.userId },
      });
      expect(appended.id).toBeTruthy();
    } finally {
      // unlock so afterAll cleanup (which deletes the content/unit) is not blocked
      await prisma.academicYear.update({ where: { id: lockYear.id }, data: { status: "active" } }).catch(() => {});
    }
    // delete this year's fixtures here so the year row can be removed too
    await prismaBase.auditLog.deleteMany({ where: { entityId: item.id } }).catch(() => {});
    await prismaBase.contentItem.delete({ where: { id: item.id } }).catch(() => {});
    await prismaBase.orgUnit.delete({ where: { id: unit.id } }).catch(() => {});
    await prismaBase.orgUnitLineage.delete({ where: { lineageKey: lineage.lineageKey } }).catch(() => {});
    await prismaBase.academicYear.delete({ where: { id: lockYear.id } }).catch(() => {});
    // remove from the afterAll lists since we already cleaned them
    created.items = created.items.filter((i) => i !== item.id);
    created.orgUnits = created.orgUnits.filter((u) => u !== unit.id);
    created.lineages = created.lineages.filter((l) => l !== lineage.lineageKey);
  });
});
