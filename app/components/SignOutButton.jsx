"use client";

import { signOut } from "next-auth/react";

// A minimal client sign-out control (consolidation review B11 — the member UI had no way
// to sign out). Styled to sit inside the member nav (app/account/account.css .mbr-nav-link).
// Clears the NextAuth session and returns to the public home.
export default function SignOutButton({ className = "mbr-nav-link mbr-nav-signout", callbackUrl = "/" }) {
  return (
    <button type="button" className={className} onClick={() => signOut({ callbackUrl })}>
      Sign out
    </button>
  );
}
