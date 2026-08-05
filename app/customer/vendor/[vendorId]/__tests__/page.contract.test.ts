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

  it("does not borrow product photography for outlet identity cards", () => {
    expect(pageSource).toContain("getVendorVisual");
    expect(pageSource).not.toContain("const outletImages = new Map");
    expect(pageSource).not.toContain("coverUrl: outletImages.get(outlet.id)");
  });

  it("keeps outlet cards interactive without using photography", () => {
    expect(pageSource).toContain('return <article className="mw-card group min-w-0 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">');
    expect(pageSource).toContain("group-hover:scale-[1.02]");
  });

  it("keeps outlet identity text readable", () => {
    expect(pageSource).toContain("from-[#010066] via-[#172b72] to-[#2d5273]");
    expect(pageSource).toContain("text-white/90");
  });
});

describe("customer vendor commerce boundary", () => {
  it("keeps vendor product cards in discovery mode", () => {
    expect(pageSource).toContain("function vendorProductDetailHref");
    expect(pageSource).toContain("source=vendor");
    expect(pageSource).toContain("View product details");
    expect(pageSource).toContain("product.soldAt.length");
  });
});
