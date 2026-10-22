"use client";

// A drop-in replacement for the usual "relative <sized div> + <Image fill>"
// portrait block used all over the public site (club/council rosters, Team,
// Hostels, Messes, Contact Us). Clicking the photo opens it larger in a modal,
// with the person's name/role underneath — without disturbing the surrounding
// layout (same className goes on the same positioned container as before).
//
// Safe to use inside an <a> card (several Team-page cards are whole-card links to
// an external profile): the click handler calls preventDefault/stopPropagation so
// clicking the PHOTO opens the modal instead of following the link, while the rest
// of the card still navigates as before.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

export default function PersonPhoto({ src, alt, name, role, className, imgClassName = "object-cover", sizes, fallback = null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // `fallback` is a complete element (its own sizing/background classes already
  // match the photo case's `className`) — returned as-is, not re-wrapped.
  if (!src) return fallback ?? <div className={className} />;

  const openModal = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <div
        className={className}
        role="button"
        tabIndex={0}
        onClick={openModal}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openModal(e);
        }}
        aria-label={`View photo${name ? ` of ${name}` : ""}`}
        style={{ cursor: "zoom-in" }}
      >
        <Image src={src} alt={alt ?? name ?? ""} fill sizes={sizes} className={imgClassName} />
      </div>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          // Rendered via portal straight into <body>: several cards this sits
          // inside use a hover transform (scale/translate) + overflow-hidden,
          // which turns that card into a containing block for `position: fixed`
          // descendants and clips the modal inside it instead of the viewport.
          // A portal sidesteps that entirely.
          <div
            className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label={name ? `Photo of ${name}` : "Photo"}
          >
            <div className="relative max-w-md w-full bg-white rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 text-lg leading-none"
                aria-label="Close"
              >
                ✕
              </button>
              <div className="relative w-full aspect-square bg-gray-100">
                <Image src={src} alt={alt ?? name ?? ""} fill sizes="(max-width: 768px) 100vw, 480px" className="object-cover" />
              </div>
              {(name || role) && (
                <div className="p-5 text-center">
                  {name && <p className="text-xl font-bold text-[#003f87]">{name}</p>}
                  {role && <p className="text-gray-600 mt-1">{role}</p>}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
