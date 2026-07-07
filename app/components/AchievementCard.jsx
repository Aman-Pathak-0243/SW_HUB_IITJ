// Presentational renderer for a single Wall-of-Fame achievement (M4) + its hybrid
// ordered blocks. Shared by the public /wall-of-fame page (Server Component) and the
// per-club Achievements tab (inside the client OrgUnitTabs) — it has no hooks, so it
// renders in either context. It is a PURE function of the JSON-safe achievement view
// produced by lib/achievements/public.mjs (media URLs already resolved). Markdown
// blocks carry RAW markdown, rendered SAFELY here via lib/markdown/render.mjs
// (escape-first, DL-077) — no HTML is ever produced upstream.
import Image from "next/image";
import Link from "next/link";
import { renderMarkdown } from "../../lib/markdown/render.mjs";

function fmtDate(d) {
  if (!d) return null;
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return null;
  }
}

function MarkdownBody({ body }) {
  if (!body) return null;
  return <div className="md-body prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }} />;
}

function Block({ block }) {
  switch (block?.kind) {
    case "markdown":
      return <MarkdownBody body={block.body} />;
    case "markdown_image":
      return (
        <div className={`flex flex-col md:items-start gap-4 ${block.imagePosition === "left" ? "md:flex-row" : "md:flex-row-reverse"}`}>
          <div className="relative w-full md:w-56 h-40 rounded-lg overflow-hidden bg-gray-100 shrink-0">
            <Image src={block.imageUrl} alt="" fill sizes="(max-width:768px) 100vw, 224px" className="object-cover" />
          </div>
          <div className="flex-1"><MarkdownBody body={block.body} /></div>
        </div>
      );
    case "banner":
      return (
        <figure>
          <div className="relative w-full h-56 sm:h-72 rounded-lg overflow-hidden bg-gray-100">
            <Image src={block.imageUrl} alt={block.caption ?? ""} fill sizes="(max-width:1024px) 100vw, 1024px" className="object-cover" />
          </div>
          {block.caption && <figcaption className="text-sm text-gray-500 mt-1 text-center">{block.caption}</figcaption>}
        </figure>
      );
    case "link":
      return (
        <a href={block.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-2 text-[#003f87] font-semibold underline break-all">
          🔗 {block.label || block.url}
        </a>
      );
    case "gallery":
      return (
        <div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {block.images.map((src, i) => (
              <div key={i} className="relative w-full h-32 rounded-lg overflow-hidden bg-gray-100">
                <Image src={src} alt="" fill sizes="(max-width:640px) 50vw, 33vw" className="object-cover" />
              </div>
            ))}
          </div>
          {block.caption && <p className="text-sm text-gray-500 mt-1">{block.caption}</p>}
        </div>
      );
    default:
      return null;
  }
}

export function AchievementBlocks({ blocks }) {
  if (!blocks?.length) return null;
  return (
    <div className="space-y-5 mt-4">
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
    </div>
  );
}

// Render the credited members + clubs (clubs link to their page). Members appear by
// display name only (public PII minimization — see lib/achievements/public.mjs).
function Credits({ credits }) {
  const clubs = credits?.clubs ?? [];
  const members = credits?.members ?? [];
  if (!clubs.length && !members.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {clubs.map((c, i) => {
        const label = `🏛️ ${c.name ?? "Club"}${c.role ? ` — ${c.role}` : ""}`;
        const cls = "text-xs font-semibold text-[#003f87] bg-blue-50 px-2.5 py-1 rounded-full";
        // Link to the club's page when the shape carries a slug + type (consolidation
        // review B10 — the docstring promised a link but the chip was a dead span).
        return c.slug && c.typeKey ? (
          <Link key={`c${i}`} href={`/org/${c.typeKey}/${c.slug}`} className={`${cls} hover:bg-blue-100`}>
            {label}
          </Link>
        ) : (
          <span key={`c${i}`} className={cls}>{label}</span>
        );
      })}
      {members.map((m, i) => (
        <span key={`m${i}`} className="text-xs font-semibold text-green-800 bg-green-50 px-2.5 py-1 rounded-full">
          👤 {m.name ?? "Member"}{m.role ? ` — ${m.role}` : ""}
        </span>
      ))}
    </div>
  );
}

// `compact` (the club tab) hides the full body blocks and shows just the header +
// credits + summary; the full /wall-of-fame renders every block.
export default function AchievementCard({ achievement, compact = false }) {
  const a = achievement;
  if (!a) return null;
  return (
    <article className="bg-white rounded-xl shadow overflow-hidden">
      {a.heroUrl && (
        <div className="relative w-full h-48 bg-gray-100">
          <Image src={a.heroUrl} alt={a.title ?? ""} fill sizes="(max-width:768px) 100vw, 50vw" className="object-cover" />
        </div>
      )}
      <div className="p-6">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mb-1">
          {a.category && <span className="text-xs font-semibold text-amber-800 bg-amber-100 px-2.5 py-1 rounded-full">🏆 {a.category}</span>}
          {fmtDate(a.achievementDate) && <span>📅 {fmtDate(a.achievementDate)}</span>}
        </div>
        <h3 className="text-xl font-bold text-[#003f87]">{a.title}</h3>
        {a.summary && <p className="text-gray-700 mt-2">{a.summary}</p>}
        <Credits credits={a.credits} />
        {!compact && <AchievementBlocks blocks={a.blocks} />}
      </div>
    </article>
  );
}
