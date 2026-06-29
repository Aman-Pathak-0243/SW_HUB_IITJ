// Live-DB integration tests for the Session-7 Resources module against the seeded
// Neon database. Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is set, so the
// default `npm test` stays green. Run with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/resources.db.test.mjs
//
// All work is in a throwaway 2091-92 year (removed in afterAll via the audit-
// bypassing base client; self-healed in beforeAll), with a ZZ-named council unit.
// Exercises:
//   1. a published resource (bound to a unit) is visible via listResourcesForUnit
//      AND surfaces in getPublicOrgUnit(...).resources, with its file URL resolved;
//   2. unpublish and archive hide it from the public read;
//   3. the resources importer is idempotent (2nd run creates 0) and SKIPS a
//      resource whose org unit is absent (missingUnit), never fabricating a unit.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

const YEAR_LABEL = "2091-92";
const UNIT_SLUG = "zz-resources-council";
const MEDIA_MARK = "zz-resources-test";

let prisma, prismaBase, content, units, pub, orgPub, importMod;
let actor, dev, yearId, unit, fileMediaId;

async function load() {
  const p = await import("../lib/prisma.mjs");
  prisma = p.prisma;
  prismaBase = p.prismaBase;
  content = await import("../lib/cms/content.mjs");
  units = await import("../lib/org/units.mjs");
  pub = await import("../lib/resources/public.mjs");
  orgPub = await import("../lib/org/public.mjs");
  importMod = await import("../lib/resources/import.mjs");
}

async function teardownYear(yId) {
  if (!yId) return;
  await prismaBase.academicYear.update({ where: { id: yId }, data: { status: "active" } }).catch(() => {});
  await prismaBase.auditLog.deleteMany({ where: { academicYearId: yId } }).catch(() => {});
  // content_item delete cascades to revisions + payloads (incl. resource_payload).
  await prismaBase.contentItem.deleteMany({ where: { academicYearId: yId } }).catch(() => {});
  const yUnits = await prismaBase.orgUnit.findMany({ where: { academicYearId: yId }, select: { id: true, lineageKey: true } }).catch(() => []);
  await prismaBase.orgUnit.deleteMany({ where: { academicYearId: yId } }).catch(() => {});
  for (const u of yUnits) {
    await prismaBase.orgUnitLineage.delete({ where: { lineageKey: u.lineageKey } }).catch(() => {});
  }
  await prismaBase.mediaAsset.deleteMany({ where: { altText: MEDIA_MARK } }).catch(() => {});
  // importer-created inventory rows carry no altText — clean them by the test cloud.
  await prismaBase.mediaAsset.deleteMany({ where: { url: { contains: "res.cloudinary.com/zztest/" } } }).catch(() => {});
  await prismaBase.academicYear.delete({ where: { id: yId } }).catch(() => {});
}

describe.skipIf(!RUN)("Resources (live Neon)", () => {
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

    const stale = await prismaBase.academicYear.findUnique({ where: { label: YEAR_LABEL }, select: { id: true } }).catch(() => null);
    if (stale) await teardownYear(stale.id);
    const y = await prismaBase.academicYear.create({
      data: { label: YEAR_LABEL, startDate: new Date("2091-07-01"), endDate: new Date("2092-06-30"), status: "active", isCurrent: false },
    });
    yearId = y.id;

    // a published council unit to bind resources to
    const res = await units.createOrgUnit({ academicYearId: yearId, typeKey: "council", slug: UNIT_SLUG, name: "ZZ Resources Council", status: "published" }, actor);
    unit = res.unit;

    // a file media asset for a PDF resource
    const m = await prismaBase.mediaAsset.create({
      data: { storageProvider: "external", url: "https://res.cloudinary.com/zztest/image/upload/zz-infra.pdf", kind: "pdf", altText: MEDIA_MARK },
    });
    fileMediaId = m.id;
  }, 120000);

  afterAll(async () => {
    if (!prismaBase || !yearId) return;
    await teardownYear(yearId);
    await prisma.$disconnect();
  }, 120000);

  dbit("a published resource is visible per-unit and via the org view, with its file URL resolved", async () => {
    const { item } = await content.createDraft(
      {
        contentType: "resource",
        academicYearId: yearId,
        orgUnitId: unit.id,
        slug: "zz-res-infra",
        title: "ZZ Infrastructure PDF",
        payload: { resourceKind: "pdf", fileMediaId, externalUrl: "https://drive.google.com/zz-detail", description: "ZZ infra details" },
      },
      actor
    );
    await content.publish(item.id, {}, actor);

    const list = await pub.listResourcesForUnit(unit.id, { yearId });
    expect(list.length).toBe(1);
    expect(list[0]).toMatchObject({
      slug: "zz-res-infra",
      title: "ZZ Infrastructure PDF",
      resourceKind: "pdf",
      externalUrl: "https://drive.google.com/zz-detail",
      fileUrl: "https://res.cloudinary.com/zztest/image/upload/zz-infra.pdf",
      fileKind: "pdf",
    });

    // and it surfaces on the data-driven org unit view
    const view = await orgPub.getPublicOrgUnit(UNIT_SLUG, { yearId });
    expect(view).not.toBeNull();
    expect(view.resources.map((r) => r.slug)).toContain("zz-res-infra");

    // unpublish hides it
    await content.unpublish(item.id, actor);
    expect((await pub.listResourcesForUnit(unit.id, { yearId })).length).toBe(0);

    // re-publish then archive hides it again
    await content.publish(item.id, {}, actor);
    expect((await pub.listResourcesForUnit(unit.id, { yearId })).length).toBe(1);
    await content.archive(item.id, actor);
    expect((await pub.listResourcesForUnit(unit.id, { yearId })).length).toBe(0);
  });

  dbit("the resources importer is idempotent and skips resources whose unit is absent", async () => {
    const plan = [
      { unitSlug: UNIT_SLUG, slug: "zz-res-import-one", title: "ZZ Imported Resource", resourceKind: "drive", file: null, externalUrl: "https://drive.google.com/zz-import", description: "zz" },
      { unitSlug: "zz-nonexistent-unit", slug: "zz-res-missing", title: "ZZ Missing Unit Resource", resourceKind: "link", file: null, externalUrl: "https://example.com/zz", description: null },
    ];

    const first = await importMod.importResources({ academicYearId: yearId, plan, withMedia: false }, actor);
    expect(first.counts.resources.created).toBe(1);
    expect(first.counts.resources.missingUnit).toBe(1);

    const second = await importMod.importResources({ academicYearId: yearId, plan, withMedia: false }, actor);
    expect(second.counts.resources.created).toBe(0);
    expect(second.counts.resources.skipped).toBe(1);
    expect(second.counts.resources.missingUnit).toBe(1);

    const list = await pub.listResourcesForUnit(unit.id, { yearId });
    expect(list.map((r) => r.slug)).toContain("zz-res-import-one");
  });

  dbit("resources importer resumes a partial run: an unpublished draft is published on the next run (DL-031)", async () => {
    const plan = [
      { unitSlug: UNIT_SLUG, slug: "zz-res-resume", title: "ZZ Resume Resource", resourceKind: "drive", file: null, externalUrl: "https://drive.google.com/zz-resume", description: null },
    ];
    // first run leaves it an unpublished draft (simulates a crash before publish)
    const first = await importMod.importResources({ academicYearId: yearId, plan, publish: false, withMedia: false }, actor);
    expect(first.counts.resources.created).toBe(1);
    expect((await pub.listResourcesForUnit(unit.id, { yearId })).map((r) => r.slug)).not.toContain("zz-res-resume"); // draft → not public

    // resume run: skips creating, re-publishes the stranded draft
    const second = await importMod.importResources({ academicYearId: yearId, plan, publish: true, withMedia: false }, actor);
    expect(second.counts.resources.created).toBe(0);
    expect(second.counts.resources.skipped).toBe(1);
    expect((await pub.listResourcesForUnit(unit.id, { yearId })).map((r) => r.slug)).toContain("zz-res-resume"); // now published
  });

  dbit("resources importer dedups a shared file to ONE media_asset (created=1, reused=1)", async () => {
    // a second unit so two resources can share one file URL (the V1 case: three
    // councils share the Student Club Activities PDF → one media_asset row)
    const res2 = await units.createOrgUnit({ academicYearId: yearId, typeKey: "council", slug: "zz-resources-council-2", name: "ZZ Resources Council 2", status: "published" }, actor);
    const SHARED = "https://res.cloudinary.com/zztest/image/upload/zz-shared.pdf";
    const plan = [
      { unitSlug: UNIT_SLUG, slug: "zz-res-shared-a", title: "ZZ Shared A", resourceKind: "pdf", file: SHARED, externalUrl: null, description: null },
      { unitSlug: "zz-resources-council-2", slug: "zz-res-shared-b", title: "ZZ Shared B", resourceKind: "pdf", file: SHARED, externalUrl: null, description: null },
    ];
    const r = await importMod.importResources({ academicYearId: yearId, plan, withMedia: true }, actor);
    expect(r.counts.resources.created).toBe(2);
    expect(r.counts.media.created).toBe(1);
    expect(r.counts.media.reused).toBe(1);

    // exactly ONE media_asset row backs both resources, and both resolve to it
    expect(await prismaBase.mediaAsset.count({ where: { url: SHARED } })).toBe(1);
    const a = await pub.listResourcesForUnit(unit.id, { yearId });
    const b = await pub.listResourcesForUnit(res2.unit.id, { yearId });
    expect(a.find((x) => x.slug === "zz-res-shared-a")?.fileUrl).toBe(SHARED);
    expect(b.find((x) => x.slug === "zz-res-shared-b")?.fileUrl).toBe(SHARED);
  });
});
