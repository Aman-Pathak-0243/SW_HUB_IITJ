// Replays UPLOADS_DIR/manifest.json into public/uploads/ — run this after a fresh
// checkout / deploy, before `npm run build`, in case public/uploads/ (gitignored,
// never committed) is missing or incomplete on this machine. No database needed —
// UPLOADS_DIR is the source of truth.
//
//   npm run uploads:sync
import { syncUploadsToPublic, getUploadsRoot } from "../lib/media/local-disk.mjs";

const result = await syncUploadsToPublic();
console.log(`UPLOADS_DIR: ${getUploadsRoot()}`);
console.log(`${result.synced} synced, ${result.skipped} already present, ${result.failed} failed (of ${result.total} in manifest.json).`);
if (result.failed) process.exitCode = 1;
