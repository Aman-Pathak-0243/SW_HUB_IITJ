// Is this URL one of the DB-stored uploads (see lib/media/service.mjs#uploadDbAsset
// and app/api/media/[id]/route.js)? next/image's default LOCAL loader assumes any
// "/"-prefixed src is a file under public/ and reads it straight off disk — a
// dynamic route like /api/media/<id> is never there, so these must skip that
// loader and be fetched over HTTP instead, same as any other remote image.
// PURE — used wherever one of these URLs is passed to next/image.
export function isDbMediaUrl(url) {
  return typeof url === "string" && url.startsWith("/api/media/");
}
