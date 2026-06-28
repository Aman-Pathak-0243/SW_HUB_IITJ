# Developer Guide

A practical guide for running, understanding, and extending this project. Aimed
at future IIT Jammu students inheriting the codebase.

> **Working in sessions?** Read [SESSION_PROTOCOL.md](SESSION_PROTOCOL.md) FIRST.
> The project is built across 10 sessions; each begins by reading the tracking
> files and ends by updating them. Don't repeat completed work.

> **Database pivot (Session 1):** V2 uses **PostgreSQL on Neon + Prisma**
> (replacing V1's MongoDB/Mongoose). Prisma is wired up in **Session 2**; V1 code
> still references Mongoose until then.

## Prerequisites

- **Node.js** (LTS recommended; Next.js 16 + React 19 require a modern Node).
- **npm** (a `package-lock.json` is committed).
- A **Neon PostgreSQL** database (connection string in `.env.local`), **Google
  OAuth** credentials, and the **Cloudinary** account(s) used for media.
- (Legacy, optional) a **MongoDB** URI only if reading old V1 data.

## Setup

```bash
# 1. Install dependencies (node_modules is NOT committed)
npm install

# 2. Create your env file from the template
cp env.example .env.local   # or .env

# 3. Fill in values in .env.local:
#    MONGODB_URI=...
#    GOOGLE_CLIENT_ID=...
#    GOOGLE_CLIENT_SECRET=...
#    NEXTAUTH_SECRET=...                 # generate a random secret
#    NEXTAUTH_URL=http://localhost:3000

# 4. Run the dev server
npm run dev        # http://localhost:3000
```

> `.env*` files are git-ignored — never commit real secrets. (See
> [SECURITY.md](SECURITY.md): there are leaked secrets in `README.md` that must
> be rotated/removed.)

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm start` | Run the production build |
| `npx eslint .` | Lint (config: `eslint.config.mjs`) |

There are **no test commands yet** — the test harness is added in the V2 testing
milestone (see [TESTING_STRATEGY.md](TESTING_STRATEGY.md)).

## Project map

See [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md) for the full tree. Quick
orientation:

- `app/` — App Router pages, components, and API routes.
- `app/components/` — shared `Header`, `Footer`, `EventCard`, `PdfSlideshow`.
- `lib/db.js` — MongoDB connection helper.
- `models/Event.js` — the only Mongoose model.
- `public/` — local images (do **not** reorganize; see the media migration plan).
- `docs/` — this documentation.

## How things work today

- **Adding an event:** log in at `/admin` (must be an allowlisted Google email),
  fill the form, submit → `POST /api/events`. It appears on `/announcements`.
- **Most content is hardcoded** in the page components — to change a club,
  coordinator, hostel, etc. **today**, you edit the arrays in the relevant
  `app/.../page.jsx`. (V2 moves this into the database/Admin Panel.)
- **Path alias:** `@/` maps to the project root (`jsconfig.json`).

## Gotchas (real, from analysis)

- `app/page1.js` and `app/admin/page2.js` are **dead** (not routed). Don't
  mistake them for the live pages (`page.js`).
- `/past-events` is currently **broken** (expects a `{success, events}` shape the
  API doesn't return). See [KNOWN_ISSUES.md](../KNOWN_ISSUES.md).
- `pdfjs-dist` version mismatch — `PdfSlideshow.jsx` comments expect 3.x but
  `package.json` declares 6.x. If PDF previews render blank, this is why.
- `lib/db.js` calls `process.exit(1)` on a DB connection error — fine to know
  when debugging local crashes.

## Contributing workflow (V2)

1. Work on a feature branch off `portal-v2` (or the agreed base).
2. One milestone at a time; reuse components; avoid duplicate implementations.
3. Update the relevant `/docs` files and the root tracking files in the same PR.
4. Ensure the test gate passes (once it exists) before marking a milestone done.
5. Never commit secrets; never reorganize `/public` outside the media tool.

See [ADMIN_GUIDE.md](ADMIN_GUIDE.md) for the admin-facing side and
[MILESTONE_PLAN.md](MILESTONE_PLAN.md) for the roadmap.
