import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma.mjs";

// Serves a storageProvider='db' media_asset's bytes straight out of Postgres
// (lib/media/service.mjs#uploadDbAsset) — the storage for Events/Announcements/
// Wall of Fame uploads. No filesystem involved at all, so nothing here depends on
// UPLOADS_DIR, public/, or anything that needs re-syncing after a redeploy.
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req, { params }) {
  const { id } = await params;
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { fileData: true, mimeType: true, kind: true, archivedAt: true },
  });
  if (!asset?.fileData || asset.archivedAt) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const contentType = asset.mimeType || (asset.kind === "pdf" ? "application/pdf" : "application/octet-stream");
  return new NextResponse(asset.fileData, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(asset.fileData.length),
      // The id is a random UUID and the row is never mutated in place (archiving
      // just hides it, from here, via the 404 above) — safe to cache forever.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
