// Client usage-analytics beacon (M8 follow-up, DL-071/080). On each client-side
// navigation it fires ONE best-effort POST to /api/usage with the current path +
// its first-segment "section". Fire-and-forget: it never awaits, never blocks the
// render, and swallows every error. The endpoint is same-origin + rate-limited and
// only records while the member_platform plugin is ON (else a silent 204), so this
// is inert on a plugin-off deployment. Mounted once in the root layout so the M8
// usage dashboard (getUsageAnalytics) starts collecting data across every page.
"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function UsageBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    const section = pathname.split("/").filter(Boolean)[0] ?? "home";
    try {
      fetch("/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathname, section }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* best-effort — never surface analytics errors */
    }
  }, [pathname]);
  return null;
}
