// Static unit tests for the Session-7 Resources module — the PURE V1 dataset →
// import-plan transform and the public-shape helper. No DB — default-green. The
// live publish→visible behavior is covered by tests/resources.db.test.mjs.
import { describe, it, expect } from "vitest";
import { RESOURCES, RESOURCE_UNIT_SLUGS, planResource, buildResourceImportPlan } from "../lib/resources/data.mjs";
import { shapeResource } from "../lib/resources/public.mjs";
import { buildImportPlan } from "../lib/org/data/index.mjs";

const RESOURCE_KINDS = new Set(["pdf", "link", "drive", "file"]);

// Every org-unit slug the org importer can create (councils + clubs + hostels +
// messes), so we can prove the resource bindings reference REAL units.
function allOrgSlugs() {
  const plan = buildImportPlan();
  const slugs = new Set();
  for (const c of plan.councils) {
    slugs.add(c.slug);
    for (const club of c.clubs) slugs.add(club.slug);
  }
  for (const h of plan.hostels) slugs.add(h.slug);
  for (const m of plan.messes) slugs.add(m.slug);
  return slugs;
}

describe("buildResourceImportPlan", () => {
  const plan = buildResourceImportPlan();

  it("normalizes every V1 resource (one node per RESOURCES row)", () => {
    expect(plan.length).toBe(RESOURCES.length);
    expect(plan.length).toBe(6);
  });

  it("gives every node a title, a valid resource_kind, and a target unit", () => {
    for (const r of plan) {
      expect(r.title).toBeTruthy();
      expect(RESOURCE_KINDS.has(r.resourceKind)).toBe(true);
      expect(r.unitSlug).toBeTruthy();
    }
  });

  it("derives per-year-UNIQUE slugs namespaced by unit (shared titles don't collide)", () => {
    const slugs = plan.map((r) => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    // the three councils share the "Student Club Activities" title but not the slug
    const sca = plan.filter((r) => r.title === "Student Club Activities");
    expect(sca.length).toBe(3);
    expect(new Set(sca.map((r) => r.slug)).size).toBe(3);
    expect(sca.map((r) => r.slug)).toContain("general-affairs-council-student-club-activities");
  });

  it("binds every resource to a unit the org importer actually creates", () => {
    const orgSlugs = allOrgSlugs();
    for (const slug of RESOURCE_UNIT_SLUGS) {
      expect(orgSlugs.has(slug)).toBe(true);
    }
  });

  it("models PDF resources with both a file and a Drive detail link", () => {
    const pdfs = plan.filter((r) => r.resourceKind === "pdf");
    expect(pdfs.length).toBe(6);
    for (const r of pdfs) {
      expect(r.file).toMatch(/^https:\/\/res\.cloudinary\.com\//);
      expect(r.file).toMatch(/\.pdf$/);
      expect(r.externalUrl).toMatch(/^https:\/\/drive\.google\.com\//);
    }
  });
});

describe("planResource", () => {
  it("defaults resource_kind to 'pdf' when a file is present, else 'link'", () => {
    expect(planResource({ unitSlug: "u", title: "T", file: "https://x/y.pdf" }).resourceKind).toBe("pdf");
    expect(planResource({ unitSlug: "u", title: "T", externalUrl: "https://x" }).resourceKind).toBe("link");
  });
  it("honors an explicit resource_kind", () => {
    expect(planResource({ unitSlug: "u", title: "T", resourceKind: "drive", externalUrl: "https://x" }).resourceKind).toBe("drive");
  });
  it("namespaces the slug by unit + title", () => {
    expect(planResource({ unitSlug: "sports-council", title: "Sports Infrastructure & Details" }).slug).toBe(
      "sports-council-sports-infrastructure-and-details"
    );
  });
});

describe("shapeResource (public)", () => {
  it("shapes a PDF resource with a resolved file URL", () => {
    const out = shapeResource({
      item: { id: "i1", slug: "s1" },
      payload: { resourceKind: "pdf", fileMediaId: "m1", externalUrl: "https://drive/x", description: "d" },
      rev: { title: "Infra PDF", summary: null },
      file: { url: "https://res.cloudinary.com/d/i/upload/x.pdf", kind: "pdf" },
    });
    expect(out).toMatchObject({
      id: "i1",
      slug: "s1",
      title: "Infra PDF",
      resourceKind: "pdf",
      externalUrl: "https://drive/x",
      fileUrl: "https://res.cloudinary.com/d/i/upload/x.pdf",
      fileKind: "pdf",
    });
  });
  it("shapes a link/drive resource (no file) with a null fileUrl", () => {
    const out = shapeResource({
      item: { id: "i2", slug: "s2" },
      payload: { resourceKind: "drive", externalUrl: "https://drive/y" },
      rev: { title: "Drive Link" },
      file: null,
    });
    expect(out.fileUrl).toBeNull();
    expect(out.resourceKind).toBe("drive");
    expect(out.externalUrl).toBe("https://drive/y");
  });
});
