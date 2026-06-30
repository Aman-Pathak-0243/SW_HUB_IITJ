// A thin indeterminate progress bar fixed to the top of the viewport — the kind
// you see on YouTube/GitHub. Pure CSS (no JS, no deps), so it paints instantly as
// a Suspense fallback (a route loading.jsx) while a server component awaits slow
// data (e.g. a cold Neon compute waking). Brand gradient: #003f87 → #ff6b00.
//
// It also defines the shared `tlb-shimmer` keyframe used by skeleton rows, so any
// file that renders <TopLoadingBar/> gets the skeleton animation too.
export default function TopLoadingBar({ label }) {
  return (
    <>
      <style>{`
        @keyframes tlb-slide {
          0%   { left: -40%; width: 40%; }
          50%  { left: 25%;  width: 55%; }
          100% { left: 100%; width: 40%; }
        }
        @keyframes tlb-shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: "rgba(0, 63, 135, 0.12)",
          zIndex: 9999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            height: "100%",
            borderRadius: 2,
            background: "linear-gradient(90deg, #003f87, #ff6b00)",
            animation: "tlb-slide 1.1s ease-in-out infinite",
          }}
        />
      </div>
      {label ? (
        <span
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            top: 8,
            right: 12,
            fontSize: 12,
            color: "#6b7280",
            zIndex: 9999,
          }}
        >
          {label}
        </span>
      ) : null}
    </>
  );
}
