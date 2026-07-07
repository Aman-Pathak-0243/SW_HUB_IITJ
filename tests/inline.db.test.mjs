// Live-DB coverage for the inline edit-on-page seam (Session 15, DL-103) — specifically
// the DRAFT_OPEN refusal the KNOWN_ISSUES #50 note flagged as untested. Self-skips unless
// RUN_DB_TESTS=1. Run isolated (KNOWN_ISSUES #39):
//   RUN_DB_TESTS=1 dotenv -e .env.test -- vitest run tests/inline.db.test.mjs --pool=forks --poolOptions.forks.singleFork
//
// Asserts: editAndPublish REFUSES (409 DRAFT_OPEN) when a foreign unpublished draft is
// already open (so it never publishes an editor's WIP), leaves that draft untouched, and
// — once the draft is published/cleared — forks from the published revision and publishes
// exactly the inline patch.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const T = 420000;
const dbit = (name, fn) => it(name, fn, T);

let prismaBase, content, dev, actor, currentYear;
const createdItemIds = [];

async function publishedSummary(itemId) {
  const item = await prismaBase.contentItem.findUnique({ where: { id: itemId }, select: { publishedRevisionId: true, draftRevisionId: true } });
  const rev = item.publishedRevisionId ? await prismaBase.contentRevision.findUnique({ where: { id: item.publishedRevisionId }, select: { summary: true } }) : null;
  return { summary: rev?.summary ?? null, draftRevisionId: item.draftRevisionId };
}

describe.skipIf(!RUN)("Inline edit-on-page — editAndPublish DRAFT_OPEN refusal (live Postgres)", () => {
  beforeAll(async () => {
    const p = await import("../lib/prisma.mjs");
    prismaBase = p.prismaBase;
    content = await import("../lib/cms/content.mjs");
    for (let i = 1; i <= 12; i++) { try { await prismaBase.$queryRaw`SELECT 1`; break; } catch { await new Promise((r) => setTimeout(r, 5000)); } }
    dev = await prismaBase.user.findFirst({ where: { isDeveloper: true } });
    actor = { userId: dev.id };
    currentYear = await prismaBase.academicYear.findFirst({ where: { isCurrent: true } });
  }, 300000);

  afterAll(async () => {
    if (!prismaBase) return;
    for (const id of createdItemIds) await prismaBase.contentItem.delete({ where: { id } }).catch(() => {});
    if (createdItemIds.length) await prismaBase.auditLog.deleteMany({ where: { entityId: { in: createdItemIds } } }).catch(() => {});
    await prismaBase.$disconnect();
  }, 120000);

  dbit("refuses to publish over a foreign open draft, then forks + publishes once it is cleared", async () => {
    // A published event with summary v1.
    const { item } = await content.createDraft(
      { contentType: "event", academicYearId: currentYear.id, slug: `zz-inline-${randomUUID().slice(0, 8)}`, title: "ZZ Inline", summary: "v1", payload: {} },
      actor
    );
    createdItemIds.push(item.id);
    await content.publish(item.id, {}, actor);

    // An editor opens an unpublished draft in the admin panel (summary v2, NOT published).
    await content.editDraft(item.id, { summary: "v2" }, actor);
    const mid = await publishedSummary(item.id);
    expect(mid.summary).toBe("v1"); // published unchanged
    expect(mid.draftRevisionId).toBeTruthy(); // a WIP draft is open

    // Inline "save & publish" must REFUSE (409 DRAFT_OPEN) and leave the draft untouched.
    await expect(content.editAndPublish(item.id, { summary: "v3" }, actor)).rejects.toMatchObject({ status: 409, code: "DRAFT_OPEN" });
    const after = await publishedSummary(item.id);
    expect(after.summary).toBe("v1"); // did NOT publish anything
    expect(after.draftRevisionId).toBe(mid.draftRevisionId); // the foreign draft is intact

    // Publish the open draft (as the editor would), clearing it → inline edit now works.
    await content.publish(item.id, {}, actor);
    expect((await publishedSummary(item.id)).draftRevisionId).toBeNull();

    const res = await content.editAndPublish(item.id, { summary: "v4" }, actor);
    expect(res).toBeTruthy();
    const final = await publishedSummary(item.id);
    expect(final.summary).toBe("v4"); // forked from published + published exactly the inline patch
    expect(final.draftRevisionId).toBeNull(); // no lingering draft
  });
});
