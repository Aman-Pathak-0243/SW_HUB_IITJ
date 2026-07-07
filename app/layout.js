import { Geist, Geist_Mono, Cormorant_Garamond, Outfit } from "next/font/google"
import "./globals.css"
import Loader from "@/loader/Loader"
import Providers from "./providers"
import UsageBeacon from "./components/UsageBeacon"

// Font consolidation (Session 10, KNOWN_ISSUES #12). ALL fonts are now loaded once
// here via next/font/google, which self-hosts them and emits optimized @font-face
// in <head> with size-adjust fallbacks (no layout shift, no duplicate requests).
// This replaces the per-component `@import url(fonts.googleapis…)` that previously
// lived inside Header/EventCard <style> tags (render-blocking + duplicated). Each
// font exposes a CSS variable consumed by globals.css, admin.css, Header, EventCard
// and Footer — one source of truth for typography.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"], display: "swap" })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" })
// Brand display serif (council/brand titles) + UI sans (body/nav/admin).
// Includes weight 400 so body text that inherits the Cormorant variable (the
// footer) has a real regular face, not a synthesized/fallback one.
const cormorant = Cormorant_Garamond({ variable: "--font-cormorant", subsets: ["latin"], weight: ["400", "600", "700"], display: "swap" })
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], display: "swap" })

export const metadata = {
  title: "Student Affairs-IIT JAMMU",
  description: "Student Affairs website of IIT JAMMU",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${cormorant.variable} ${outfit.variable} antialiased`}
      >
        {/* ✅ Auth Context available to entire app */}
        <Providers>
          {/* Hidden usage-analytics beacon (M8) — best-effort, inert when the plugin is off. */}
          <UsageBeacon />
          <Loader>{children}</Loader>
        </Providers>
      </body>
    </html>
  )
}
