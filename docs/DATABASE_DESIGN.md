# Database Design (As-Is)

> **⚠️ Database pivot (decided Session 1):** V2 moves OFF MongoDB/Mongoose ONTO
> **PostgreSQL (Neon) with Prisma**. This document describes the **V1 as-is**
> MongoDB design (for the record and for migration). The **V2 target relational
> schema** — normalized, with ER diagram and reasoning — lives in
> [SCHEMA_DESIGN.md](SCHEMA_DESIGN.md). The mapping from V1 → V2 is in
> [DATA_MIGRATION_REPORT.md](DATA_MIGRATION_REPORT.md). Rationale is in
> [DECISION_LOG.md](DECISION_LOG.md).

## Engine & connection

- **Database:** MongoDB (external; connection string via `MONGODB_URI`).
- **ODM:** Mongoose `^8.19.2`.
- **Connection helper:** `lib/db.js`.

```js
// lib/db.js (paraphrased)
const connection = { isConnected: false };
async function connectDB() {
  if (connection.isConnected) return;            // reuse
  const db = await mongoose.connect(process.env.MONGODB_URI);
  connection.isConnected = db.connections[0].readyState === 1;
  // on error: console.log(...) then process.exit(1)
}
```

**Facts / risks about the connection helper:**
- Uses a simple module-level boolean to avoid reconnecting. In a serverless or
  hot-reload (dev) environment this is not robust — Mongoose's recommended
  pattern caches the connection **promise** on `global` to survive module
  reloads. Tracked in [KNOWN_ISSUES.md](../KNOWN_ISSUES.md).
- On connection failure it calls **`process.exit(1)`**, which is inappropriate
  for a web server (kills the process instead of returning a 500). The `GET`/`POST`
  handlers also wrap calls in try/catch, but `process.exit` pre-empts that.
- No connection options (pool size, timeouts) are configured.

## Models

There is exactly **one** model.

### `Event` — `models/Event.js`

```js
const EventSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description:   String,
  date:        { type: Date,   required: true },
  image:         String,          // base64 data URL OR a remote URL
  createdAt:   { type: Date, default: Date.now },
});
export default mongoose.models.Event || mongoose.model("Event", EventSchema);
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | String | yes | |
| `description` | String | no | |
| `date` | Date | yes | Event date; used to split upcoming/past |
| `image` | String | no | From `/admin`: a **base64 data URL** (can be large). From the dead `page2.js`: a plain URL. |
| `createdAt` | Date | no | Defaults to `Date.now` |

- Uses the `mongoose.models.Event || model(...)` guard to avoid OverwriteModel
  errors during hot reload — correct.
- **No indexes** are declared (queries sort by `date` with no supporting index).
- **No `updatedAt`** / timestamps option; no soft-delete; no owner/author field.
- **No academic-year field** — events have no notion of the 2025–26 year.

### Bonus finding from the backup: a `queries` collection

The Session-1 Mongo backup (`scripts/backup-mongo.mjs`) revealed the `test`
database actually holds **two** collections: `events` (3 docs) and **`queries`
(1 doc)** — the latter was not referenced anywhere in the analyzed source (likely
a contact/enquiry submission or a manual test). Both are captured in the verified
backup. Its disposition is decided in [DATA_MIGRATION_REPORT.md](DATA_MIGRATION_REPORT.md).

## What is stored where (current reality)

| Content | Storage |
|---|---|
| Events (announcements) | MongoDB `events` collection (3 docs, backed up) |
| `queries` | MongoDB `queries` collection (1 doc, backed up) — undocumented in source |
| Everything else (clubs, hostels, messes, team, councils, flagship events, etc.) | **Hardcoded in source** (see [DATA_INVENTORY.md](DATA_INVENTORY.md)) |
| Users / sessions | **Not persisted** (NextAuth JWT, no DB adapter) |
| Media | `/public` (local) + Cloudinary (remote) |

## V2 target (PostgreSQL + Prisma)

The MongoDB design cannot support the V2 requirements (academic-year history,
flexible organizations, dynamic roles/positions, multi-role users, draft/publish
CMS, version history, audit trail). V2 uses a **normalized PostgreSQL schema on
Neon, accessed via Prisma**, designed and adversarially verified in Session 1:

- Full entity dictionary + **ER diagram** + reasoning → [SCHEMA_DESIGN.md](SCHEMA_DESIGN.md)
- V1 → V2 mapping (what becomes DB/CMS-managed vs static) → [DATA_MIGRATION_REPORT.md](DATA_MIGRATION_REPORT.md)
- Why Postgres/Prisma over Mongo/Mongoose → [DECISION_LOG.md](DECISION_LOG.md)

The Prisma schema and first migration are implemented in **Session 2**.

## Migration & backup note

A verified backup of the existing Mongo data (`events` + `queries`) **and** a full
source/asset snapshot was produced in Session 1 (`scripts/backup.sh`, VERIFY:
PASS) before any change — see [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) and
[MIGRATION_PLAN.md](MIGRATION_PLAN.md).
