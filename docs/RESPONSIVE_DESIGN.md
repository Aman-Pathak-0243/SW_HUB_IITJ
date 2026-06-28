# Responsive Design (V2.0 — Proposed)

> **Status:** Proposed standard. The current site is partially responsive
> (Tailwind breakpoints + a dedicated mobile header); V2 makes responsiveness a
> validated gate.

## Requirement (from the master spec)

The portal must be **mobile-first** and fully responsive across:

- phones
- foldables
- tablets
- laptops
- desktops
- ultra-wide displays

**Responsiveness is validated before any milestone completes.**

## Current state (facts)

- Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) used across pages.
- `Header.jsx` has explicit media queries at `900px`, `768px`, `360px` and a
  separate mobile header with a hamburger menu.
- Hero sections scale with viewport units (`h-[50vh] sm:h-[60vh] md:h-[65vh]`).
- No evidence of testing on foldables, tablets, or ultra-wide; no automated
  responsive checks.

## Target breakpoints (proposed)

Aligned with Tailwind defaults plus an ultra-wide tier:

| Tier | Width (approx) | Notes |
|---|---|---|
| Phone | 320–479 px | Mobile-first base; test 360 px (existing breakpoint) |
| Large phone / small foldable | 480–639 px | |
| Foldable (unfolded) / small tablet | 640–767 px (`sm`) | |
| Tablet | 768–1023 px (`md`) | Existing mobile→desktop switch at 768 |
| Laptop | 1024–1279 px (`lg`) | |
| Desktop | 1280–1535 px (`xl`) | |
| Ultra-wide | ≥ 1536 px (`2xl`+) | Add a max-content width + centered layout |

## Standards (V2)

- **Mobile-first CSS**: base styles target the smallest screen; enhance upward.
- **No horizontal scroll** at any tier; tap targets ≥ 44×44 px.
- **Fluid type** via `clamp()` for headings (already used on the announcements
  hero).
- **Content max-width** on ultra-wide so lines don't over-stretch.
- **Images** use `next/image` with correct `sizes`; no fixed pixel layouts that
  overflow small screens.
- Respect `prefers-reduced-motion`.

## Validation (V2)

- Playwright runs key pages at representative viewports for each tier and asserts
  no overflow / visible nav / readable content.
- Manual QA on at least one real phone, tablet, and a wide monitor per milestone.
- Cross-browser: Chromium, Firefox, WebKit.

See [TESTING_STRATEGY.md](TESTING_STRATEGY.md) for how this plugs into the gate.
