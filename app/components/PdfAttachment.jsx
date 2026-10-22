// A PDF attached to a content type's cover/hero media field (Events,
// Announcements, Wall of Fame) can't be rendered by next/image — this is what
// shows instead: a view (new tab) and a download link.
export default function PdfAttachment({ url }) {
  if (!url) return null;
  return (
    <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
      <span className="text-2xl shrink-0" aria-hidden="true">📄</span>
      <p className="text-sm font-semibold text-[#003f87] flex-1">PDF attachment</p>
      <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[#003f87] underline shrink-0">
        View
      </a>
      <a href={url} download className="text-xs font-semibold text-[#FF6B00] underline shrink-0">
        Download
      </a>
    </div>
  );
}
