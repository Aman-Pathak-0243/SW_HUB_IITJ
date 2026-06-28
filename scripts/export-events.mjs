// Milestone 1 — export the MongoDB `events` collection for the backup.
//
// Writes backups/incoming/events.json (a JSON array). Run this BEFORE
// scripts/backup.sh so the dump is folded into the verified archive.
//
// Requires:
//   - MONGODB_URI in the environment
//   - dependencies installed (`npm install`) so `mongoose` resolves
//
// Usage:
//   MONGODB_URI="mongodb+srv://..." node scripts/export-events.mjs
//
// This script is READ-ONLY against the database (it only queries).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = fileURLToPath(new URL("../backups/incoming/events.json", import.meta.url));

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error(
    "ERROR: MONGODB_URI is not set.\n" +
      'Run:  MONGODB_URI="..." node scripts/export-events.mjs'
  );
  process.exit(1);
}

let mongoose;
try {
  mongoose = (await import("mongoose")).default;
} catch {
  console.error(
    "ERROR: could not load `mongoose`. Install dependencies first:\n" +
      "  npm install\n" +
      "then re-run this script."
  );
  process.exit(1);
}

try {
  await mongoose.connect(uri);
  // Read straight from the collection so we don't depend on the app's schema.
  const docs = await mongoose.connection.db
    .collection("events")
    .find({})
    .sort({ date: 1 })
    .toArray();

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(docs, null, 2), "utf8");

  console.log(`OK: exported ${docs.length} event(s) -> ${OUT}`);
} catch (err) {
  console.error("ERROR during export:", err?.message || err);
  process.exitCode = 1;
} finally {
  await mongoose.connection.close().catch(() => {});
}
