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
    expect(rendererSource).toContain("<HotelPage outlet={outlet} rooms={products.filter((p) => p.stay)} gallery={gallery} reviews={reviews} reviewRatingBuckets={reviewRatingBuckets} reviewTotal={reviewTotal} />");
  });

  it("puts the useful outlet summary before the optional gallery", () => {
    const heroIndex = rendererSource.indexOf("<OutletHeroRenderer hero={hero}");
    const summaryIndex = rendererSource.indexOf("<VisitSummary outlet={outlet} mode=\"public\" />");
    const galleryIndex = rendererSource.indexOf("<MediaGallery items={document.gallery}");

    expect(heroIndex).toBeGreaterThanOrEqual(0);
    expect(summaryIndex).toBeGreaterThan(heroIndex);
    expect(galleryIndex).toBeGreaterThan(summaryIndex);
  });

  it("keeps the public hero, visit summary, and actions sized for phone and tablet layouts", () => {
    const blocks = readFileSync(resolve(process.cwd(), "components/outlet/outlet-block-renderer.tsx"), "utf8");

    expect(blocks).toContain("min-h-[240px] sm:min-h-[320px] lg:min-h-[360px]");
    expect(blocks).toContain("text-3xl font-black leading-tight");
    expect(rendererSource).toContain("grid gap-4 text-sm text-muted-foreground sm:grid-cols-2");
    expect(rendererSource).toContain("w-full items-center justify-center gap-2 rounded-full");
    expect(rendererSource).toContain("sm:-mt-8 sm:mb-8");
  });
});
