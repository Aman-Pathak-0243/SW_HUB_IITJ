import TopLoadingBar from "./components/TopLoadingBar";

// Root-level Suspense fallback (public pages + the first /admin load where the
// admin layout itself is awaiting data). Just the top progress bar so navigation
// always shows immediate, smooth feedback.
export default function RootLoading() {
  return <TopLoadingBar label="Loading…" />;
}
