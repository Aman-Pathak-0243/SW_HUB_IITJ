// Edge middleware (M0, DL-058) — enforces the forced first-login password change.
// It reads ONLY the JWT (no DB), so it is Edge-safe and naturally inert when the
// member-platform plugin is OFF (no account is ever flagged must-change then). The
// routing decision is the pure, unit-tested shouldForcePasswordChange.
import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { PASSWORD_CHANGE_PATH, shouldForcePasswordChange } from "./lib/auth/must-change.mjs";

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (token && shouldForcePasswordChange({ mustChange: token.mustChangePassword, pathname })) {
    const url = req.nextUrl.clone();
    url.pathname = PASSWORD_CHANGE_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

// Run on app routes, skipping Next internals + static assets (the pure helper also
// exempts /_next and /favicon as defense-in-depth).
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|css|js|map|txt|xml|woff|woff2)$).*)",
  ],
};
