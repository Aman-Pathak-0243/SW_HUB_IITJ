/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Allowed remote hosts for next/image. Every media asset the app renders —
    // V1 Cloudinary photos/logos AND the Session-7 /public → Cloudinary migration
    // output — resolves through res.cloudinary.com, so it is the single host we
    // allowlist. (The unused images.unsplash.com / source.unsplash.com patterns
    // were removed — KNOWN_ISSUES #17.) Local "/public" paths need no entry.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },
  turbopack: {
    resolveAlias: {
      canvas: "./empty-module.js",
    },
  },
};

export default nextConfig;
