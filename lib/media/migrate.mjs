// Admin Media Migration Tool (Session 7) — the idempotent, reversible
// /public → Cloudinary migration. It walks the `media_asset` INVENTORY rows the
// Session-5/6 importers created (storage_provider='local', original_path='/...'),
// uploads each /public file to the env-configured Cloudinary account, and repoints
// the row (cloudinary_public_id + url + migrated_at), so the ~105 /public assets
// (~74 MB, KNOWN_ISSUES #18) can be served from the CDN and pruned from the repo.
//
// IDEMPOTENT: the candidate query excludes rows that already carry a
// cloudinary_public_id, so a re-run migrates 0. REVERSIBLE: original_path is never
// cleared, so rollbackMigration() restores storage_provider='local' + url back to
// the /public path (and clears the cloudinary fields). DRY-RUN: computes the full
// plan with zero writes. The deterministic publicIdFromPath() means a re-run (or a
// migrate-after-rollback) targets the same Cloudinary public_id.
//
// It ALSO reconciles the Session-6 base64 PLACEHOLDER rows (DL-039): those have no
// bytes on disk (the originals live only in the Session-1 Mongo backup), so they
// are reported as `base64Pending` and migrated only when the caller supplies a
// `base64Resolver` that yields the bytes / a hosted URL.
//
// WRITES use the audit-bypassing `prismaBase` (a 105-row migration must not flood
// the audit log) and the tool records ONE semantic audit_log row summarizing the
// run (mirroring the importers' policy). The Cloudinary uploader is INJECTED so
// the live test can pass a deterministic fake (no network / no credentials).
import { prismaBase } from "../prisma.mjs";
import { assertPermission } from "../rbac/authorize.mjs";
import { recordAudit } from "../cms/audit.mjs";
import { BASE64_PLACEHOLDER_URL } from "../org/normalize.mjs";
import {
  getCloudinaryConfig,
  canUpload,
  cloudinaryUrl,
  publicIdFromPath,
  publicAbsPath,
  uploadFileToCloudinary,
} from "./cloudinary.mjs";

const SYSTEM_ACTOR = { system: true };
const ENTITY = "media_asset";

async function authorizeMigrate(actor) {
  if (actor?.system) return;
  if (!actor?.userId) {
    const err = new Error("An actor user id is required to run the media migration.");
    err.status = 401;
    err.code = "UNAUTHENTICATED";
    throw err;
  }
  await assertPermission(actor.userId, "media.migrate", {});
}

// ── pure classification (unit-testable, no DB) ─────────────────────────────────

// Classify a media_asset row for the migration:
//   'migrated' — already has a cloudinary_public_id (idempotent skip);
//   'base64'   — a Session-6 base64 placeholder (DL-039; no disk bytes);
//   'public'   — a local /public file (has original_path) → uploadable;
//   'external' — already an off-/public http(s) URL (left as-is);
//   'skip'     — archived or anything else.
export function classifyMigrationCandidate(asset) {
  if (!asset) return "skip";
  if (asset.archivedAt) return "skip";
  if (asset.cloudinaryPublicId) return "migrated";
  if (asset.url === BASE64_PLACEHOLDER_URL) return "base64";
  if (asset.storageProvider === "local" && asset.originalPath) return "public";
  if (asset.storageProvider === "external") return "external";
  return "skip";
}

// Bucket a list of media_asset rows by migration disposition. PURE + exported so
// the plan logic is testable without a database.
export function selectMigrationCandidates(assets) {
  const out = { public: [], base64: [], migrated: [], external: [], skipped: [] };
  for (const a of assets ?? []) {
    const c = classifyMigrationCandidate(a);
    out[c === "skip" ? "skipped" : c].push(a);
  }
  return out;
}

// ── migrate ────────────────────────────────────────────────────────────────────

// Migrate /public assets → Cloudinary. Options:
//   { dryRun=false, uploader=uploadFileToCloudinary, config?, folder?, limit?,
//     base64Resolver?, filter?, client=prismaBase, cwd?, now? }
// `filter` is merged into the candidate `where` to migrate a SUBSET (a folder, or
// a test's own rows) without touching the rest of the inventory. Returns
// { dryRun, folder, counts, base64Pending, plan }.
export async function migratePublicAssets(opts = {}, actor = SYSTEM_ACTOR) {
  const { dryRun = false, uploader = uploadFileToCloudinary, base64Resolver, limit, client = prismaBase, cwd, now, filter = {} } = opts;
  await authorizeMigrate(actor);

  const cfg = opts.config ?? getCloudinaryConfig();
  const folder = opts.folder ?? cfg?.folder ?? "iitj-portal";
  // A REAL upload (default uploader, not dry-run) needs an upload-capable config;
  // fail fast with a friendly message rather than per-asset 500s. An injected
  // uploader (the test fake) bypasses this — it does its own thing.
  if (!dryRun && uploader === uploadFileToCloudinary && !canUpload(cfg)) {
    const err = new Error("Cloudinary upload is not configured. Set CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET in .env.local, or run with dryRun to preview.");
    err.code = "CLOUDINARY_UNCONFIGURED";
    err.status = 409;
    throw err;
  }

  // Candidate query: never re-touch an already-migrated (public_id set) or
  // archived row — this is what makes a re-run a no-op.
  const assets = await client.mediaAsset.findMany({
    where: { archivedAt: null, cloudinaryPublicId: null, ...filter },
    orderBy: { createdAt: "asc" },
  });
  const buckets = selectMigrationCandidates(assets);

  const counts = { migrated: 0, skipped: buckets.skipped.length + buckets.external.length, base64Pending: 0, base64Reconciled: 0, failed: 0 };
  const plan = [];

  const pub = limit ? buckets.public.slice(0, limit) : buckets.public;
  for (const a of pub) {
    const publicId = publicIdFromPath(a.originalPath, { folder });
    const base = { id: a.id, originalPath: a.originalPath, kind: a.kind, publicId };
    if (dryRun) {
      plan.push({ ...base, action: "upload" });
      continue;
    }
    try {
      const absPath = publicAbsPath(a.originalPath, { cwd });
      const up = await uploader(absPath, { config: cfg, publicId, resourceType: "image", now });
      const finalPublicId = up?.publicId ?? publicId;
      const url = up?.url ?? cloudinaryUrl(finalPublicId, { cloudName: cfg?.cloudName, resourceType: "image" });
      await client.mediaAsset.update({
        where: { id: a.id },
        data: {
          storageProvider: "cloudinary",
          cloudinaryPublicId: finalPublicId,
          url,
          bytes: up?.bytes ?? a.bytes ?? null,
          width: up?.width ?? a.width ?? null,
          height: up?.height ?? a.height ?? null,
          migratedAt: new Date(),
          // original_path intentionally preserved for rollback.
        },
      });
      counts.migrated += 1;
      plan.push({ ...base, action: "uploaded", url });
    } catch (e) {
      counts.failed += 1;
      plan.push({ ...base, action: "failed", error: e?.message ?? String(e) });
    }
  }

  // Reconcile Session-6 base64 placeholders (DL-039). Without a resolver they are
  // reported as pending (the real bytes live in the Session-1 Mongo backup).
  for (const a of buckets.base64) {
    if (!base64Resolver) {
      counts.base64Pending += 1;
      plan.push({ id: a.id, action: "base64-pending", note: "needs source bytes from the Session-1 Mongo backup (DL-039)" });
      continue;
    }
    if (dryRun) {
      counts.base64Pending += 1;
      plan.push({ id: a.id, action: "base64-reconcile (dry-run)" });
      continue;
    }
    try {
      const resolved = await base64Resolver(a); // { absPath } | { publicId, url } | null
      let finalPublicId = resolved?.publicId ?? null;
      let url = resolved?.url ?? null;
      if (resolved?.absPath) {
        const pid = resolved.publicId ?? publicIdFromPath(`/reconciled/${a.id}`, { folder });
        const up = await uploader(resolved.absPath, { config: cfg, publicId: pid, resourceType: "image", now });
        finalPublicId = up?.publicId ?? pid;
        url = up?.url ?? cloudinaryUrl(finalPublicId, { cloudName: cfg?.cloudName, resourceType: "image" });
      }
      if (finalPublicId && url) {
        await client.mediaAsset.update({
          where: { id: a.id },
          data: { storageProvider: "cloudinary", cloudinaryPublicId: finalPublicId, url, migratedAt: new Date() },
        });
        counts.base64Reconciled += 1;
        plan.push({ id: a.id, action: "base64-reconciled", url });
      } else {
        counts.base64Pending += 1;
        plan.push({ id: a.id, action: "base64-pending", note: "resolver returned no bytes/url" });
      }
    } catch (e) {
      counts.failed += 1;
      plan.push({ id: a.id, action: "base64-failed", error: e?.message ?? String(e) });
    }
  }

  // One semantic audit row for the whole run (never per-asset; #8 grain).
  if (!dryRun && (counts.migrated || counts.base64Reconciled)) {
    await recordAudit(client, {
      actorUserId: actor?.userId ?? null,
      action: "update",
      entityType: ENTITY,
      summary: `Media migration: ${counts.migrated} /public asset(s) → Cloudinary${counts.base64Reconciled ? `, ${counts.base64Reconciled} base64 reconciled` : ""}`,
    }).catch((e) => console.warn("[media] migration audit failed:", e?.message ?? e));
  }

  // base64Pending reflects what is STILL pending after this run (0 once a resolver
  // reconciles them), not the bucket size — counts.base64Pending is authoritative.
  return { dryRun, folder, counts, base64Pending: counts.base64Pending, plan };
}

// ── rollback ─────────────────────────────────────────────────────────────────

// Reverse a /public → Cloudinary migration: restore storage_provider='local' and
// url ← original_path, and clear cloudinary_public_id + migrated_at, for assets we
// migrated FROM /public (original_path present). Idempotent (a second run finds
// nothing, since cloudinary_public_id is now null) and scoped: it never touches a
// genuinely-external asset (those have no original_path). It does NOT delete the
// Cloudinary asset — the deterministic public_id means a re-migrate reuses it;
// remote cleanup is a separate manual step (documented). Options:
//   { dryRun=false, ids?, filter?, client=prismaBase }
export async function rollbackMigration(opts = {}, actor = SYSTEM_ACTOR) {
  const { dryRun = false, ids, client = prismaBase, filter = {} } = opts;
  await authorizeMigrate(actor);

  const where = { migratedAt: { not: null }, originalPath: { not: null }, cloudinaryPublicId: { not: null }, ...filter };
  if (ids?.length) where.id = { in: ids };
  const assets = await client.mediaAsset.findMany({ where, orderBy: { createdAt: "asc" } });

  const counts = { rolledBack: 0 };
  const plan = [];
  for (const a of assets) {
    plan.push({ id: a.id, restoreUrl: a.originalPath, fromPublicId: a.cloudinaryPublicId });
    if (dryRun) continue;
    await client.mediaAsset.update({
      where: { id: a.id },
      data: { storageProvider: "local", url: a.originalPath, cloudinaryPublicId: null, migratedAt: null },
    });
    counts.rolledBack += 1;
  }

  if (!dryRun && counts.rolledBack) {
    await recordAudit(client, {
      actorUserId: actor?.userId ?? null,
      action: "update",
      entityType: ENTITY,
      summary: `Media migration rollback: ${counts.rolledBack} asset(s) restored to /public`,
    }).catch((e) => console.warn("[media] rollback audit failed:", e?.message ?? e));
  }

  return { dryRun, counts, plan };
}
