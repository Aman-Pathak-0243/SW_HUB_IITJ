// Presentational announcement card (Session 6). Renders one shaped announcement
// (lib/events/public.mjs): pinned badge, title, publish date, body, and a
// non-public audience tag. Pure — no DB, no client state. Announcements are
// ordered pinned-first by the read layer (DL-010); the pinned badge makes that
// visible.
const AUDIENCE_LABEL = {
  students: "Students",
  faculty: "Faculty",
  staff: "Staff",
  internal: "Internal",
};

function formatDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AnnouncementCard({ announcement }) {
  const a = announcement;
  const date = formatDate(a.publishedAt);
  const audienceLabel = a.audience && a.audience !== "public" ? AUDIENCE_LABEL[a.audience] ?? a.audience : null;

  return (
    <article
      className={`relative bg-white rounded-2xl border p-6 shadow-sm transition hover:shadow-md ${
        a.pinned ? "border-[#FF6B00]/40 ring-1 ring-[#FF6B00]/20" : "border-[#003f87]/10"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {a.pinned && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#FF6B00] bg-[#FF6B00]/10 px-2.5 py-0.5 rounded-full">
              📌 Pinned
            </span>
          )}
          {audienceLabel && (
            <span className="inline-flex items-center text-xs font-semibold text-[#003f87] bg-[#003f87]/8 px-2.5 py-0.5 rounded-full">
              For {audienceLabel}
            </span>
          )}
        </div>
        {date && <time className="text-xs text-gray-400 whitespace-nowrap">{date}</time>}
      </div>

      <h3 className="mt-3 text-lg sm:text-xl font-bold text-[#003f87] break-words">{a.title}</h3>
      {a.body && <p className="mt-2 text-gray-600 leading-relaxed whitespace-pre-line break-words">{a.body}</p>}
    </article>
  );
}
