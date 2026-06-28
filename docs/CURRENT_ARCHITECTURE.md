# Current Architecture (As-Is)

This document describes the repository **exactly as it exists**. Everything here
is a verified fact extracted from the code.

## High-level shape

A **Next.js 16 App Router** application. Almost every page is a Client Component
(`"use client"`) that renders hardcoded data. A single MongoDB-backed feature
(Events) is exposed through one API route. Authentication is handled by NextAuth
with Google as the only provider.

```
Browser
  │
  ├─ Static/Client pages (hardcoded content)  ── render directly
  │
  ├─ /announcements, /past-events  ── fetch ──►  GET /api/events  ──►  MongoDB (Event)
  │
  ├─ /admin  ── POST ──►  /api/events  ──►  MongoDB (Event)
  │
  └─ /api/auth/[...nextauth]  ──►  NextAuth ──► Google OAuth
```

## Folder structure (tracked files)

```
.
├── MASTER_PROMPT.md            # V2 governing specification
├── README.md                   # Deploy notes (⚠ contains leaked secrets — see SECURITY.md)
├── package.json                # Scripts: dev / build / start
├── next.config.mjs             # Image remotePatterns + turbopack canvas alias
├── jsconfig.json               # Path alias: "@/*" -> "./*"
├── postcss.config.mjs          # Tailwind v4 via @tailwindcss/postcss
├── eslint.config.mjs           # next/core-web-vitals
├── env.example                 # Required env vars (values empty)
├── empty-module.js             # Stub aliased for `canvas` (pdf.js dependency)
│
├── lib/
│   └── db.js                   # Mongoose connection singleton
│
├── models/
│   └── Event.js                # The only Mongoose model
│
├── loader/
│   └── Loader.jsx              # Global route-change loading overlay
│
├── app/                        # Next.js App Router
│   ├── layout.js               # Root layout: fonts, <Providers>, <Loader>
│   ├── providers.jsx           # next-auth SessionProvider wrapper
│   ├── globals.css             # Tailwind import + minimal global CSS
│   ├── page.js                 # Home page (active route "/")
│   ├── page1.js                # ⚠ Dead/alternate home page (NOT routed)
│   ├── favicon.ico
│   │
│   ├── components/
│   │   ├── Header.jsx          # Global header + nav (large inline <style>)
│   │   ├── Footer.jsx          # Global footer (hardcoded contacts + credits)
│   │   ├── EventCard.js        # Event presentation card
│   │   └── PdfSlideshow.jsx    # Client-side PDF page renderer (pdf.js)
│   │
│   ├── Clubs/
│   │   ├── Academic/page.jsx   # "/Clubs/Academic"  (5 clubs)
│   │   ├── Cultural/page.jsx   # "/Clubs/Cultural"  (8 clubs)
│   │   ├── General/page.jsx    # "/Clubs/General"   (6 clubs)
│   │   └── Sports/page.jsx     # "/Clubs/Sports"    (11 clubs)
│   │
│   ├── hostels/page.jsx        # "/hostels"  (6 hostels)
│   ├── messes/page.jsx         # "/messes"   (5 messes, 16 committee members)
│   ├── Team/page.jsx           # "/Team"     (~37 people across 7 groups)
│   ├── Contact-Us/page.jsx     # "/Contact-Us"
│   ├── Flagship-events/page.jsx# "/Flagship-events"  (6 events)
│   ├── announcements/page.js   # "/announcements"  (fetches /api/events)
│   ├── past-events/page.js     # "/past-events"  (⚠ broken fetch contract)
│   │
│   ├── admin/
│   │   ├── page.js             # "/admin"  (Google login + publish event)
│   │   └── page2.js            # ⚠ Dead/alternate admin page (NOT routed)
│   │
│   └── api/
│       ├── auth/[...nextauth]/route.js   # NextAuth handler (Google)
│       └── events/route.js               # GET + POST events
│
└── public/                     # 105 files (~74 MB): 100 images + 5 SVGs
```

## Routing (App Router)

| Route | File | Type | Data source |
|---|---|---|---|
| `/` | `app/page.js` | Client | Hardcoded (hero, vision, dean message, quotes) |
| `/Clubs/Academic` | `app/Clubs/Academic/page.jsx` | Client | Hardcoded |
| `/Clubs/Cultural` | `app/Clubs/Cultural/page.jsx` | Client | Hardcoded |
| `/Clubs/General` | `app/Clubs/General/page.jsx` | Client | Hardcoded |
| `/Clubs/Sports` | `app/Clubs/Sports/page.jsx` | Client | Hardcoded |
| `/hostels` | `app/hostels/page.jsx` | Client | Hardcoded |
| `/messes` | `app/messes/page.jsx` | Client | Hardcoded |
| `/Team` | `app/Team/page.jsx` | Client | Hardcoded |
| `/Contact-Us` | `app/Contact-Us/page.jsx` | Client | Hardcoded |
| `/Flagship-events` | `app/Flagship-events/page.jsx` | Client | Hardcoded |
| `/announcements` | `app/announcements/page.js` | Client | `GET /api/events` |
| `/past-events` | `app/past-events/page.js` | Client | `GET /api/events` (⚠ broken) |
| `/admin` | `app/admin/page.js` | Client | NextAuth session + `POST /api/events` |
| `/api/events` | `app/api/events/route.js` | Route handler | MongoDB |
| `/api/auth/*` | `app/api/auth/[...nextauth]/route.js` | Route handler | NextAuth |

**Routing observations (facts):**

- The header navigation ([Header.jsx](../app/components/Header.jsx)) links to 11
  destinations. `/Clubs/General` is labeled "General Council", etc.
- `app/page1.js` and `app/admin/page2.js` are **not routed** by the App Router
  (only `page.js`/`page.jsx` files become routes). They are leftover/alternate
  implementations. `page1.js` references routes that **do not exist**
  (`/Clubs/Wellness`, `/student-life`).
- There is no `/announcements` admin management UI; events can only be **created**
  (no edit/delete) via `/admin`.

## Rendering model

- **All pages are Client Components** (`"use client"` at the top). There is no
  use of Server Components for data fetching, no `generateMetadata` beyond the
  static `metadata` export in `layout.js`, and no ISR/SSG data functions.
- Data that is dynamic (events) is fetched **client-side** with `fetch()` in
  `useEffect`, so it is not server-rendered or cached.
- `next/image` is used widely; remote images require `images.remotePatterns`
  entries in `next.config.mjs` (currently: `res.cloudinary.com`,
  `images.unsplash.com`, `source.unsplash.com`).

## Application bootstrap

`app/layout.js`:
- Loads Google fonts `Geist` and `Geist_Mono` as CSS variables.
- Wraps the tree in `<Providers>` (next-auth `SessionProvider`) then `<Loader>`.
- Sets static metadata: title "Student Affairs-IIT JAMMU".

`loader/Loader.jsx`:
- A client component that shows a full-screen spinner overlay for **800 ms** on
  every `pathname` change (a simulated load, not tied to real data readiness).

## Data flow for the one dynamic feature (Events)

1. **Create:** `/admin` form → `POST /api/events` with `{title, description, date, image}`.
   - The image is read client-side via `FileReader.readAsDataURL` and sent as a
     **base64 data URL** string (⚠ see [KNOWN_ISSUES.md](../KNOWN_ISSUES.md)).
   - `admin/page2.js` (dead) instead sends a plain image **URL** string.
2. **Store:** `POST` handler calls `connectDB()` then `Event.create(data)`.
3. **Read:** `/announcements` → `GET /api/events` → returns **all** events sorted
   by `date` ascending, then splits into upcoming/past client-side using `new Date()`.

## What is NOT present (confirmed absent)

- No tests (`*.test.*`, `*.spec.*`, Cypress, Playwright) anywhere.
- No CI/CD configuration (no `.github/workflows`, no Vercel config committed).
- No environment file (`.env*`) committed (correctly git-ignored).
- No TypeScript (`jsconfig.json` only; project is JavaScript/JSX).
- No state management library, no data-fetching library (SWR/React Query).
- No academic-year, role, organization, or user models beyond `Event`.
- No `node_modules` committed; dependencies must be installed before running.

See [DATA_INVENTORY.md](DATA_INVENTORY.md) for the exhaustive content inventory and
[KNOWN_ISSUES.md](../KNOWN_ISSUES.md) for defects discovered during analysis.
