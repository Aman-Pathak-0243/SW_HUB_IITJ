"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";

/**
 * PdfSlideshow
 * Renders the actual pages of a PDF (no separate image extraction) as a
 * slideshow with prev/next arrows + dot indicators, matching the visual
 * style of the hostel image carousels on this page.
 *
 * Usage:
 *   <PdfSlideshow
 *     pdfUrl="/hostel-infra/Hostel_Infrastructure_Details.pdf"
 *     driveUrl="https://drive.google.com/your-share-link"
 *   />
 *
 * NOTE: Place the PDF file inside your Next.js `public/` folder (e.g.
 * public/hostel-infra/Hostel_Infrastructure_Details.pdf) and point
 * pdfUrl at that path, OR host it on Cloudinary/elsewhere and pass the
 * full URL — pdf.js can fetch from any reachable URL.
 */

let pdfjsLibPromise = null;
function loadPdfJs() {
  if (!pdfjsLibPromise) {
    // NOTE: pinned to pdfjs-dist@3.11.174 — newer 5.x/6.x releases have an
    // active upstream rendering regression ("getOrInsertComputed is not a
    // function", see mozilla/pdf.js#20680) that silently fails page.render()
    // and leaves the canvas blank. 3.11.174 is a known-stable release.
    // package.json should pin: "pdfjs-dist": "3.11.174"
    pdfjsLibPromise = import("pdfjs-dist/build/pdf").then((mod) => {
      // Some bundlers expose the library on `.default`, others spread it
      // directly onto the module namespace — handle both.
      const pdfjsLib = mod.default && mod.default.getDocument ? mod.default : mod;
     const workerUrl = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjsLib;
    });
  }
  return pdfjsLibPromise;
}

export default function PdfSlideshow({
  pdfUrl,
  driveUrl = "#",
  title = "Hostel Infrastructure & Details",
  autoPlayInterval = 4000, // ms between auto-advancing pages
}) {
  const canvasRef = useRef(null);
  const pdfDocRef = useRef(null);

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPaused, setIsPaused] = useState(false);

  /* ---- Load the PDF document once ---- */
  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!pdfUrl) {
        setError("No PDF URL was provided to the slideshow.");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const pdfjsLib = await loadPdfJs();
        const loadingTask = pdfjsLib.getDocument({ url: pdfUrl });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages);
        setCurrentPage(1);
      } catch (err) {
        console.error("Failed to load PDF:", err);
        if (!cancelled) setError("Could not load the PDF preview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  /* ---- Render the current page onto the canvas ---- */
  /* ---- Render the current page onto the canvas ---- */
  const renderTaskRef = useRef(null);
  const renderPage = useCallback(async (pageNum) => {
    const pdfDoc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!pdfDoc || !canvas) return;

    // Cancel any render still in flight before starting a new one — pdf.js
    // throws if you call render() again on the same canvas while a
    // previous render hasn't finished (this is what caused the random
    // "Cannot use the same canvas during multiple render() operations"
    // error during auto-advance, when the timer fires faster than a
    // render completes).
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    try {
      const page = await pdfDoc.getPage(pageNum);

      // Scale to fit container width nicely while keeping crispness
      const containerWidth = canvas.parentElement?.clientWidth || 800;
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = (containerWidth / baseViewport.width) * 2; // 2x for sharpness
      const viewport = page.getViewport({ scale });

      const context = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = "100%";
      canvas.style.height = "auto";

      const renderTask = page.render({ canvasContext: context, viewport });
      renderTaskRef.current = renderTask;
      await renderTask.promise;
      // Only clear if this is still the active task (a newer one may have
      // already taken over while we were awaiting).
      if (renderTaskRef.current === renderTask) {
        renderTaskRef.current = null;
      }
    } catch (err) {
      // Cancelling an in-flight render is expected/intentional (see above)
      // and rejects with this name — it is not a real failure, so don't
      // surface it as an error to the user.
      if (err?.name === "RenderingCancelledException") return;
      console.error("Failed to render PDF page:", err);
      setError("Could not render the PDF preview.");
    }
  }, []);

  useEffect(() => {
    if (!loading && numPages > 0) {
      renderPage(currentPage);
    }
  }, [currentPage, loading, numPages, renderPage]);

  /* ---- Auto-advance slideshow ---- */
  useEffect(() => {
    if (loading || error || numPages <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setCurrentPage((p) => (p === numPages ? 1 : p + 1));
    }, autoPlayInterval);

    return () => clearInterval(timer);
  }, [loading, error, numPages, isPaused, autoPlayInterval]);

  // Briefly pause auto-advance after manual interaction, then resume
  const resumeTimerRef = useRef(null);
  const pauseThenResume = () => {
    setIsPaused(true);
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => setIsPaused(false), autoPlayInterval);
  };

  const goPrev = () => {
    setCurrentPage((p) => (p === 1 ? numPages : p - 1));
    pauseThenResume();
  };
  const goNext = () => {
    setCurrentPage((p) => (p === numPages ? 1 : p + 1));
    pauseThenResume();
  };
  const goToPage = (n) => {
    setCurrentPage(n);
    pauseThenResume();
  };

  return (
    <div className="max-w-6xl mx-auto px-6 mb-16">
      <div className="bg-white rounded-2xl shadow-md p-6 md:p-8">

        {/* Heading */}
        <div className="text-center mb-6">
          <h3 className="text-2xl md:text-3xl font-bold text-[#003f87]">
            {title}
          </h3>
          <div className="w-16 h-1 bg-[#003f87] mx-auto mt-2 rounded-full" />
        </div>

        {/* Slideshow viewport */}
        <div
          className="relative w-full max-w-[700px] mx-auto bg-gray-50 rounded-xl overflow-hidden border border-gray-200 shadow-inner"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >

          {loading && (
            <div className="flex items-center justify-center aspect-[4/3] text-gray-400">
              Loading PDF preview…
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center aspect-[4/3] text-red-500 px-6 text-center">
              {error}
            </div>
          )}

          {!error && (
            <canvas
              ref={canvasRef}
              className={`block w-full ${loading ? "hidden" : ""}`}
            />
          )}

          {/* Prev / Next arrows */}
          {!loading && !error && numPages > 1 && (
            <>
              <button
                onClick={goPrev}
                aria-label="Previous page"
                className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-[#003f87] rounded-full w-10 h-10 flex items-center justify-center shadow-md transition"
              >
                ‹
              </button>
              <button
                onClick={goNext}
                aria-label="Next page"
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-[#003f87] rounded-full w-10 h-10 flex items-center justify-center shadow-md transition"
              >
                ›
              </button>
            </>
          )}
        </div>

        {/* Dot indicators */}
        {!loading && !error && numPages > 1 && (
          <div className="flex justify-center gap-2 mt-4 flex-wrap max-w-[600px] mx-auto">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => goToPage(n)}
                aria-label={`Go to page ${n}`}
                className={`w-2.5 h-2.5 rounded-full transition ${
                  n === currentPage ? "bg-[#003f87]" : "bg-gray-300 hover:bg-gray-400"
                }`}
              />
            ))}
          </div>
        )}

        {/* Page counter */}
        {!loading && !error && (
          <p className="text-center text-sm text-gray-500 mt-2">
            Page {currentPage} of {numPages}
          </p>
        )}

        {/* View in Detail button */}
        <div className="flex justify-center mt-6">
          <a
            href={driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-[#003f87] text-white font-semibold px-6 py-3 rounded-full shadow hover:bg-[#002a5c] hover:scale-105 transition-all duration-300"
          >
            View in Detail
          </a>
        </div>

      </div>
    </div>
  );
}
