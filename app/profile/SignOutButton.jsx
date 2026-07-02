"use client";

import { signOut } from "next-auth/react";

// Small client island for the otherwise server-rendered public profile page.
export default function SignOutButton() {
  return (
    <button
      type="button"
      className="profile-signout"
      onClick={() => signOut({ callbackUrl: "/" })}
    >
      Sign out
    </button>
  );
}
