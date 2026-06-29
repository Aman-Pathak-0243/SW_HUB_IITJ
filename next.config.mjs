/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allowed remote hosts for next/image. Every media asset the app renders —
    // V1 Cloudinary photos/logos AND the Session-7 /public → Cloudinary migration
    // output — resolves through res.cloudinary.com, so it is the single host we
    // allowlist. (The unused images.unsplash.com / source.unsplash.com patterns
    // were removed — KNOWN_ISSUES #17.) Local "/public" paths need no entry.
    // AVIF/WebP are negotiated by the optimizer; combined with the source-side
    // Cloudinary f_auto,q_auto (lib/media/cloudinary.mjs#cloudinaryAutoUrl) this
    // keeps image bytes small on the public pages (Session-10 CWV).
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },

  // Security response headers (Session 10 deploy hardening). Applied to every
  // route. These are the universally-safe headers that don't risk breaking the
  // app's inline <style> tags / next/font / next/image. A full Content-Security-
  // Policy is intentionally NOT set here: the public components inject inline
  // <style> and the app relies on framework-inlined styles, so a strict CSP needs
  // a nonce pipeline — tracked as future hardening in docs/DEPLOYMENT.md.
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "X-DNS-Prefetch-Control", value: "on" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      // HSTS only takes effect over HTTPS (ignored on http://localhost). Safe to
      // send always; instructs browsers to pin HTTPS for the deployed origin.
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  // NFT serverless tracing (KNOWN_ISSUES #32). The Developer-Console readers do
  // filesystem reads at runtime: status.mjs reads prisma/migrations/ (migration
  // diff) and reports.mjs reads docs/Token_Usage.md (token report). Explicitly
  // include those files in the trace for the routes that need them so a serverless
  // build bundles them (rather than relying on the over-broad auto-trace that
  // produced the benign "unexpected file in NFT list" warning). Both readers also
  // degrade gracefully to {error} if a file is missing (DL-048), so this is
  // belt-and-suspenders, not a correctness dependency.
  outputFileTracingIncludes: {
    "/api/dev/status": ["./prisma/migrations/**", "./docs/Token_Usage.md"],
    "/admin/console": ["./prisma/migrations/**", "./docs/Token_Usage.md"],
  },

  turbopack: {
    resolveAlias: {
      canvas: "./empty-module.js",
    },
  },
};

export default nextConfig;
