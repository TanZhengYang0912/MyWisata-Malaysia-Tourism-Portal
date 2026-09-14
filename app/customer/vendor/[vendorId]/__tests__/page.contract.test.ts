import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(process.cwd(), "app/customer/vendor/[vendorId]/page.tsx"), "utf8");

describe("customer vendor profile image contract", () => {
  it("uses only the vendor cover for the vendor hero", () => {
    expect(pageSource).toContain("const vendorVisual = getVendorVisual({ name: vendor.name, coverUrl: vendor.cover_url, logoUrl: vendor.logo_url });");
    expect(pageSource).toContain("const heroImage = vendorVisual.coverUrl;");
    expect(pageSource).not.toContain("featuredProducts.find((product) => product.coverUrl)");
  });

  it("keeps outlet identity cards scoped to the outlet page image", () => {
    expect(pageSource).toContain("getVendorVisual");
    expect(pageSource).not.toContain("const outletImages = new Map");
    expect(pageSource).toContain("outlet_pages(hero_url)");
  });

  it("keeps outlet cards interactive with an image fallback", () => {
    expect(pageSource).toContain('return <article className="mw-card group min-w-0 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">');
    expect(pageSource).toContain("group-hover:scale-[1.02]");
    expect(pageSource).toContain("location.coverUrl ? <img");
  });

  it("keeps outlet identity text readable", () => {
    expect(pageSource).toContain("from-black/80 via-black/20 to-transparent");
    expect(pageSource).toContain("text-white/90");
  });
});

describe("customer vendor commerce boundary", () => {
  it("preserves a single product outlet in the vendor detail link", () => {
    expect(pageSource).toContain("function vendorProductDetailHref");
    expect(pageSource).toContain("source=vendor");
    expect(pageSource).toContain("outletId");
    expect(pageSource).toContain("ui.vendor.viewProductDetails");
    expect(pageSource).toContain("product.soldAt.length");
  });

  it("keeps location copy singular when a vendor has one outlet", () => {
    expect(pageSource).toContain("locations.length > 1");
    expect(pageSource).toContain("ui.vendor.chooseLocationTitle");
  });

  it("uses a compact single-outlet summary and reserves location cards for multiple outlets", () => {
    expect(pageSource).toContain("function SingleLocationSummary");
    expect(pageSource).toContain("<SingleLocationSummary location={locations[0]}");
    expect(pageSource).toContain("hasMultipleLocations ? (");
    expect(pageSource).toContain("locations.map((location) => <LocationCard");
  });

  it("keeps the vendor gallery distinct from the cover hero", () => {
    expect(pageSource).toContain("const visibleVendorGallery = vendorGallery.filter((item) => item.url !== heroImage);");
    expect(pageSource).toContain("visibleVendorGallery.length > 0");
  });
});

describe("customer vendor server module boundaries", () => {
  it("imports formatHours from server-safe operating-hours module rather than client components", () => {
    expect(pageSource).toContain("from '@/lib/customer/operating-hours'");
    expect(pageSource).not.toContain("from '@/components/outlet/outlet-block-renderer'");
  });
});

describe("customer vendor template consistency with outlet template", () => {
  it("uses the unified top context bar with share button", () => {
    expect(pageSource).toContain('<ShareButton shareType="vendor"');
    expect(pageSource).toContain("t('ui.vendor.partnerProfile')");
    expect(pageSource).toContain("border-b border-border pb-4");
  });

  it("uses the contained rounded hero card and unified summary card", () => {
    expect(pageSource).toContain("rounded-[1.75rem] border border-border bg-primary shadow-lg");
    expect(pageSource).toContain("relative z-10 -mt-8 mb-8 rounded-3xl border border-border bg-card p-5 shadow-lg sm:p-6");
    expect(pageSource).toContain("rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary/90");
    expect(pageSource).toContain("rounded-full border border-primary/20 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-secondary");
    expect(pageSource).toContain("max-w-7xl");
  });
});
