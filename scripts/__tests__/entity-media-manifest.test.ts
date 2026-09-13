import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "public/assets/customer/vendor-images");
const manifest = JSON.parse(readFileSync(resolve(root, "entity-media-manifest-v4.json"), "utf8")) as {
  vendors: Array<{ slug: string; logo: { objectPath: string; sourceFile?: string }; gallery: Array<{ objectPath: string; sourceFile: string; sourceKind: string }> }>;
  outlets: Array<{ outletName: string; logo: { objectPath: string; sourceFile?: string; sourceKind: string }; gallery: Array<{ objectPath: string; sourceFile: string; sourceKind: string }> }>;
};
const ingestSource = readFileSync(resolve(process.cwd(), "scripts/ingest-entity-media-manifest.mjs"), "utf8");

describe("entity media manifest", () => {
  it("has one logo and three unique gallery sources per mapped entity", () => {
    const entities = [...manifest.vendors, ...manifest.outlets];
    const galleryPaths = entities.flatMap((entity) => entity.gallery.map((item) => item.objectPath));
    expect(new Set(galleryPaths).size).toBe(galleryPaths.length);
    expect(manifest.vendors).toHaveLength(176);
    expect(manifest.outlets).toHaveLength(185);
    expect(manifest.outlets.every((entity) => entity.logo.objectPath.startsWith("entities/vendor/") || entity.logo.objectPath.startsWith("curated-v"))).toBe(true);
    for (const entity of entities) {
      expect(entity.gallery).toHaveLength(3);
      expect(entity.gallery.every((item) => ["wikimedia-commons", "verified-place-media", "similar-fallback"].includes(item.sourceKind))).toBe(true);
    }
  });

  it("keeps all source files present and byte-unique within each gallery", () => {
    for (const entity of [...manifest.vendors, ...manifest.outlets]) {
      const sourceFiles = [entity.logo.sourceFile, ...entity.gallery.map((item) => item.sourceFile)].filter(Boolean) as string[];
      const hashes = sourceFiles.map((file) => createHash("sha256").update(readFileSync(resolve(root, file))).digest("hex"));
      expect(new Set(hashes).size).toBe(hashes.length);
    }
  });

  it("uses a binary-safe upload body and an explicit write gate", () => {
    expect(ingestSource).toContain("ENTITY_MEDIA_INGEST=1");
    expect(ingestSource).toContain("new Blob([entry.body]");
    expect(ingestSource).toContain("preparedByPath.get(entry.objectPath)");
  });
});
