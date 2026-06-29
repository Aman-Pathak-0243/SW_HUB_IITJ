// Static unit tests for the Session-7 Media layer — the PURE Cloudinary helpers
// (delivery-URL building, public_id derivation, signing, delivery resolution) and
// the PURE migration-plan classification. No DB, no network — default-green.
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import path from "node:path";
import {
  cloudinaryUrl,
  uploadEndpoint,
  publicIdFromPath,
  publicAbsPath,
  signUploadParams,
  resolveDeliveryUrl,
  cloudNameFromUrl,
  cloudinaryAutoUrl,
  getCloudinaryConfig,
  canUpload,
  CLOUDINARY_DELIVERY_HOST,
} from "../lib/media/cloudinary.mjs";
import { classifyMigrationCandidate, selectMigrationCandidates } from "../lib/media/migrate.mjs";
import { shapeAsset } from "../lib/media/service.mjs";
import { BASE64_PLACEHOLDER_URL } from "../lib/org/normalize.mjs";

describe("cloudinaryUrl", () => {
  it("builds a delivery URL from a public_id", () => {
    expect(cloudinaryUrl("iitj-portal/coding-coordinator", { cloudName: "demo" })).toBe(
      "https://res.cloudinary.com/demo/image/upload/iitj-portal/coding-coordinator"
    );
  });
  it("injects a transformation segment when given", () => {
    expect(cloudinaryUrl("a/b", { cloudName: "demo", transformation: "f_auto,q_auto,w_400" })).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_400/a/b"
    );
  });
  it("supports a non-image resource type + explicit format", () => {
    expect(cloudinaryUrl("docs/spec", { cloudName: "demo", resourceType: "raw", format: "pdf" })).toBe(
      "https://res.cloudinary.com/demo/raw/upload/docs/spec.pdf"
    );
  });
  it("returns null without a publicId or cloudName", () => {
    expect(cloudinaryUrl(null, { cloudName: "demo" })).toBeNull();
    expect(cloudinaryUrl("x", {})).toBeNull();
  });
  it("uploadEndpoint targets the account + resource type", () => {
    expect(uploadEndpoint("demo")).toBe("https://api.cloudinary.com/v1_1/demo/image/upload");
    expect(uploadEndpoint("demo", "raw")).toBe("https://api.cloudinary.com/v1_1/demo/raw/upload");
  });
  it("the delivery host matches the next.config allowlist", () => {
    expect(CLOUDINARY_DELIVERY_HOST).toBe("res.cloudinary.com");
  });
});

describe("publicIdFromPath", () => {
  it("derives a stable, folder-prefixed, extension-less slug from a /public path", () => {
    expect(publicIdFromPath("/coding coordinator.jpg", { folder: "iitj-portal" })).toBe("iitj-portal/coding-coordinator");
  });
  it("is deterministic (idempotent) for the same input", () => {
    const a = publicIdFromPath("/PIC anime.png");
    const b = publicIdFromPath("/PIC anime.png");
    expect(a).toBe(b);
    expect(a).toBe("iitj-portal/pic-anime");
  });
  it("strips diacritics and collapses punctuation", () => {
    expect(publicIdFromPath("/Café Photo (1).JPG", { folder: "f" })).toBe("f/cafe-photo-1");
  });
  it("preserves nested folders in the path", () => {
    expect(publicIdFromPath("/hostel-infra/Building.png", { folder: "iitj" })).toBe("iitj/hostel-infra/building");
  });
  it("can omit the folder prefix", () => {
    expect(publicIdFromPath("/logo.svg", { folder: "" })).toBe("logo");
  });
  it("returns null for an empty path", () => {
    expect(publicIdFromPath("")).toBeNull();
    expect(publicIdFromPath(null)).toBeNull();
  });
});

describe("publicAbsPath", () => {
  it("maps a /public path to the on-disk public/ file", () => {
    expect(publicAbsPath("/coding coordinator.jpg", { cwd: "/app" })).toBe(path.join("/app", "public", "coding coordinator.jpg"));
  });
  it("returns null for an empty path", () => {
    expect(publicAbsPath("", { cwd: "/app" })).toBeNull();
  });
});

describe("signUploadParams", () => {
  it("signs the sorted params (excluding file/api_key/resource_type) + secret with SHA-1", () => {
    const params = { timestamp: 1700000000, public_id: "folder/name", overwrite: "true", api_key: "KEY", file: "x", resource_type: "image" };
    const expected = createHash("sha1").update("overwrite=true&public_id=folder/name&timestamp=1700000000mysecret").digest("hex");
    expect(signUploadParams(params, "mysecret")).toBe(expected);
  });
  it("is order-independent and skips empty values", () => {
    const a = signUploadParams({ b: "2", a: "1", c: "" }, "s");
    const expected = createHash("sha1").update("a=1&b=2s").digest("hex");
    expect(a).toBe(expected);
  });
});

describe("resolveDeliveryUrl", () => {
  it("returns the stored url for a migrated (cloudinary) asset", () => {
    const asset = { cloudinaryPublicId: "iitj/x", url: "https://res.cloudinary.com/demo/image/upload/iitj/x", storageProvider: "cloudinary" };
    expect(resolveDeliveryUrl(asset)).toBe("https://res.cloudinary.com/demo/image/upload/iitj/x");
  });
  it("rebuilds a transformed url from the public_id for a migrated asset", () => {
    const asset = { cloudinaryPublicId: "iitj/x", url: "https://res.cloudinary.com/demo/image/upload/iitj/x", kind: "image" };
    expect(resolveDeliveryUrl(asset, { transformation: "w_200" })).toBe("https://res.cloudinary.com/demo/image/upload/w_200/iitj/x");
  });
  it("rebuilds a transformed PDF url WITH the .pdf format (so Cloudinary returns the file, not a raster)", () => {
    const asset = { cloudinaryPublicId: "iitj/infra", url: "https://res.cloudinary.com/demo/image/upload/iitj/infra.pdf", kind: "pdf" };
    expect(resolveDeliveryUrl(asset, { transformation: "fl_attachment" })).toBe(
      "https://res.cloudinary.com/demo/image/upload/fl_attachment/iitj/infra.pdf"
    );
  });
  it("returns the raw url for a local /public asset (not yet migrated)", () => {
    expect(resolveDeliveryUrl({ storageProvider: "local", url: "/logo.png", cloudinaryPublicId: null })).toBe("/logo.png");
  });
  it("returns the raw url for an external asset", () => {
    expect(resolveDeliveryUrl({ storageProvider: "external", url: "https://res.cloudinary.com/dveqd1vm1/image/upload/v1/x.jpg" })).toBe(
      "https://res.cloudinary.com/dveqd1vm1/image/upload/v1/x.jpg"
    );
  });
  it("returns null for a null asset", () => {
    expect(resolveDeliveryUrl(null)).toBeNull();
  });
  it("cloudNameFromUrl extracts the account from a cloudinary url", () => {
    expect(cloudNameFromUrl("https://res.cloudinary.com/dabviijid/image/upload/v1/x.pdf")).toBe("dabviijid");
    expect(cloudNameFromUrl("/local.png")).toBeNull();
  });
});

describe("cloudinaryAutoUrl (Session-10 CWV: f_auto,q_auto injection)", () => {
  it("injects f_auto,q_auto right after /upload/ for a plain cloudinary delivery url", () => {
    expect(cloudinaryAutoUrl("https://res.cloudinary.com/demo/image/upload/v1774/x.jpg")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1774/x.jpg"
    );
  });
  it("is idempotent — does not double-apply when f_auto is already present", () => {
    const already = "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v1774/x.jpg";
    expect(cloudinaryAutoUrl(already)).toBe(already);
  });
  it("leaves an existing (different) transformation untouched", () => {
    const withW = "https://res.cloudinary.com/demo/image/upload/w_400/v1/x.jpg";
    expect(cloudinaryAutoUrl(withW)).toBe(withW);
  });
  it("passes a non-cloudinary url through unchanged (/public path, Drive link)", () => {
    expect(cloudinaryAutoUrl("/hero1.jpg")).toBe("/hero1.jpg");
    expect(cloudinaryAutoUrl("https://drive.google.com/file/d/abc/view")).toBe("https://drive.google.com/file/d/abc/view");
  });
  it("handles null/empty without throwing", () => {
    expect(cloudinaryAutoUrl(null)).toBeNull();
    expect(cloudinaryAutoUrl("")).toBe("");
  });
  it("accepts a custom transformation", () => {
    expect(cloudinaryAutoUrl("https://res.cloudinary.com/demo/image/upload/v1/x.jpg", "f_auto,q_auto,w_800")).toBe(
      "https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,w_800/v1/x.jpg"
    );
  });
});

describe("getCloudinaryConfig / canUpload", () => {
  it("reads the env account + folder default", () => {
    const cfg = getCloudinaryConfig({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "s" });
    expect(cfg).toMatchObject({ cloudName: "demo", apiKey: "k", apiSecret: "s", folder: "iitj-portal" });
    expect(canUpload(cfg)).toBe(true);
  });
  it("honors a custom folder", () => {
    expect(getCloudinaryConfig({ CLOUDINARY_CLOUD_NAME: "demo", CLOUDINARY_UPLOAD_FOLDER: "x" }).folder).toBe("x");
  });
  it("returns null when no cloud name is set", () => {
    expect(getCloudinaryConfig({})).toBeNull();
  });
  it("cannot upload without key+secret (URL-only config)", () => {
    expect(canUpload(getCloudinaryConfig({ CLOUDINARY_CLOUD_NAME: "demo" }))).toBe(false);
    expect(canUpload(null)).toBe(false);
  });
});

describe("shapeAsset", () => {
  it("adds a resolved deliveryUrl and coerces bytes (BigInt) to Number", () => {
    const out = shapeAsset({
      id: "m1",
      storageProvider: "cloudinary",
      cloudinaryPublicId: "iitj/x",
      url: "https://res.cloudinary.com/demo/image/upload/iitj/x",
      originalPath: "/x.png",
      kind: "image",
      mimeType: "image/png",
      altText: "x",
      width: 10,
      height: 20,
      bytes: 12345n,
      migratedAt: null,
      archivedAt: null,
      createdAt: null,
    });
    expect(out.deliveryUrl).toBe("https://res.cloudinary.com/demo/image/upload/iitj/x");
    expect(out.bytes).toBe(12345);
    expect(typeof out.bytes).toBe("number");
    expect(out.cloudinaryPublicId).toBe("iitj/x");
  });
  it("resolves a local /public asset's deliveryUrl to its raw url and handles null bytes", () => {
    const out = shapeAsset({ id: "m2", storageProvider: "local", url: "/logo.png", originalPath: "/logo.png", kind: "image", bytes: null });
    expect(out.deliveryUrl).toBe("/logo.png");
    expect(out.bytes).toBeNull();
    expect(out.cloudinaryPublicId).toBeNull();
  });
  it("returns null for a null asset", () => {
    expect(shapeAsset(null)).toBeNull();
  });
});

describe("classifyMigrationCandidate", () => {
  it("flags a /public local asset as migratable", () => {
    expect(classifyMigrationCandidate({ storageProvider: "local", originalPath: "/x.png", cloudinaryPublicId: null })).toBe("public");
  });
  it("flags a base64 placeholder distinctly (DL-039)", () => {
    expect(classifyMigrationCandidate({ storageProvider: "local", url: BASE64_PLACEHOLDER_URL, originalPath: null })).toBe("base64");
  });
  it("treats an already-migrated asset as a no-op (idempotency)", () => {
    expect(classifyMigrationCandidate({ storageProvider: "cloudinary", cloudinaryPublicId: "iitj/x", originalPath: "/x.png" })).toBe("migrated");
  });
  it("leaves a genuinely external asset alone", () => {
    expect(classifyMigrationCandidate({ storageProvider: "external", url: "https://res.cloudinary.com/d/x.jpg" })).toBe("external");
  });
  it("skips archived assets", () => {
    expect(classifyMigrationCandidate({ storageProvider: "local", originalPath: "/x.png", archivedAt: new Date() })).toBe("skip");
  });
  it("skips a null/garbage asset", () => {
    expect(classifyMigrationCandidate(null)).toBe("skip");
    expect(classifyMigrationCandidate({ storageProvider: "local", originalPath: null, url: "x" })).toBe("skip");
  });
});

describe("selectMigrationCandidates", () => {
  it("buckets a mixed inventory correctly", () => {
    const assets = [
      { id: "1", storageProvider: "local", originalPath: "/a.png", cloudinaryPublicId: null },
      { id: "2", storageProvider: "local", url: BASE64_PLACEHOLDER_URL, originalPath: null },
      { id: "3", storageProvider: "cloudinary", cloudinaryPublicId: "iitj/c", originalPath: "/c.png" },
      { id: "4", storageProvider: "external", url: "https://res.cloudinary.com/d/x.jpg" },
      { id: "5", storageProvider: "local", originalPath: "/e.png", archivedAt: new Date() },
    ];
    const b = selectMigrationCandidates(assets);
    expect(b.public.map((a) => a.id)).toEqual(["1"]);
    expect(b.base64.map((a) => a.id)).toEqual(["2"]);
    expect(b.migrated.map((a) => a.id)).toEqual(["3"]);
    expect(b.external.map((a) => a.id)).toEqual(["4"]);
    expect(b.skipped.map((a) => a.id)).toEqual(["5"]);
  });
  it("handles an empty / nullish list", () => {
    expect(selectMigrationCandidates([]).public).toEqual([]);
    expect(selectMigrationCandidates(undefined).base64).toEqual([]);
  });
});
