"use client";

import { useEffect } from "react";

// Admin error boundary — "unbreakable" backstop. If a server render still throws
// (e.g. Neon stayed unreachable past the lib/prisma.mjs retries), the user sees a
// friendly retry button instead of a crashed/blank page. reset() re-renders the
// segment, which re-runs the server component (and by then the DB is usually warm).
export default function AdminError({ error, reset }) {
  useEffect(() => {
    console.error("[admin] render error:", error);
  }, [error]);

  const isDb = /reach database server|P1001|P1017|P2024|Can't reach/i.test(
    String(error?.message ?? "")
  );

  return (
    <div style={{ padding: 40, maxWidth: 560 }}>
      <h2 style={{ color: "#003f87", marginBottom: 8, fontSize: 22, fontWeight: 700 }}>
        {isDb ? "Database is waking up" : "Something went wrong"}
      </h2>
      <p style={{ color: "#6b7280", marginBottom: 22, lineHeight: 1.5 }}>
        {isDb
          ? "The database was momentarily unreachable — it auto-suspends when idle and takes a few seconds to wake. Please try again."
          : "An unexpected error occurred while loading this page."}
      </p>
      <button
        onClick={() => reset()}
        style={{
          background: "#003f87",
          color: "#fff",
          border: 0,
          borderRadius: 8,
          padding: "10px 18px",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        Try again
      </button>
    </div>
  );
}
