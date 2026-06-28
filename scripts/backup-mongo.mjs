// Milestone 1 — full MongoDB backup before the database is retired (Mongo -> Postgres/Neon).
//
// Dumps every accessible collection across every accessible database to
// backups/incoming/mongo/<db>__<collection>.json using Extended JSON (so
// ObjectId / Date / etc. are preserved faithfully). Also writes a copy of the
// `events` collection to backups/incoming/events.json (the primary V1 data).
//
// READ-ONLY against the database (only lists + finds; never writes to Mongo).
//
// Requires MONGODB_URI in the environment and the `mongodb` driver installed
// (e.g. `npm install mongodb --no-save`).
//
// Usage:
//   MONGODB_URI="mongodb+srv://..." node scripts/backup-mongo.mjs

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { MongoClient, BSON } from "mongodb";

// Use the driver's own BSON/EJSON so serialized types match the driver version
// (importing a separate `bson` can cause "Unsupported BSON version" errors).
const EJSON = BSON.EJSON;

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('ERROR: MONGODB_URI is not set. Run: MONGODB_URI="..." node scripts/backup-mongo.mjs');
  process.exit(1);
}

const INCOMING = fileURLToPath(new URL("../backups/incoming/", import.meta.url));
const MONGO_DIR = INCOMING + "mongo/";

const SYSTEM_DBS = new Set(["admin", "local", "config"]);
// Skip Atlas's bundled sample datasets (e.g. sample_mflix) — not project data.
const isSampleDb = (n) => n.startsWith("sample_");

const client = new MongoClient(uri);
const summary = [];
let eventsWritten = false;

try {
  await client.connect();
  await mkdir(MONGO_DIR, { recursive: true });

  // Determine which databases to scan. listDatabases may be restricted on
  // shared Atlas tiers — fall back to the connection's default db ("test"
  // when the URI has no db name).
  let dbNames = [];
  try {
    const { databases } = await client.db().admin().listDatabases();
    dbNames = databases.map((d) => d.name).filter((n) => !SYSTEM_DBS.has(n) && !isSampleDb(n));
    console.log(`Databases to back up: ${dbNames.join(", ") || "(none)"} (sample_* datasets skipped)`);
  } catch {
    const fallback = client.db().databaseName || "test";
    dbNames = [fallback];
    console.log(`listDatabases not permitted; scanning default db: ${fallback}`);
  }

  for (const dbName of dbNames) {
    const db = client.db(dbName);
    let collections = [];
    try {
      collections = await db.listCollections().toArray();
    } catch (e) {
      console.warn(`  ! cannot list collections in ${dbName}: ${e.message}`);
      continue;
    }
    for (const { name } of collections) {
      try {
        const docs = await db.collection(name).find({}).toArray();
        const file = `${MONGO_DIR}${dbName}__${name}.json`;
        await writeFile(file, EJSON.stringify(docs, null, 2), "utf8");
        summary.push({ db: dbName, collection: name, count: docs.length });
        console.log(`  + ${dbName}.${name}: ${docs.length} doc(s)`);
        if (name === "events" && !eventsWritten) {
          await writeFile(`${INCOMING}events.json`, EJSON.stringify(docs, null, 2), "utf8");
          eventsWritten = true;
        }
      } catch (e) {
        console.warn(`  ! failed to dump ${dbName}.${name}: ${e.message}`);
      }
    }
  }

  await writeFile(
    `${MONGO_DIR}_summary.json`,
    JSON.stringify({ scannedAt: "see backup timestamp", databases: dbNames, collections: summary }, null, 2),
    "utf8"
  );

  console.log("");
  console.log(`Done. Collections dumped: ${summary.length}. events.json written: ${eventsWritten}`);
  console.log(`Output: backups/incoming/  (re-run scripts/backup.sh to fold into a verified archive)`);
  if (!eventsWritten) {
    console.log("NOTE: no `events` collection was found in the accessible databases.");
  }
} catch (err) {
  console.error("ERROR during Mongo backup:", err?.message || err);
  process.exitCode = 1;
} finally {
  await client.close().catch(() => {});
}
