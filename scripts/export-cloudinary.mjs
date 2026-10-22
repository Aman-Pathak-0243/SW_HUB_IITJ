// CLOUDINARY EXPORT (Session 15) — download every Cloudinary-backed media asset
// with its metadata, so the pile can be moved into public/ and the credits freed.
//
//   npm run media:export -- --dry-run          what would be downloaded (no writes)
//   npm run media:export                       download + manifest to exports/cloudinary/<ts>/
//   npm run media:export -- --into public/images/uploads --repoint
//                                              download INTO public/, then re-point the
//                                              DB rows at the static paths
//
// WHY. Cloudinary's free tier is a fixed credit budget, and the admin image picker
// (Session 15) lets an editor upload into it from the browser — so it fills up over
// time with images that are never going to change again. This is the drain: pull
// them down, commit them under public/, and flip the media_asset rows to `local`.
// Delivery then costs nothing, and resolveDeliveryUrl returns the static path with
// no change anywhere else in the app (it already handles both shapes).
//
// --repoint is the step that makes deleting from Cloudinary SAFE. Without it the
// files exist in two places but the DB still points at Cloudinary, so clearing the
// account breaks every image. With it, the rows reference public/ and Cloudinary is
// genuinely unused. It is opt-in, requires --into to land inside public/, and is
// reported per row before it writes.
//
// The manifest is the provenance record: it keeps each asset's original Cloudinary
// public_id, URL, dimensions, bytes and the content that referenced it, which the
// media_asset row no longer carries once it has been re-pointed.
import { mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import prisma from "../lib/prisma.mjs";
import { resolveDeliveryUrl, cloudNameFromUrl } from "../lib/media/cloudinary.mjs";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const valueOf = (f, fallback = null) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const dryRun = has("--dry-run");
const repoint = has("--repoint");
const includeArchived = has("--include-archived");
const limit = Number(valueOf("--limit")) || undefined;

// Where the files land. Default is an exports/ folder outside public/ (a plain
// backup); --into lets an operator download straight into the public tree.
const intoArg = valueOf("--into");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = intoArg ? path.resolve(process.cwd(), intoArg) : path.resolve(process.cwd(), "exports", "cloudinary", stamp);
const manifestDir = intoArg ? path.resolve(process.cwd(), "exports", "cloudinary", stamp) : outDir;

// The public/ root, used to decide whether --into is re-pointable and to turn an
// absolute path back into the "/public" web path a media_asset stores.
const PUBLIC_ROOT = path.resolve(process.cwd(), "public");
const insidePublic = !path.relative(PUBLIC_ROOT, outDir).startsWith("..");

function webPathFor(absPath) {
  return `/${path.relative(PUBLIC_ROOT, absPath).split(path.sep).join("/")}`;
}

// A filesystem-safe filename derived from the Cloudinary public_id, so the exported
// tree mirrors the folder structure Cloudinary used ("iitj-portal/uploads/x" →
// "iitj-portal/uploads/x.jpg") and two assets never collide.
function fileNameFor(asset) {
  const id = asset.cloudinaryPublicId || asset.id;
  const safe = String(id)
    .split("/")
    .map((seg) => seg.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "x")
    .join("/");
  // Cloudinary omits the extension from public_id; recover it from the URL, falling
  // back to the format/kind.
  const fromUrl = (asset.url ?? "").match(/\.([a-z0-9]{2,5})(?:\?|$)/i)?.[1];
  const ext = (fromUrl || (asset.kind === "pdf" ? "pdf" : asset.kind === "svg" ? "svg" : "jpg")).toLowerCase();
  return safe.toLowerCase().endsWith(`.${ext}`) ? safe : `${safe}.${ext}`;
}

// Which content/org rows reference this asset — the part the manifest must carry,
// because once a row is re-pointed its Cloudinary identity is gone. Counted, not
// enumerated in full, to keep the manifest readable.
async function referenceCounts(assetId) {
  const [announcements, flagship, achievements, events, clubLogos, clubHeroes, people] = await Promise.all([
    prisma.announcementPayload.count({ where: { coverMediaId: assetId } }),
    prisma.flagshipEventPayload.count({ where: { imageMediaId: assetId } }),
    prisma.achievementPayload.count({ where: { heroMediaId: assetId } }),
    prisma.eventPayload.count({ where: { coverMediaId: assetId } }),
    prisma.clubProfilePayload.count({ where: { logoMediaId: assetId } }),
    prisma.clubProfilePayload.count({ where: { heroMediaId: assetId } }),
    prisma.person.count({ where: { photoMediaId: assetId } }),
  ]);
  const total = announcements + flagship + achievements + events + clubLogos + clubHeroes + people;
  return { total, announcements, flagship, achievements, events, clubLogos, clubHeroes, people };
}

async function main() {
  console.log("Cloudinary export");
  console.log("-".repeat(64));

  const assets = await prisma.mediaAsset.findMany({
    where: {
      storageProvider: "cloudinary",
      ...(includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: { createdAt: "asc" },
    ...(limit ? { take: limit } : {}),
  });

  if (!assets.length) {
    console.log("No Cloudinary-backed assets found — nothing to export.");
    return;
  }

  const totalBytes = assets.reduce((n, a) => n + Number(a.bytes ?? 0), 0);
  console.log(`${assets.length} asset${assets.length === 1 ? "" : "s"} · ${(totalBytes / 1024 / 1024).toFixed(1)}MB recorded`);
  console.log(`files    → ${outDir}${dryRun ? "  [dry-run]" : ""}`);
  console.log(`manifest → ${manifestDir}${dryRun ? "  [dry-run]" : ""}`);
  if (repoint) {
    if (!insidePublic) {
      console.error("\n--repoint needs --into to point INSIDE public/ (the app serves static images from there).");
      console.error(`  got: ${outDir}`);
      process.exit(1);
    }
    console.log(`repoint  → rows become storage_provider='local' at ${webPathFor(outDir)}/…${dryRun ? "  [dry-run]" : ""}`);
  }
  console.log("-".repeat(64));

  const rows = [];
  let downloaded = 0;
  let failed = 0;
  let repointed = 0;

  for (const asset of assets) {
    const url = resolveDeliveryUrl(asset);
    const rel = fileNameFor(asset);
    const abs = path.join(outDir, rel);
    const refs = await referenceCounts(asset.id);

    const row = {
      id: asset.id,
      cloudinaryPublicId: asset.cloudinaryPublicId,
      cloudName: cloudNameFromUrl(asset.url),
      sourceUrl: url,
      exportedFile: rel,
      staticPath: insidePublic ? webPathFor(abs) : null,
      kind: asset.kind,
      mimeType: asset.mimeType,
      altText: asset.altText,
      width: asset.width,
      height: asset.height,
      bytes: asset.bytes != null ? Number(asset.bytes) : null,
      createdAt: asset.createdAt,
      migratedAt: asset.migratedAt,
      archivedAt: asset.archivedAt,
      originalPath: asset.originalPath,
      references: refs,
      downloaded: false,
      repointed: false,
      error: null,
    };

    if (!url) {
      row.error = "no resolvable delivery URL";
      failed++;
      console.log(`  ✗ ${asset.id} — ${row.error}`);
      rows.push(row);
      continue;
    }

    if (dryRun) {
      console.log(`  · ${rel}  (${refs.total} reference${refs.total === 1 ? "" : "s"})  [dry-run]`);
      rows.push(row);
      continue;
    }

    try {
      await mkdir(path.dirname(abs), { recursive: true });
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      await writeFile(abs, buf);
      row.downloaded = true;
      // Record the REAL size on disk, which may differ from the stored `bytes`
      // (Cloudinary re-encodes, and an f_auto URL delivers a different format).
      row.bytesOnDisk = (await stat(abs)).size;
      downloaded++;

      if (repoint) {
        const staticPath = webPathFor(abs);
        await prisma.mediaAsset.update({
          where: { id: asset.id },
          data: {
            storageProvider: "local",
            url: staticPath,
            originalPath: staticPath,
            // Cleared so resolveDeliveryUrl takes its plain-path branch; the old id
            // lives on in this manifest, which is the provenance record.
            cloudinaryPublicId: null,
            migratedAt: null,
            bytes: row.bytesOnDisk,
          },
        });
        row.repointed = true;
        row.staticPath = staticPath;
        repointed++;
      }
      console.log(`  ✓ ${rel}  ${(row.bytesOnDisk / 1024).toFixed(0)}KB  (${refs.total} ref${refs.total === 1 ? "" : "s"})${row.repointed ? " → repointed" : ""}`);
    } catch (e) {
      row.error = e?.message ?? String(e);
      failed++;
      console.log(`  ✗ ${rel} — ${row.error}`);
    }
    rows.push(row);
  }

  // ── manifest ───────────────────────────────────────────────────────────────
  if (!dryRun) {
    await mkdir(manifestDir, { recursive: true });
    const manifest = {
      exportedAt: new Date().toISOString(),
      filesDir: outDir,
      repointed: repoint,
      counts: { total: assets.length, downloaded, failed, repointed },
      assets: rows,
    };
    await writeFile(path.join(manifestDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

    // A flat CSV for the same data, so it opens in a spreadsheet without tooling.
    const cols = ["id", "cloudinaryPublicId", "exportedFile", "staticPath", "kind", "bytes", "bytesOnDisk", "width", "height", "altText", "referenceTotal", "repointed", "error"];
    const csv = [
      cols.join(","),
      ...rows.map((r) =>
        cols
          .map((c) => {
            const v = c === "referenceTotal" ? r.references.total : r[c];
            const s = v == null ? "" : String(v);
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      ),
    ].join("\n");
    await writeFile(path.join(manifestDir, "manifest.csv"), csv, "utf8");
  }

  console.log("-".repeat(64));
  console.log(`downloaded ${downloaded} · failed ${failed} · repointed ${repointed}`);
  if (dryRun) {
    console.log("\nDRY RUN — nothing was written. Re-run without --dry-run to export.");
  } else {
    console.log(`\nmanifest.json + manifest.csv → ${manifestDir}`);
    if (!repoint) {
      console.log("\nThe DB still points at Cloudinary. To finish the move:");
      console.log("  1. commit the exported files under public/");
      console.log("  2. re-run with --into public/<that folder> --repoint");
      console.log("  3. only THEN delete the assets from the Cloudinary console");
    } else {
      console.log("\nRows now reference public/. Commit the files, deploy, confirm the pages render,");
      console.log("and only then delete those assets from the Cloudinary console.");
    }
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Cloudinary export failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
