import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manifestPath = resolve(process.cwd(), "public/assets/customer/vendor-images/source-manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) as {
  vendors: Array<{ slug: string; sourceKind: string; sourceUrl: string; objectPath: string }>;
} : null;
const ingestSource = readFileSync(resolve(process.cwd(), "scripts/ingest-vendor-cover-sources.mjs"), "utf8");

describe.skipIf(!manifest)("vendor cover source manifest", () => {
  it("keeps a traceable, unique, non-artwork source for every mapped vendor", () => {
    expect(manifest!.vendors).toHaveLength(4);
    expect(new Set(manifest!.vendors.map((entry) => entry.slug)).size).toBe(manifest!.vendors.length);
    expect(new Set(manifest!.vendors.map((entry) => entry.objectPath)).size).toBe(manifest!.vendors.length);
    for (const entry of manifest!.vendors) {
      expect(["official", "travel-guide", "generated-fallback"]).toContain(entry.sourceKind);
      expect(entry.sourceUrl).toMatch(/^https?:\/\//);
      expect(entry.objectPath).toMatch(/^curated-v2\/vendor\/[^/]+\/cover\.jpg$/);
      expect(entry.objectPath).not.toContain("entities/");
    }
  });

  it("requires an explicit write gate and preserves the manifest's unique Storage paths", () => {
    expect(ingestSource).toContain("VENDOR_COVER_SOURCE_INGEST=1");
    expect(ingestSource).toContain("Duplicate source object paths detected");
    expect(ingestSource).toContain("update({ cover_url: entry.objectPath })");
    expect(ingestSource).toContain("source-manifest.json");
  });
});
