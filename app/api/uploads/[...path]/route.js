import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getUploadsRoot } from "../../../../lib/media/local-disk.mjs";

// Serves files saved outside public/ by the local-disk upload path (Events /
// Announcements / Wall of Fame images) — Next's static file server only knows
// about public/, so anything under UPLOADS_DIR needs its own route.
//
//   GET /api/uploads/events/some-file.jpg  →  <UPLOADS_DIR>/events/some-file.jpg
export const dynamic = "force-dynamic";

const CONTENT_TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

export async function GET(_req, { params }) {
  const segments = (await params)?.path ?? [];
  const root = getUploadsRoot();
  // path.resolve collapses any ".." BEFORE the containment check (same pattern as
  // lib/media/static-index.mjs#resolveStaticImage) — a traversal attempt in the
  // URL can never escape UPLOADS_DIR.
  const abs = path.resolve(root, ...segments);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const ext = path.extname(abs).toLowerCase();
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) return NextResponse.json({ error: "Not found." }, { status: 404 });

  try {
    const s = await stat(abs);
    if (!s.isFile()) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const bytes = await readFile(abs);
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(s.size),
        // Each filename is unique per upload (random+time suffix), so caching it
        // forever is safe — the same URL never changes content.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
}
