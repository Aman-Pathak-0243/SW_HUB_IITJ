// Is this URL one of the local-disk uploads (see lib/media/local-disk.mjs)? These
// are mirrored into public/uploads/ at upload time, so they're ordinary static
// files Next can serve/optimize natively — this is now just a defensive
// `unoptimized` flag for the rare case a file hasn't been synced there yet.
// PURE — used wherever one of these URLs is passed to next/image.
export function isLocalUploadUrl(url) {
  return typeof url === "string" && url.startsWith("/uploads/");
}
