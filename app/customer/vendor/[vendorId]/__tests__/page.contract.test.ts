import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(resolve(process.cwd(), "app/customer/vendor/[vendorId]/page.tsx"), "utf8");
const outletMenuSource = readFileSync(resolve(process.cwd(), "components/outlet/outlet-menu.tsx"), "utf8");

describe("customer vendor profile image contract", () => {
  it("uses the shared fallback for runtime media failures", () => {
    expect(pageSource).toContain("ResilientImage");
  });
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
    expect(pageSource).toContain("t('ui.vendor.viewProductDetails')");
    expect(pageSource).toContain("outletId");
    expect(pageSource).toContain("product.soldAt.length");
  });

  it("gates outlet add and buy before mutating the cart", () => {
    expect(outletMenuSource).toContain("CUSTOMER_CAPABILITY.CART_MUTATION");
    expect(outletMenuSource.indexOf("CUSTOMER_CAPABILITY.CART_MUTATION"))
      .toBeLessThan(outletMenuSource.indexOf("await addItem"));
  });

  it("keeps location copy singular when a vendor has one outlet", () => {
    expect(pageSource).toContain("locations.length > 1");
    expect(pageSource).toContain("t('ui.vendor.viewOutlet')");
  });

  it("uses a compact single-outlet summary and reserves location cards for multiple outlets", () => {
    expect(pageSource).toContain("function SingleLocationSummary");
    expect(pageSource).toContain("<SingleLocationSummary location={locations[0]}");
    expect(pageSource).toContain("hasMultipleLocations");
    expect(pageSource).toContain("locations.map((location) => <LocationCard");
  });
});
