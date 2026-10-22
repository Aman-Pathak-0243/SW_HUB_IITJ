// Is this URL one of the local-disk uploads served by app/api/uploads/[...path]
// (see lib/media/local-disk.mjs)? next/image's default loader treats ANY string
// starting with "/" as a file under public/ and reads it straight off disk rather
// than requesting it over HTTP — so an image living in UPLOADS_DIR (outside
// public/) silently fails to render unless optimization is skipped for it.
// PURE — used wherever one of these URLs is passed to next/image as `unoptimized`.
export function isLocalUploadUrl(url) {
  return typeof url === "string" && url.startsWith("/uploads/");
}
