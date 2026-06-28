// Per-org-unit Resources renderer (Session 7). Renders the published `resource`
// content (lib/resources/public.mjs) attached to an org unit: a PDF resource is
// shown via the existing <PdfSlideshow> (real PDF pages + a "View in Detail" Drive
// button), reproducing the V1 infrastructure-PDF blocks from data; a link/Drive
// resource (or a PDF whose file URL is missing/unresolved) falls back to a simple
// card with an open button. Client component because PdfSlideshow renders to a
// canvas; the data is fetched server-side and passed in (view.resources).
"use client";

import PdfSlideshow from "./PdfSlideshow";

// A URL pdf.js / an <a> can actually fetch: a "/public" path or an http(s) URL.
// The Session-6 base64 placeholder marker (and any other non-URL) is rejected, so
// an unmigrated placeholder never crashes the slideshow — it degrades to a card.
function isRenderableUrl(url) {
  if (!url) return false;
  if (url.startsWith("/")) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

function ResourceCard({ resource }) {
  const href = resource.externalUrl || (isRenderableUrl(resource.fileUrl) ? resource.fileUrl : null);
  // Label by the ACTUAL destination, not resourceKind: when we fall back to the
  // file we say "Open PDF/File"; when the link is the external/Drive URL we say
  // "View in Detail"/"Open Link" (so a pdf resource whose file didn't resolve
  // doesn't say "Open PDF" while pointing at Drive).
  const label =
    href && href === resource.fileUrl
      ? resource.fileKind === "pdf"
        ? "Open PDF"
        : "Open File"
      : resource.resourceKind === "drive"
        ? "View in Detail"
        : "Open Link";
  return (
    <div className="bg-white rounded-2xl shadow-md p-6 md:p-8 text-center">
      <h3 className="text-xl md:text-2xl font-bold text-[#003f87]">{resource.title}</h3>
      {resource.description && <p className="text-gray-600 mt-2 max-w-2xl mx-auto">{resource.description}</p>}
      {href && (
        <div className="flex justify-center mt-5">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#003f87] text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-[#002a5c] hover:scale-105 transition-all duration-300"
          >
            {label}
          </a>
        </div>
      )}
    </div>
  );
}

export default function ResourcesSection({ resources = [] }) {
  if (!resources?.length) return null;
  return (
    <section className="max-w-6xl mx-auto px-6 mt-12">
      <h2 className="text-2xl font-bold text-[#003f87] mb-6">Resources</h2>
      <div className="space-y-10">
        {resources.map((r) => {
          const showPdf = r.resourceKind === "pdf" && r.fileKind === "pdf" && isRenderableUrl(r.fileUrl);
          return showPdf ? (
            <PdfSlideshow key={r.id} pdfUrl={r.fileUrl} driveUrl={r.externalUrl || "#"} title={r.title || "Resource"} />
          ) : (
            <ResourceCard key={r.id} resource={r} />
          );
        })}
      </div>
    </section>
  );
}
