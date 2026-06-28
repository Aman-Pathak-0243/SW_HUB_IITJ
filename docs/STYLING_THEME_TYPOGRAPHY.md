# Styling, Theme & Typography (As-Is)

## Styling approach (mixed — by design or accident)

The project uses **four** different styling mechanisms simultaneously:

1. **Tailwind CSS v4** — imported in `app/globals.css` via `@import "tailwindcss";`,
   configured through `postcss.config.mjs` (`@tailwindcss/postcss`). Used heavily
   for layout/spacing across most pages.
2. **Large inline `<style>` blocks** — e.g. `Header.jsx` (~210 lines),
   `EventCard.js`, `admin/page.js`, `announcements/page.js`. These define
   component-scoped CSS and `@keyframes`.
3. **`styled-jsx`** — `app/page.js` uses `<style jsx>` for home-page animations.
4. **Inline `style={{…}}` objects** — `Footer.jsx`, parts of `Header.jsx`, hostels.

There is **no global design-token system** beyond CSS variables declared inside
`Header.jsx`'s `<style>` block. The same brand colors are re-typed as hex
literals throughout the codebase. `globals.css` itself is minimal (a `tailwindcss`
import, an `h1 { color:#003f87 }` rule, and one `fadeIn` keyframe).

## Color palette (extracted from code)

The institute brand is blue + saffron, with the Indian tricolor as an accent.

| Token (as used) | Value | Where |
|---|---|---|
| Primary blue | `#003087` (`--iitj-blue`) | Header CSS vars |
| Primary blue (alt) | `#003f87` | globals.css, Footer, many pages |
| Blue dark | `#001f5c` (`--iitj-blue-dark`) | Header gradients |
| Blue mid | `#00419e` (`--iitj-blue-mid`) | Header gradients |
| Saffron | `#FF6B00` (`--iitj-saffron`) | Accents, eyebrows |
| Saffron light | `#FF8C3A` (`--iitj-saffron-lt`) | Header |
| Tricolor saffron | `#FF9933` | Header bar |
| Tricolor green | `#138808` | Header bar |
| Footer gold | `#f5a623` / `#e07b00` | Footer accents |
| Off-white | `#f4f7ff` / `#f0f4fb` | Backgrounds |

> ⚠️ **Inconsistency:** two near-identical primary blues (`#003087` vs `#003f87`)
> are used interchangeably. V2 should unify to a single token.

## Typography (extracted from code)

- **App fonts (layout):** `Geist` and `Geist_Mono` loaded via `next/font/google`
  in `app/layout.js` as CSS variables (`--font-geist-sans`, `--font-geist-mono`).
- **Component fonts:** several components `@import` **Cormorant Garamond**
  (headings, serif) and **Outfit** (body, sans) directly from Google Fonts inside
  their `<style>` blocks — bypassing `next/font`. This causes layout-shift and
  duplicate font requests.
- **Footer** sets `fontFamily: "'Georgia', serif"` inline.

> ⚠️ **Inconsistency:** three font systems coexist (Geist via next/font; Cormorant
> + Outfit via @import; Georgia inline). V2 should standardize via `next/font`.

## Responsiveness (current)

- Pages use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) and `Header.jsx`
  defines explicit media queries at `900px`, `768px`, `360px` with a separate
  mobile header + hamburger menu.
- Hero sections use viewport heights (`h-[50vh] sm:h-[60vh] md:h-[65vh]`).
- No systematic testing of foldables, tablets, or ultra-wide displays exists.
  See [RESPONSIVE_DESIGN.md](RESPONSIVE_DESIGN.md) for the V2 requirement.

## Iconography & animation

- Icons: `react-icons` (Fi*, Fa* sets) are used; `lucide`/`lucide-react` are
  installed but usage is minimal/none in the pages reviewed.
- Animation: `motion` (`motion/react`) in `Loader.jsx`; CSS keyframes elsewhere
  (flag wave, fade-ins, marquee, toast).

## Implications for V2

- Establish a **single source of design tokens** (colors, spacing, typography),
  ideally Tailwind theme config + CSS variables, and remove ad-hoc hex literals.
- Consolidate fonts under `next/font` (Cormorant Garamond + Outfit + a mono),
  removing all inline Google Fonts `@import`s.
- Extract repeated component CSS into shared styles or Tailwind components.
- Pick one primary-blue value and apply it everywhere.

These are improvements only; **no styling changes are made during the analysis
phase.**
