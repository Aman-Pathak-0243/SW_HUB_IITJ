# Performance (V2.0 — Proposed)

> **Status:** Proposed targets and techniques. Some current behaviors hurt
> performance (noted below) and are addressed during V2.

## Current performance observations (facts)

- **Everything is a Client Component**, including static pages → larger JS
  payloads and no server rendering of static content.
- **Client-side data fetching** in `useEffect` (events) → no caching, waterfalls,
  and no SSR for that content.
- **Base64 images stored in the DB** and returned inline → very large API
  responses for events with uploaded images.
- **`/public` is ~74 MB** of images shipped with the app.
- **Duplicate Google Fonts `@import`s** across components → extra requests +
  layout shift.
- A **fixed 800 ms loader** on every route change adds artificial latency.
- Hero/club pages auto-rotate many full-bleed images.

## Targets (V2)

Aim for "excellent" Core Web Vitals on a mid-range mobile device:

| Metric | Target |
|---|---|
| LCP | ≤ 2.5 s |
| CLS | ≤ 0.1 |
| INP | ≤ 200 ms |
| Lighthouse Performance | ≥ 90 (mobile) |

Budgets are enforced by Lighthouse CI (see [TESTING_STRATEGY.md](TESTING_STRATEGY.md)).

## Techniques (from the master spec) and how V2 applies them

- **Lazy loading** — defer below-the-fold images/components; dynamic-import heavy
  client widgets (e.g. `PdfSlideshow`).
- **Optimized queries** — add indexes (e.g. `Event.date`, `academicYearId`);
  project only needed fields; avoid returning base64 blobs.
- **Caching** — server-render + cache published content; use Next.js caching /
  revalidation instead of client fetch where possible.
- **Pagination** — paginate events/announcements/lists instead of returning all.
- **Responsive images** — serve Cloudinary transformations (sized/format-optimized)
  and use `next/image` `sizes` properly.
- **Skeleton loaders** — replace the blunt 800 ms overlay with per-section
  skeletons tied to real readiness.
- **Smooth UX** — preserve animations but respect `prefers-reduced-motion`.

## Media-specific

- Migrate base64 event images and large `/public` assets to Cloudinary (via the
  Media Migration Tool), delivering responsive, format-optimized variants.
- Set long cache headers on immutable media.

## Measurement

- Lighthouse CI per milestone; archive reports and link from `PROGRESS.md`.
- Track payload sizes and largest assets; flag regressions in review.

> No performance changes are made during the analysis phase; these are applied
> within the relevant V2 milestones.
