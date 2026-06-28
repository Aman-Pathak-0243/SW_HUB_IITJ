# Deployment (As-Is)

This documents how the project is built and run **today**, based on
`package.json`, `README.md`, and config files. Some details (server, domain) are
only partially evidenced; those are marked accordingly.

## Build & run scripts (`package.json`)

```json
"scripts": {
  "dev":   "next dev",
  "build": "next build",
  "start": "next start"
}
```

- **Dev:** `npm run dev` (Next.js dev server, Turbopack — see `next.config.mjs`).
- **Prod build:** `npm run build` then `npm start` (Next.js production server).

## Deployment method (from `README.md`)

The committed `README.md` describes a **self-hosted, PM2-managed** deployment
(not Vercel), paraphrased:

1. `cd ~/IIT-JAMMU-STUDENT-WELFARE`
2. `git pull origin main`
3. `npm install` (if deps changed)
4. `npm run build` (mandatory for production)
5. `pm2 restart student-welfare`
6. `pm2 save`

So the production app is run under **PM2** as a process named `student-welfare`,
on a server where the repo is cloned to `~/IIT-JAMMU-STUDENT-WELFARE`.

> ⚠️ `README.md` also contains leaked secrets — see [SECURITY.md](SECURITY.md).
> Those must be removed/rotated; the deploy steps themselves can stay (cleaned up).

## Configuration

### `next.config.mjs`
- `images.remotePatterns`: allows `res.cloudinary.com`, `images.unsplash.com`,
  `source.unsplash.com` (only Cloudinary is actually used).
- `turbopack.resolveAlias`: aliases `canvas` → `./empty-module.js` (a stub) so
  pdf.js (which optionally pulls in the Node `canvas` package) bundles cleanly in
  the browser build.

### Environment variables (required at runtime)
From `env.example`:
```
MONGODB_URI=          # MongoDB connection string
GOOGLE_CLIENT_ID=     # Google OAuth
GOOGLE_CLIENT_SECRET= # Google OAuth
NEXTAUTH_SECRET=      # NextAuth JWT signing
NEXTAUTH_URL=         # e.g. http://localhost:3000 (set to prod URL in prod)
```
No `.env` is committed (correct). The deploy host must provide these.

## External dependencies (must be reachable in prod)

- **MongoDB** instance (via `MONGODB_URI`).
- **Google OAuth** consent screen / credentials (for `/admin` login).
- **Cloudinary** (image + PDF delivery for most media).

## What is NOT present

- **No CI/CD** pipeline committed (no `.github/workflows`, no Vercel/Netlify
  config). Deploys are manual via the PM2 steps above.
- **No Dockerfile / container** config.
- **No reverse-proxy / Nginx** config in the repo (likely lives on the server,
  outside version control).
- **No health-check endpoint** (V2 adds one for the Developer Console).
- **No staging environment** documented.

## Risks / notes for V2

- Manual `git pull` + `pm2 restart` is error-prone and has no rollback. V2's
  Developer Console proposes deployment status + rollback tooling (see
  [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md)).
- `public/` is ~74 MB of images shipped with the app; moving media to Cloudinary
  (V2 media tool) reduces build/deploy size.
- The PM2 process name and server path are the only evidence of the runtime
  topology; confirm with the operator (Aman Pathak, per the footer credits) and
  expand this doc once verified.

## Proposed V2 deployment direction (not yet implemented)

- Add a CI pipeline (lint + test + build) gating merges.
- Add a `/api/health` endpoint and structured logging.
- Document a reproducible deploy (PM2 ecosystem file or container), plus a
  rollback procedure and backup-before-deploy step.
- Provide infra/cost estimation in the Developer Console (VM/DB/storage/media)
  with links to provider pricing.
