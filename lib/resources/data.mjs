// V1 hardcoded RESOURCES dataset (DATA_MIGRATION_REPORT §7 "Resources") — the
// per-org-unit infrastructure PDFs + Google-Drive "View in Detail" links lifted
// verbatim from the V1 pages (app/Clubs/*, app/hostels, app/messes — the
// <PdfSlideshow pdfUrl=… driveUrl=…> blocks). Plain DATA, no DB, no logic; the
// pure buildResourceImportPlan() normalizes each into the importer-ready shape
// (a stable per-year-unique slug, resource_kind, file/external_url).
//
// Each V1 PdfSlideshow = ONE `resource` content_item (content_type='resource',
// org-bound) of resource_kind='pdf', whose file_media_id is the Cloudinary PDF and
// whose external_url is the Drive "View in Detail" link — so the public renderer
// reproduces the V1 PDF slideshow + detail button from data.
//
// The three student-life councils (General/Academic/Cultural) shared ONE
// "Student Club Activities" PDF in V1, so each council gets its own resource row
// (faithful: the PDF appeared on all three pages). The campus-wide Hostel/Mess
// infrastructure PDFs are bound to the FIRST hostel / first mess unit (by import
// order), mirroring the mess-committee-on-first-mess convention (DL-035) — there
// is no "all hostels" unit, and per-unit attribution can be refined later.
import { slugify } from "../org/normalize.mjs";

// Cloudinary-hosted V1 infrastructure PDFs (account dabviijid — DATA_MIGRATION §3).
const STUDENT_CLUB_ACTIVITIES_PDF = "https://res.cloudinary.com/dabviijid/image/upload/v1782030054/Student_Club_Activities_m39twc.pdf";
const SPORTS_INFRA_PDF = "https://res.cloudinary.com/dabviijid/image/upload/v1782030226/Sports_Infrastructure_Details_al7nk0.pdf";
const HOSTEL_INFRA_PDF = "https://res.cloudinary.com/dabviijid/image/upload/v1782030054/Hostel_Infrastructure_Details_b5kbmv.pdf";
const MESS_INFRA_PDF = "https://res.cloudinary.com/dabviijid/image/upload/v1782030054/Mess_Infrastructure_Details_kjxkux.pdf";

// V1 Google-Drive "View in Detail" links.
const STUDENT_CLUB_ACTIVITIES_DRIVE = "https://drive.google.com/file/d/1H9ttrd9DSwLX9kXsQ-mUQByy6UJV_iyu/view?usp=drive_link";
const SPORTS_INFRA_DRIVE = "https://drive.google.com/file/d/1WMJgm0D_VJr0a2OrjgiS-FtGkQ9_ZV5v/view?usp=drive_link";
const HOSTEL_INFRA_DRIVE = "https://drive.google.com/file/d/1WwLhj1XQQO-zILP6D38ZCeysFEbrhdcG/view?usp=drive_link";
const MESS_INFRA_DRIVE = "https://drive.google.com/file/d/1OExSfM-XZd5o9Q31SEb4M75w8aexxzuU/view?usp=drive_link";

// One row per V1 resource. `unitSlug` matches the slug the org importer assigns
// (lib/org/data/*); the campus-wide hostel/mess PDFs bind to the first unit of
// their kind (anz-hostel / annapurna-mess-2nd-floor).
export const RESOURCES = [
  { unitSlug: "general-affairs-council", title: "Student Club Activities", resourceKind: "pdf", file: STUDENT_CLUB_ACTIVITIES_PDF, externalUrl: STUDENT_CLUB_ACTIVITIES_DRIVE, description: "Student club activities across the General Affairs Council." },
  { unitSlug: "academic-council", title: "Student Club Activities", resourceKind: "pdf", file: STUDENT_CLUB_ACTIVITIES_PDF, externalUrl: STUDENT_CLUB_ACTIVITIES_DRIVE, description: "Student club activities across the Academic Council." },
  { unitSlug: "cultural-council", title: "Student Club Activities", resourceKind: "pdf", file: STUDENT_CLUB_ACTIVITIES_PDF, externalUrl: STUDENT_CLUB_ACTIVITIES_DRIVE, description: "Student club activities across the Cultural Council." },
  { unitSlug: "sports-council", title: "Sports Infrastructure & Details", resourceKind: "pdf", file: SPORTS_INFRA_PDF, externalUrl: SPORTS_INFRA_DRIVE, description: "Sports infrastructure and facilities at IIT Jammu." },
  { unitSlug: "anz-hostel", title: "Hostel Infrastructure & Details", resourceKind: "pdf", file: HOSTEL_INFRA_PDF, externalUrl: HOSTEL_INFRA_DRIVE, description: "Hostel infrastructure and amenities (campus-wide)." },
  { unitSlug: "annapurna-mess-2nd-floor", title: "Mess Infrastructure & Details", resourceKind: "pdf", file: MESS_INFRA_PDF, externalUrl: MESS_INFRA_DRIVE, description: "Mess infrastructure and facilities (campus-wide)." },
];

// The set of org-unit slugs the resources bind to (exported so a static test can
// assert every target unit exists in the org dataset — a guard against typos).
export const RESOURCE_UNIT_SLUGS = [...new Set(RESOURCES.map((r) => r.unitSlug))];

// Normalize one resource node → an importer plan node. The slug is namespaced by
// unit so it is unique per (content_type, year) even when two units share a title
// ("Student Club Activities" on three councils). resource_kind defaults to 'pdf'
// when a file is present, else 'link'.
export function planResource(node) {
  return {
    unitSlug: node.unitSlug,
    slug: slugify(`${node.unitSlug}-${node.title}`),
    title: node.title,
    resourceKind: node.resourceKind ?? (node.file ? "pdf" : "link"),
    file: node.file ?? null,
    externalUrl: node.externalUrl ?? null,
    description: node.description ?? null,
  };
}

// The full, pure import plan for the V1 resources (defaults to RESOURCES). Pass a
// custom list (same node shape) for a bounded test fixture.
export function buildResourceImportPlan(resources = RESOURCES) {
  return resources.map(planResource);
}
