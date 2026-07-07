// Public /resources index (Session 13) — every published resource for the current year,
// grouped by the unit that owns it. Data-driven (lib/resources/public.mjs); force-dynamic
// so it always reflects the live current year + admin edits. Degrades to a friendly empty
// state when nothing is published yet.
import Link from "next/link";
import { FiFileText, FiImage, FiLink, FiExternalLink, FiFile, FiHardDrive } from "react-icons/fi";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { listAllPublicResources } from "../../lib/resources/public.mjs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Resources · Student Affairs IIT Jammu" };

// org_unit_type key → the /org/<segment> route segment (mess → "messes", not "messs").
const TYPE_SEGMENT = { council: "councils", club: "clubs", hostel: "hostels", mess: "messes" };

// Per data-type presentation (Session 14, DL-100). A resource card renders any kind:
// an image resource shows a thumbnail; a pdf/drive/link/file shows a type icon + a
// coloured badge; every card gets equal height + the correct open action(s).
const KIND_META = {
  pdf: { icon: FiFileText, label: "PDF" },
  image: { icon: FiImage, label: "Image" },
  svg: { icon: FiImage, label: "Image" },
  gif: { icon: FiImage, label: "Image" },
  drive: { icon: FiHardDrive, label: "Drive" },
  link: { icon: FiLink, label: "Link" },
  file: { icon: FiFile, label: "File" },
};

// Prefer the media file's true kind (image/pdf/svg/gif), else the declared resourceKind
// (pdf/link/drive/file), else infer a link vs a bare file.
function resolveKind(r) {
  if (r.fileKind && KIND_META[r.fileKind]) return r.fileKind;
  if (r.resourceKind && KIND_META[r.resourceKind]) return r.resourceKind;
  return r.externalUrl ? "link" : "file";
}

function ResourceCard({ r }) {
  const kind = resolveKind(r);
  const meta = KIND_META[kind] ?? KIND_META.file;
  const Icon = meta.icon;
  const isImage = kind === "image" || kind === "svg" || kind === "gif";
  const badge = (r.resourceKind ?? meta.label).toString();

  return (
    <div className="bg-white rounded-xl shadow hover:shadow-xl transition h-full flex flex-col overflow-hidden border border-[#e2e8f0]">
      {/* Media / icon header — a real thumbnail for images, a typed icon otherwise. */}
      {isImage && r.fileUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.fileUrl} alt={r.title ?? "Resource image"} className="w-full h-36 object-cover bg-gray-100" loading="lazy" />
      ) : (
        <div className="w-full h-36 flex items-center justify-center bg-[#f1f5fb] text-[#003f87]">
          <Icon size={40} aria-hidden="true" />
        </div>
      )}

      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-white bg-[#003f87] rounded px-2 py-0.5">
            <Icon size={12} aria-hidden="true" /> {badge}
          </span>
          {r.fileKind && r.fileKind !== r.resourceKind && <span className="text-xs text-gray-500">{r.fileKind}</span>}
        </div>
        <h3 className="text-base font-bold text-[#003f87]">{r.title ?? "Untitled resource"}</h3>
        {r.summary && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{r.summary}</p>}
        {r.description && <p className="text-sm text-gray-500 mt-2 line-clamp-3">{r.description}</p>}

        {/* Actions pinned to the bottom so cards align. Primary = the file (or the link
            when there is no file); a paired Drive/"View in detail" link shows alongside. */}
        <div className="mt-auto pt-3 flex flex-wrap items-center gap-4">
          {r.fileUrl && (
            <a href={r.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-[#003f87] hover:underline">
              <FiExternalLink size={14} aria-hidden="true" /> Open {meta.label}
            </a>
          )}
          {r.externalUrl && (
            <a href={r.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:underline">
              <FiExternalLink size={13} aria-hidden="true" /> {r.fileUrl ? "View in detail" : "Open link"}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default async function ResourcesPage() {
  let groups = [];
  let errored = false;
  try {
    groups = await listAllPublicResources();
  } catch (e) {
    console.error("[/resources] load failed:", e?.message ?? e);
    errored = true;
  }

  return (
    <>
      <Header />
      <main className="bg-blue-50 min-h-screen pt-24 pb-20">
        <h1 className="text-center text-4xl font-bold text-[#003f87] mb-3">Resources</h1>
        <p className="text-center text-gray-600 mb-10 max-w-2xl mx-auto px-6">
          Documents, guides and links shared by the councils, clubs, hostels and messes.
        </p>

        {errored ? (
          <p className="max-w-3xl mx-auto px-6 text-center text-gray-500">This section is temporarily unavailable.</p>
        ) : groups.length ? (
          groups.map((g, gi) => (
            <section key={gi} className="max-w-7xl mx-auto px-6 mt-10">
              <h2 className="text-xl font-bold text-[#003f87] mb-4">
                {g.unit.slug && TYPE_SEGMENT[g.unit.typeKey] ? (
                  <Link href={`/org/${TYPE_SEGMENT[g.unit.typeKey]}/${g.unit.slug}`} className="hover:underline">{g.unit.name}</Link>
                ) : (
                  g.unit.name ?? "Unit"
                )}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {g.resources.map((r) => <ResourceCard key={r.id} r={r} />)}
              </div>
            </section>
          ))
        ) : (
          <p className="max-w-3xl mx-auto px-6 text-center text-gray-500">No resources are published for the current year yet.</p>
        )}
      </main>
      <Footer />
    </>
  );
}
