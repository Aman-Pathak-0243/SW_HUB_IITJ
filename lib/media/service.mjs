// Media service (Session 7) — create / list / read / curate / archive
// `media_asset` rows, the tracked-upload registry the whole app references for
// images, logos, PDFs and avatars.
//
// TWO write paths, mirroring the importers' policy (NEXT_TASK guard rails):
//   • CURATED single-asset ops (createMediaAsset / updateMediaAsset /
//     archiveMediaAsset) go through the shared `auditedMutation`, so each writes
//     exactly ONE semantic audit_log row and authorizes the actor first
//     (media.upload / media.update / media.delete).
//   • BULK INVENTORY rows (the importers' /public + external + base64 placeholder
//     references, and the migration tool) use `findOrCreateInventoryAsset` on the
//     audit-bypassing `prismaBase` so a one-shot migration does not flood the
//     audit log with hundreds of rows.
//
// Delivery-URL resolution is delegated to lib/media/cloudinary.mjs#resolveDeliveryUrl
// (the single place that knows how to turn a row into a public URL).
import prisma, { prismaBase } from "../prisma.mjs";
import { assertPermission } from "../rbac/authorize.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { withMappedDbErrors, CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import { classifyMedia, mediaKey } from "../org/normalize.mjs";
import { resolveDeliveryUrl, getCloudinaryConfig, canUpload, publicIdFromPath, uploadBufferToCloudinary } from "./cloudinary.mjs";
import { resolveStaticImage } from "./static-index.mjs";
import { saveLocalUpload, UPLOAD_FOLDERS } from "./local-disk.mjs";

const ENTITY = "media_asset";

// media_kind / storage_provider enum values (kept in sync with the Postgres
// enums). Exported so callers can validate input → friendly 422.
export const MEDIA_KINDS = ["image", "pdf", "svg", "gif"];
export const STORAGE_PROVIDERS = ["cloudinary", "local", "external"];

// Permission key per curated mutating op.
const MEDIA_OP_PERMISSIONS = { create: "media.upload", update: "media.update", archive: "media.delete" };

async function authorize(actor, op) {
  if (actor?.system) return;
  if (!actor?.userId) {
    const err = new Error("An actor user id is required for this operation.");
    err.status = 401;
    err.code = "UNAUTHENTICATED";
    throw err;
  }
  // Media is institute-wide (year-agnostic, not org-bound) → global scope.
  await assertPermission(actor.userId, MEDIA_OP_PERMISSIONS[op], {});
}

// Compact JSON-safe snapshot for audit before/after.
function snapshot(a) {
  if (!a) return null;
  return {
    id: a.id,
    storageProvider: a.storageProvider,
    cloudinaryPublicId: a.cloudinaryPublicId,
    url: a.url,
    originalPath: a.originalPath,
    kind: a.kind,
    altText: a.altText,
    migratedAt: a.migratedAt,
    archivedAt: a.archivedAt,
  };
}

// Shape a row for callers (adds the resolved delivery URL). `transformation`
// (e.g. "f_auto,q_auto") is applied for already-migrated Cloudinary assets.
export function shapeAsset(a, { transformation } = {}) {
  if (!a) return null;
  return {
    id: a.id,
    storageProvider: a.storageProvider,
    cloudinaryPublicId: a.cloudinaryPublicId ?? null,
    url: a.url,
    deliveryUrl: resolveDeliveryUrl(a, { transformation }),
    originalPath: a.originalPath ?? null,
    kind: a.kind,
    mimeType: a.mimeType ?? null,
    altText: a.altText ?? null,
    width: a.width ?? null,
    height: a.height ?? null,
    bytes: a.bytes != null ? Number(a.bytes) : null,
    migratedAt: a.migratedAt ?? null,
    archivedAt: a.archivedAt ?? null,
    createdAt: a.createdAt ?? null,
  };
}

// ── curated (audited) ─────────────────────────────────────────────────────────

// Create one tracked media asset (a curated upload / catalog entry). Validates
// kind + storage provider, authorizes media.upload, writes one semantic audit row.
// input: { url, storageProvider?, kind?, cloudinaryPublicId?, originalPath?,
//          mimeType?, altText?, width?, height?, bytes? }
export async function createMediaAsset(input = {}, actor = {}) {
  if (!input.url) throw new CmsValidationError("A media url is required.");
  const kind = input.kind ?? "image";
  const storageProvider = input.storageProvider ?? "cloudinary";
  if (!MEDIA_KINDS.includes(kind)) throw new CmsValidationError(`Unknown media kind '${kind}'.`);
  if (!STORAGE_PROVIDERS.includes(storageProvider)) throw new CmsValidationError(`Unknown storage provider '${storageProvider}'.`);
  await authorize(actor, "create");

  return auditedMutation(
    actor,
    async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: {
          storageProvider,
          kind,
          url: input.url,
          cloudinaryPublicId: input.cloudinaryPublicId ?? null,
          originalPath: input.originalPath ?? null,
          mimeType: input.mimeType ?? null,
          altText: input.altText ?? null,
          width: input.width ?? null,
          height: input.height ?? null,
          bytes: input.bytes ?? null,
          uploadedById: actor?.userId ?? null,
        },
      });
      return { asset };
    },
    ({ asset }) => ({
      action: "create",
      entityType: ENTITY,
      entityId: asset.id,
      after: snapshot(asset),
      summary: `Registered ${asset.kind} media asset`,
    })
  );
}

// Edit a media asset's curate-able metadata (altText, kind, mimeType, dimensions).
// Storage/cloudinary fields are migration-owned and NOT editable here.
export async function updateMediaAsset(id, patch = {}, actor = {}) {
  // Authorize BEFORE the existence read so an unauthorized caller can't probe
  // asset existence (media auth is global scope, so it needs nothing off the row).
  await authorize(actor, "update");
  const existing = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!existing) throw new CmsNotFoundError(`Media asset ${id} not found.`);
  const data = {};
  for (const f of ["altText", "kind", "mimeType", "width", "height"]) {
    if (patch[f] !== undefined) data[f] = patch[f];
  }
  if (data.kind && !MEDIA_KINDS.includes(data.kind)) throw new CmsValidationError(`Unknown media kind '${data.kind}'.`);
  if (!Object.keys(data).length) return { asset: existing }; // no-op

  return auditedMutation(
    actor,
    async (tx) => {
      const asset = await tx.mediaAsset.update({ where: { id }, data });
      return { asset };
    },
    ({ asset }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: asset.id,
      before: snapshot(existing),
      after: snapshot(asset),
      summary: `Edited media asset metadata`,
    })
  );
}

// Soft-delete (archive) a media asset. Never hard-deletes (FK SetNull references
// keep resolving to null gracefully). Idempotent.
export async function archiveMediaAsset(id, actor = {}) {
  await authorize(actor, "archive"); // authorize before probing existence
  const existing = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!existing) throw new CmsNotFoundError(`Media asset ${id} not found.`);
  if (existing.archivedAt) return { asset: existing };

  return auditedMutation(
    actor,
    async (tx) => {
      const asset = await tx.mediaAsset.update({ where: { id }, data: { archivedAt: new Date() } });
      return { asset };
    },
    ({ asset }) => ({
      action: "archive",
      entityType: ENTITY,
      entityId: asset.id,
      before: snapshot(existing),
      after: snapshot(asset),
      summary: `Archived media asset`,
    })
  );
}

// ── reads ──────────────────────────────────────────────────────────────────────

// List media assets with optional filters. Reads (no auth at this layer; a
// Session-9 admin route gates media.read). { storageProvider?, kind?, migrated?,
// includeArchived?, search?, take? }
export async function listMediaAssets({ storageProvider, kind, migrated, includeArchived = false, search, take = 200 } = {}, { client = prisma } = {}) {
  const where = {};
  if (storageProvider) where.storageProvider = storageProvider;
  if (kind) where.kind = kind;
  if (migrated === true) where.migratedAt = { not: null };
  if (migrated === false) where.migratedAt = null;
  if (!includeArchived) where.archivedAt = null;
  if (search) where.OR = [{ url: { contains: search, mode: "insensitive" } }, { originalPath: { contains: search, mode: "insensitive" } }, { altText: { contains: search, mode: "insensitive" } }];
  const rows = await client.mediaAsset.findMany({ where, orderBy: { createdAt: "desc" }, take });
  return rows.map((a) => shapeAsset(a));
}

// One media asset by id (with resolved delivery URL), or null.
export async function getMediaAsset(id, { transformation, client = prisma } = {}) {
  const a = await client.mediaAsset.findUnique({ where: { id } });
  return a ? shapeAsset(a, { transformation }) : null;
}

// ── bulk inventory (audit-bypassing) ──────────────────────────────────────────

// Find-or-create a lightweight inventory row for a V1 image reference, on the
// audit-bypassing base client (so a migration doesn't flood the audit log). Same
// classify/dedup contract the Session-5/6 importers use (classifyMedia + mediaKey),
// extracted here so the Session-7 resources importer reuses ONE implementation.
// base64 placeholders are intentionally NOT deduped (each is a distinct Session-7
// reconciliation — DL-039). Returns { id, created } or null for an empty ref.
export async function findOrCreateInventoryAsset(ref, { client = prismaBase, cache } = {}) {
  const c = classifyMedia(ref);
  if (!c) return null;
  if (!c.isBase64) {
    const key = mediaKey(c);
    if (cache && cache.has(key)) return { id: cache.get(key), created: false };
    const where = c.originalPath ? { originalPath: c.originalPath } : { url: c.url };
    const existing = await client.mediaAsset.findFirst({ where });
    if (existing) {
      if (cache) cache.set(key, existing.id);
      return { id: existing.id, created: false };
    }
  }
  const row = await withMappedDbErrors(() =>
    client.mediaAsset.create({ data: { storageProvider: c.storageProvider, url: c.url, originalPath: c.originalPath, kind: c.kind } })
  );
  if (cache && !c.isBase64) cache.set(mediaKey(c), row.id);
  return { id: row.id, created: true };
}

// ── admin image picker write paths (Session 15) ───────────────────────────────
//
// The two ways an editor attaches an image to content, both landing in the SAME
// media_asset table the rest of the app already resolves through
// (cloudinary.mjs#resolveDeliveryUrl), so nothing downstream needs to know which
// route an image came in by.

// Images only, and a ceiling the Cloudinary free tier and the nginx body limit are
// both comfortable with. A bigger file is rejected with a friendly 422 rather than
// a truncated upload.
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_ALLOWED_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/avif", "image/svg+xml"];

// MIME → media_kind. The enum has no 'webp'/'avif', and both are ordinary raster
// images as far as delivery is concerned, so they classify as 'image'.
export function kindFromMime(mime) {
  const m = String(mime ?? "").toLowerCase();
  if (m === "image/svg+xml") return "svg";
  if (m === "image/gif") return "gif";
  if (m === "application/pdf") return "pdf";
  return "image";
}

// STATIC pick: register (or reuse) a media_asset for an image ALREADY shipped in
// public/. Costs no Cloudinary credit. The path is caller-supplied, so it is
// verified against the filesystem first (resolveStaticImage also blocks traversal
// out of public/) — never trusted into the row.
//
// Dedup is deliberate: picking "/coding.jpg" on five announcements must reuse ONE
// row, matching findOrCreateInventoryAsset's contract for the same path, so the
// media library does not grow a duplicate per use.
export async function registerStaticImageAsset(input = {}, actor = {}) {
  const resolved = await resolveStaticImage(input.path, { cwd: input.cwd });
  if (!resolved) throw new CmsValidationError(`'${input.path ?? ""}' is not an image under public/.`);
  await authorize(actor, "create");

  const existing = await prisma.mediaAsset.findFirst({ where: { originalPath: resolved.path, archivedAt: null } });
  if (existing) {
    // Reusing a row is not a mutation — return it without an audit entry, so the
    // log records real changes only.
    return { asset: shapeAsset(existing), reused: true };
  }

  const classified = classifyMedia(resolved.path);
  const result = await auditedMutation(
    actor,
    async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: {
          storageProvider: classified.storageProvider, // 'local'
          kind: classified.kind,
          url: classified.url,
          originalPath: classified.originalPath,
          altText: input.altText ?? null,
          bytes: resolved.bytes ?? null,
          uploadedById: actor?.userId ?? null,
        },
      });
      return { asset };
    },
    ({ asset }) => ({
      action: "create",
      entityType: ENTITY,
      entityId: asset.id,
      after: snapshot(asset),
      summary: `Registered static image ${classified.originalPath}`,
    })
  );
  // Shaped (with deliveryUrl) because the caller is the image picker, which needs
  // something to render immediately — not the raw row the curated ops return.
  return { asset: shapeAsset(result.asset), reused: false };
}

// UPLOAD: push browser-supplied bytes to Cloudinary, then register the asset.
// Used by app/api/admin/media/upload (a multipart route — the JSON admin action
// endpoint cannot carry a file).
//
// The public_id carries a short time suffix so two uploads named "poster.jpg" do
// NOT overwrite each other. That is the opposite of the migration tool's policy,
// where a deterministic id is what makes a re-run idempotent — here each upload is
// a distinct asset by definition.
export async function uploadImageAsset(input = {}, actor = {}) {
  const { bytes, filename = "upload", mimeType, altText } = input;
  if (!bytes?.length) throw new CmsValidationError("No file was received.");
  if (bytes.length > UPLOAD_MAX_BYTES) {
    throw new CmsValidationError(`That file is ${Math.round(bytes.length / 1024 / 1024)}MB — the limit is ${UPLOAD_MAX_BYTES / 1024 / 1024}MB. Compress it and try again.`);
  }
  if (mimeType && !UPLOAD_ALLOWED_MIME.includes(String(mimeType).toLowerCase())) {
    throw new CmsValidationError(`'${mimeType}' is not an image type this accepts (${UPLOAD_ALLOWED_MIME.join(", ")}).`);
  }
  await authorize(actor, "create");

  const config = getCloudinaryConfig();
  if (!canUpload(config)) {
    const err = new Error("Uploads are not configured on this server: set CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET. You can still pick an image already in the public folder.");
    err.code = "CLOUDINARY_UNCONFIGURED";
    err.status = 503;
    throw err;
  }

  const slug = publicIdFromPath(filename, { folder: "" }) ?? "image";
  const publicId = `${config.folder}/uploads/${slug}-${Date.now().toString(36)}`;
  const up = await uploadBufferToCloudinary(bytes, { config, publicId, filename });

  return createMediaAsset(
    {
      url: up.url,
      storageProvider: "cloudinary",
      kind: kindFromMime(mimeType),
      cloudinaryPublicId: up.publicId,
      mimeType: mimeType ?? null,
      altText: altText ?? null,
      width: up.width,
      height: up.height,
      bytes: up.bytes,
    },
    actor
  );
}

// UPLOAD to local disk (NOT Cloudinary, NOT public/): Events / Announcements /
// Wall of Fame images specifically, so they survive a git-based redeploy or Docker
// rebuild via a plain directory outside the repo (UPLOADS_DIR) instead of a
// Cloudinary account. Mirrored into public/uploads/ at save time, so it serves as
// an ordinary static file. `folder` must be one of UPLOAD_FOLDERS — saveLocalUpload
// only ever writes under an allowlisted subfolder, never a client-supplied path.
export async function uploadLocalDiskAsset(input = {}, actor = {}) {
  const { bytes, filename = "upload", mimeType, altText, folder } = input;
  if (!UPLOAD_FOLDERS.includes(folder)) {
    throw new CmsValidationError(`'${folder}' is not a valid upload folder (expected one of: ${UPLOAD_FOLDERS.join(", ")}).`);
  }
  await authorize(actor, "create");

  const { urlPath, bytes: savedBytes } = await saveLocalUpload({ bytes, filename, mimeType, folder });

  return createMediaAsset(
    {
      url: urlPath,
      storageProvider: "local",
      kind: kindFromMime(mimeType),
      originalPath: urlPath,
      mimeType: mimeType ?? null,
      altText: altText ?? null,
      bytes: savedBytes,
    },
    actor
  );
}
