import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rendererSource = readFileSync(
  resolve(process.cwd(), "components/outlet/outlet-page-renderer.tsx"),
  "utf8",
);

describe("public outlet page template", () => {
  it("uses a public-only stable flow while keeping the editor grid", () => {
    expect(rendererSource).toContain("function PublicOutletTemplate");
    expect(rendererSource).toContain("outlet-public-content");
    expect(rendererSource).toContain("mode === 'public'");
    expect(rendererSource).toContain("className=\"outlet-grid\"");
    expect(rendererSource).toContain("readingOrder(document.blocks)");
  });

  it("does not let product blocks create duplicate public content", () => {
    expect(rendererSource).toContain("block.type !== 'product_grid'");
    expect(rendererSource).toContain("<OutletMenu outlet={outlet} products={products} />");
  });

  it("puts the useful outlet summary before the optional gallery", () => {
    const heroIndex = rendererSource.indexOf("<OutletHeroRenderer hero={hero}");
    const summaryIndex = rendererSource.indexOf("<VisitSummary outlet={outlet} mode=\"public\" />");
    const galleryIndex = rendererSource.indexOf("<MediaGallery items={document.gallery}");

    expect(heroIndex).toBeGreaterThanOrEqual(0);
    expect(summaryIndex).toBeGreaterThan(heroIndex);
    expect(galleryIndex).toBeGreaterThan(summaryIndex);
  });
});
