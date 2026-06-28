# Components (As-Is)

This catalogs the React components in the repository and their responsibilities.
There are **4 shared components**, **1 global loader**, **1 providers wrapper**,
and **13 page components** (plus 2 dead/alternate pages).

## Shared components — `app/components/`

### `Header.jsx` (Client)
- Global site header: tricolor accent bar, IIT Jammu logo (links to iitjammu.ac.in),
  centered SAC + Sports logos + brand text, and a right slot showing either an
  animated waving **Indian flag GIF** (Cloudinary) or, on council pages, the
  council logo.
- Desktop nav + mobile hamburger menu. `navItems` (11 links) is **hardcoded**.
- `councilConfig` maps `/Clubs/Academic` and `/Clubs/Cultural` to logos/labels.
- Tracks scroll state (`scrolled`) and active route (`usePathname`).
- **Styling:** a very large inline `<style>` block (~210 lines of CSS) plus a
  Google Fonts `@import` (Cormorant Garamond + Outfit). Defines CSS variables
  (`--iitj-blue: #003087`, `--iitj-saffron: #FF6B00`, …).
- **Note:** logos and the flag GIF are remote Cloudinary URLs hardcoded in JSX.

### `Footer.jsx` (Server-compatible; no `"use client"`)
- Logo (`/iit3.png`), copyright "© 2026 IIT Jammu", two contact cards
  (HOS Student Affairs `0191-257-0286`, Student Welfare Office `0191-257-0697`),
  and a credits bar ("Developed by Tushar Singh & Apaar Gupta", "Supervised,
  Hosted & Deployed by Aman Pathak").
- **Styling:** Tailwind + inline `style` objects; hardcoded colors `#003f87`,
  `#f5a623`.

### `EventCard.js` (Server-compatible)
- Presentation card for one event: image (or 🎓 placeholder), date badge
  (day/month/year via `toLocaleDateString("en-IN")`), title, description
  (clamped to 3 lines), "SAC · IIT Jammu" tag.
- **Styling:** large inline `<style>` block + Google Fonts `@import`.
- Used by `/announcements` and `/past-events`.

### `PdfSlideshow.jsx` (Client)
- Renders the actual pages of a PDF to a `<canvas>` using **pdf.js** (`pdfjs-dist`),
  with prev/next arrows, dot indicators, auto-advance (4 s), pause-on-hover, and a
  "View in Detail" external link.
- Loads pdf.js lazily and sets `GlobalWorkerOptions.workerSrc` to
  `pdfjs-dist/build/pdf.worker.min.mjs` via `import.meta.url`.
- Props: `pdfUrl`, `driveUrl`, `title`, `autoPlayInterval`.
- ⚠️ **Version hazard:** the file's own comments state it must be pinned to
  `pdfjs-dist@3.11.174` (3.x) to avoid an upstream `render()` regression, and
  reference the **3.x** worker path `build/pdf.worker.min.js`. But `package.json`
  declares `pdfjs-dist@^6.0.227` and the code imports the **`.mjs`** worker. This
  inconsistency is a real runtime risk. See [KNOWN_ISSUES.md](../KNOWN_ISSUES.md).
- Used by all four Clubs pages, `/hostels`, and `/messes`.

## Global wrappers

### `loader/Loader.jsx` (Client)
- Shows a full-screen spinner overlay for a fixed **800 ms** on every route
  change (`usePathname`), animated with `motion/react`. It is **simulated** —
  not connected to actual data loading.

### `app/providers.jsx` (Client)
- Wraps children in next-auth `SessionProvider`.

## Page components — `app/`

| Component | Route | Notes |
|---|---|---|
| `page.js` | `/` | Home: hero slideshow, marquee, vision/mission, Dean's message, quotes. Uses `styled-jsx` (`<style jsx>`). |
| `Clubs/Academic/page.jsx` | `/Clubs/Academic` | Hero slider, leadership cards, clubs grid, vision/mission modal, `PdfSlideshow`. |
| `Clubs/Cultural/page.jsx` | `/Clubs/Cultural` | Same shape (8 clubs). |
| `Clubs/General/page.jsx` | `/Clubs/General` | Same shape (6 clubs). |
| `Clubs/Sports/page.jsx` | `/Clubs/Sports` | Same shape (11 clubs, 5 leadership). |
| `hostels/page.jsx` | `/hostels` | 6 hostels with staff, `PdfSlideshow`. |
| `messes/page.jsx` | `/messes` | 5 messes, timings, 16-member committee, `PdfSlideshow`. |
| `Team/page.jsx` | `/Team` | ~37 people across 7 groups. |
| `Contact-Us/page.jsx` | `/Contact-Us` | Contact card, social icons, Maps embed. |
| `Flagship-events/page.jsx` | `/Flagship-events` | 6 flagship events. |
| `announcements/page.js` | `/announcements` | Fetches `/api/events`, splits upcoming/past, renders `EventCard`. |
| `past-events/page.js` | `/past-events` | ⚠ Broken fetch contract — always empty. |
| `admin/page.js` | `/admin` | Google login + "Publish Event" form (base64 image upload). |

### Dead / alternate (not routed)
- `app/page1.js` — older home page; links to non-existent routes
  (`/Clubs/Wellness`, `/student-life`). Safe to remove in V2.
- `app/admin/page2.js` — simpler "Add Event" form posting an image **URL**
  (no auth UI). Safe to remove in V2.

## Cross-cutting component observations

- **Heavy duplication:** the four Clubs pages share ~the same structure and a lot
  of near-identical markup/logic, copy-pasted per page. Prime candidate for a
  single data-driven `<CouncilPage>` in V2.
- **Mixed styling strategies:** inline `<style>` blocks, `styled-jsx`, Tailwind
  utility classes, and inline `style` objects all coexist (see
  [STYLING_THEME_TYPOGRAPHY.md](STYLING_THEME_TYPOGRAPHY.md)).
- **Repeated Google Fonts `@import`** inside multiple component `<style>` blocks
  (Header, EventCard, admin, announcements) — should be hoisted to one place.
- **Almost everything is a Client Component**, even purely static pages — limits
  server rendering and SEO benefits. V2 should move static content to Server
  Components where possible.
