import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "scripts/curate-vendor-outlet-media.mjs"), "utf8");

describe("vendor and outlet media curator", () => {
  it("queries Commons and records attribution for each downloaded image", () => {
    expect(source).toContain("commons.wikimedia.org/w/api.php");
    expect(source).toContain("sourcePage");
    expect(source).toContain("sourceImageUrl");
    expect(source).toContain("artist");
    expect(source).toContain("license");
  });

  it("enforces globally unique source pages and content hashes", () => {
    expect(source).toContain("usedPageIds.has(candidate.pageId)");
    expect(source).toContain("usedHashes.has(result.hash)");
    expect(source).toContain("GALLERY_COUNT = 3");
  });

  it("keeps the curator read-only with remote writes isolated in the ingest step", () => {
    expect(source).not.toContain("supabase.storage");
    expect(source).not.toContain('.from("media_assets")');
  });
});
