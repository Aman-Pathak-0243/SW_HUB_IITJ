import TopLoadingBar from "../components/TopLoadingBar";

// Real Suspense fallback for every /admin/* page. Next renders this for the WHOLE
// duration of a slow server render (e.g. a cold Neon DB taking several seconds),
// unlike the old client-side 800ms timer overlay (loader/Loader.jsx) that hid long
// before the data arrived and left the page looking frozen. Shows a top progress
// bar + a lightweight skeleton.
export default function AdminLoading() {
  return (
    <div style={{ padding: 24 }}>
      <TopLoadingBar label="Loading…" />
      <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
        <div
          style={{
            height: 28,
            width: "38%",
            borderRadius: 8,
            background: "linear-gradient(90deg,#eef2f9,#dfe7f4,#eef2f9)",
            backgroundSize: "200% 100%",
            animation: "tlb-shimmer 1.2s linear infinite",
          }}
        />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              height: 16,
              width: `${92 - i * 9}%`,
              borderRadius: 6,
              background: "linear-gradient(90deg,#eef2f9,#e2e8f5,#eef2f9)",
              backgroundSize: "200% 100%",
              animation: "tlb-shimmer 1.2s linear infinite",
            }}
          />
        ))}
      </div>
    </div>
  );
}
