// Live-DB integration tests for the Session-7 Admin Media Migration Tool against
// the seeded Neon database. Self-skips unless RUN_DB_TESTS=1 and DATABASE_URL is
// set, so the default `npm test` stays green. Run with:
//   RUN_DB_TESTS=1 dotenv -e .env.local -- vitest run tests/media.db.test.mjs
//
// Uses a DETERMINISTIC FAKE uploader (no network / no credentials) and scopes the
// migration to its OWN rows via `filter: { altText: MARK }`, so it never touches
// real /public inventory rows the org importer may have created. Exercises:
//   1. /public asset → Cloudinary (public_id + url + migrated_at set);
//   2. idempotency (a second run migrates 0);
//   3. base64 placeholder reconciliation via a resolver (DL-039);
//   4. reversibility (rollback restores storage_provider='local' + url ← /public,
//      and is itself idempotent; the base64-reconciled row is NOT rolled back).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BASE64_PLACEHOLDER_URL } from "../lib/org/normalize.mjs";

const RUN = process.env.RUN_DB_TESTS === "1" && !!process.env.DATABASE_URL;
const DB_TEST_TIMEOUT = 420000;
const dbit = (name, fn) => it(name, fn, DB_TEST_TIMEOUT);

const MARK = "zz-media-migrate-test"; // altText marker scoping the migration
const SVC_MARK = "zz-media-service-test"; // altText marker scoping the curated-service rows
const PUBLIC_PATH = "/zz-media-migrate-test.png";

let prismaBase, migrate, service;
let actor, dev;
let baselineAuditId = 0n; // audit rows created BEFORE the test are never touched by cleanup

// Deterministic fake Cloudinary uploader — returns a stable {publicId,url} from
// the requested publicId, never reads disk or the network.
const fakeUploader = async (_absPath, { publicId }) => ({
  publicId,
  url: `https://res.cloudinary.com/zztest/image/upload/${publicId}`,
  bytes: 1234,
  width: 10,
  height: 10,
});

const FAKE_CFG = { cloudName: "zztest", apiKey: "k", apiSecret: "s", folder: "zz-test" };

async function load() {
  const p = await import("../lib/prisma.mjs");
  prismaBase = p.prismaBase;
  migrate = await import("../lib/media/migrate.mjs");
  service = await import("../lib/media/service.mjs");
}

async function cleanup() {
  // Remove every media row this test created (by the altText markers).
  await prismaBase.mediaAsset.deleteMany({ where: { altText: { in: [MARK, SVC_MARK] } } }).catch(() => {});
  // Remove ONLY the media_asset audit rows this run created (id > baseline) — never
  // a real prior migration's summary row (the migration audit row carries no
  // per-run marker, so scope by id instead of a summary substring).
  await prismaBase.auditLog.deleteMany({ where: { entityType: "media_asset", id: { gt: baselineAuditId } } }).catch(() => {});
}

describe.skipIf(!RUN)("Media Migration Tool (live Neon)", () => {
  beforeAll(async () => {
    await load();
    for (let i = 1; i <= 12; i++) {
      try {
        await prismaBase.$queryRaw`SELECT 1`;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
    dev = await prismaBase.user.findFirst({ where: { isDeveloper: true } });
    actor = { userId: dev.id };
    const top = await prismaBase.auditLog.findFirst({ orderBy: { id: "desc" }, select: { id: true } }).catch(() => null);
    baselineAuditId = top?.id ?? 0n;
    await cleanup();
  }, 120000);

  afterAll(async () => {
    if (!prismaBase) return;
    await cleanup();
    await prismaBase.$disconnect();
  }, 120000);

  dbit("migrates a /public asset to Cloudinary, idempotently, then rolls it back", async () => {
    // a /public inventory row (as the org importer would create) + a base64 placeholder
    const pub = await prismaBase.mediaAsset.create({
      data: { storageProvider: "local", url: PUBLIC_PATH, originalPath: PUBLIC_PATH, kind: "image", altText: MARK },
    });
    const b64 = await prismaBase.mediaAsset.create({
      data: { storageProvider: "local", url: BASE64_PLACEHOLDER_URL, originalPath: null, kind: "image", altText: MARK },
    });

    // dry-run first: computes the plan, writes nothing
    const dry = await migrate.migratePublicAssets(
      { dryRun: true, uploader: fakeUploader, config: FAKE_CFG, folder: "zz-test", filter: { altText: MARK } },
      actor
    );
    expect(dry.counts.migrated).toBe(0); // dry-run does not mutate
    expect(dry.plan.some((p) => p.action === "upload")).toBe(true);
    expect(dry.base64Pending).toBe(1);
    const stillLocal = await prismaBase.mediaAsset.findUnique({ where: { id: pub.id } });
    expect(stillLocal.cloudinaryPublicId).toBeNull();

    // apply: uploads the /public asset, leaves the base64 placeholder pending
    const run = await migrate.migratePublicAssets(
      { uploader: fakeUploader, config: FAKE_CFG, folder: "zz-test", filter: { altText: MARK } },
      actor
    );
    expect(run.counts.migrated).toBe(1);
    expect(run.counts.base64Pending).toBe(1);

    const migrated = await prismaBase.mediaAsset.findUnique({ where: { id: pub.id } });
    expect(migrated.storageProvider).toBe("cloudinary");
    expect(migrated.cloudinaryPublicId).toBe("zz-test/zz-media-migrate-test");
    expect(migrated.url).toBe("https://res.cloudinary.com/zztest/image/upload/zz-test/zz-media-migrate-test");
    expect(migrated.migratedAt).not.toBeNull();
    expect(migrated.originalPath).toBe(PUBLIC_PATH); // preserved for rollback

    // idempotency: a second apply migrates 0 (already-migrated row excluded)
    const again = await migrate.migratePublicAssets(
      { uploader: fakeUploader, config: FAKE_CFG, folder: "zz-test", filter: { altText: MARK } },
      actor
    );
    expect(again.counts.migrated).toBe(0);

    // base64 reconciliation via a resolver (DL-039) — yields a hosted URL
    const recon = await migrate.migratePublicAssets(
      {
        uploader: fakeUploader,
        config: FAKE_CFG,
        folder: "zz-test",
        filter: { altText: MARK },
        base64Resolver: async (a) => ({ publicId: `zz-test/recon-${a.id}`, url: `https://res.cloudinary.com/zztest/image/upload/zz-test/recon-${a.id}` }),
      },
      actor
    );
    expect(recon.counts.base64Reconciled).toBe(1);
    const reconciled = await prismaBase.mediaAsset.findUnique({ where: { id: b64.id } });
    expect(reconciled.storageProvider).toBe("cloudinary");
    expect(reconciled.cloudinaryPublicId).toBe(`zz-test/recon-${b64.id}`);

    // rollback: restores the /public asset; the base64-reconciled row (no
    // original_path) is NOT touched.
    const back = await migrate.rollbackMigration({ filter: { altText: MARK } }, actor);
    expect(back.counts.rolledBack).toBe(1);
    const restored = await prismaBase.mediaAsset.findUnique({ where: { id: pub.id } });
    expect(restored.storageProvider).toBe("local");
    expect(restored.url).toBe(PUBLIC_PATH);
    expect(restored.cloudinaryPublicId).toBeNull();
    expect(restored.migratedAt).toBeNull();
    const reconStill = await prismaBase.mediaAsset.findUnique({ where: { id: b64.id } });
    expect(reconStill.cloudinaryPublicId).toBe(`zz-test/recon-${b64.id}`); // untouched by rollback

    // rollback is idempotent: a second rollback restores 0
    const back2 = await migrate.rollbackMigration({ filter: { altText: MARK } }, actor);
    expect(back2.counts.rolledBack).toBe(0);
  });

  dbit("curated media service: createMediaAsset writes ONE audit row; update ignores migration fields; archive is idempotent; RBAC enforced", async () => {
    // create (audited) — exactly one semantic audit row for this asset
    const { asset } = await service.createMediaAsset(
      { url: "https://res.cloudinary.com/zztest/image/upload/zz-svc.jpg", storageProvider: "local", kind: "image", altText: SVC_MARK, bytes: 4242 },
      actor
    );
    expect(asset.id).toBeTruthy();
    const created = await prismaBase.auditLog.findMany({ where: { entityType: "media_asset", entityId: asset.id } });
    expect(created.length).toBe(1);
    expect(created[0].action).toBe("create");

    // read resolves a delivery URL + coerces bytes to Number
    const got = await service.getMediaAsset(asset.id);
    expect(got.deliveryUrl).toBe("https://res.cloudinary.com/zztest/image/upload/zz-svc.jpg");
    expect(got.bytes).toBe(4242);

    // update applies altText/kind but IGNORES migration-owned storageProvider/cloudinaryPublicId
    await service.updateMediaAsset(asset.id, { storageProvider: "cloudinary", cloudinaryPublicId: "hacked/x", kind: "svg" }, actor);
    const upd = await prismaBase.mediaAsset.findUnique({ where: { id: asset.id } });
    expect(upd.kind).toBe("svg"); // patchable
    expect(upd.storageProvider).toBe("local"); // migration-owned → unchanged
    expect(upd.cloudinaryPublicId).toBeNull(); // migration-owned → unchanged

    // archive is idempotent (second call is a no-op, no throw)
    await service.archiveMediaAsset(asset.id, actor);
    const arch1 = await prismaBase.mediaAsset.findUnique({ where: { id: asset.id } });
    expect(arch1.archivedAt).not.toBeNull();
    await service.archiveMediaAsset(asset.id, actor);
    const arch2 = await prismaBase.mediaAsset.findUnique({ where: { id: asset.id } });
    expect(arch2.archivedAt.getTime()).toBe(arch1.archivedAt.getTime());

    // RBAC: a fresh active user without media.upload cannot create
    const u = await prismaBase.user.create({
      data: { email: `zz-svc-${Date.now()}@example.com`, name: "ZZ Svc User", status: "active", isDeveloper: false },
    });
    try {
      await expect(service.createMediaAsset({ url: "https://res.cloudinary.com/zztest/image/upload/zz-nope.jpg", altText: SVC_MARK }, { userId: u.id })).rejects.toMatchObject({ status: 403 });
    } finally {
      await prismaBase.user.delete({ where: { id: u.id } }).catch(() => {});
    }
  });

  dbit("a non-developer without media.migrate is forbidden", async () => {
    // a freshly-created active user with no role assignments
    const u = await prismaBase.user.create({
      data: { email: `zz-media-${Date.now()}@example.com`, name: "ZZ Media User", status: "active", isDeveloper: false },
    });
    try {
      await expect(migrate.migratePublicAssets({ dryRun: true, filter: { altText: MARK } }, { userId: u.id })).rejects.toMatchObject({ status: 403 });
    } finally {
      await prismaBase.user.delete({ where: { id: u.id } }).catch(() => {});
    }
  });
});
