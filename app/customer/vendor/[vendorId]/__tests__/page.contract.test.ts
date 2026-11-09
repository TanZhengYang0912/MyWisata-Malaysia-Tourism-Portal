import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { vendorProductDetailHref } from "@/lib/customer/vendor-page";

const pageSource = readFileSync(resolve(process.cwd(), "app/customer/vendor/[vendorId]/page.tsx"), "utf8");
const listingSource = readFileSync(resolve(process.cwd(), "components/customer/vendor-listing-grid.tsx"), "utf8");
const locationSource = readFileSync(resolve(process.cwd(), "components/customer/vendor-location-list.tsx"), "utf8");

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

  it("shows each location as an OutletCard: vendor, outlet, location and open state, no hours or directions", () => {
    const rowSource = locationSource.slice(locationSource.indexOf("export function VendorLocationList"));
    expect(rowSource).toContain("<OutletCard");
    expect(rowSource).toContain("isOperatingHoursOpenNow(location.operatingHours, now)");
    expect(rowSource).not.toContain("formatPeriods");
    expect(rowSource).not.toContain("ui.vendor.directions");
    expect(pageSource).toContain('getScopeRatingSummaries("outlet"');
    expect(pageSource).not.toContain("ui.vendor.chooseLocationDescription");
    expect(pageSource).not.toContain("ui.vendor.activeOutletCount");
  });
});
describe("customer vendor commerce boundary", () => {
  it("keeps listing cards focused on product names, prices, and key facts", () => {
    expect(pageSource).not.toContain("id,name,description,product_type");
    expect(pageSource).toContain("imageUrl: product.coverUrl, description: null");
    expect(listingSource).toContain("<ProductCard key={product.id}");
  });

  it("preserves a single product outlet in the vendor detail link", () => {
    expect(vendorProductDetailHref("p1", "v1", "o1")).toContain("outletId=o1");
    expect(vendorProductDetailHref("p1", "v1")).not.toContain("outletId=");
    expect(pageSource).toContain("<VendorListingGrid");
    expect(listingSource).toContain("listing={{ ...toVendorCatalogueCard(product), vendorName }}");
  });

  it("keeps location copy singular when a vendor has one outlet", () => {
    expect(pageSource).toContain("locations.length > 1");
    expect(pageSource).toContain("ui.vendor.chooseLocationTitle");
  });

  it("shows every outlet through the shared location list with a link to the outlet", () => {
    expect(pageSource).toContain("<VendorLocationList locations={locationRows} />");
    expect(pageSource).not.toContain("function LocationCard");
    expect(pageSource).not.toContain("function SingleLocationSummary");
    expect(pageSource).toContain("href: `/customer/outlets/${location.id}`");
  });

  it("keeps the vendor gallery distinct from the cover hero", () => {
    expect(pageSource).toContain("const visibleVendorGallery = vendorGallery.filter((item) => item.url !== heroImage);");
    expect(pageSource).toContain("visibleVendorGallery.length > 0");
  });
});

describe("customer vendor server module boundaries", () => {
  it("does not import the outlet block renderer client module", () => {
    expect(pageSource).not.toContain("from '@/components/outlet/outlet-block-renderer'");
  });

  it("passes serializable title props to the localized heading client component", () => {
    expect(pageSource).not.toContain("{({ text, control }) =>");
  });
});

describe("customer vendor page layout", () => {
  it("puts the name in the header as the only h1, with Share as the only action", () => {
    expect(pageSource).toContain('<ShareButton shareType="vendor"');
    expect(pageSource).toContain("t('ui.vendor.partnerProfile')");
    expect(pageSource.match(/<h1/g)).toHaveLength(1);
    expect(pageSource.indexOf("<h1")).toBeLessThan(pageSource.indexOf("{/* Hero: the cover image only. */}"));
    expect(pageSource).not.toContain("ProductSaveButton");
    expect(pageSource).not.toContain("ChatButton");
  });

  it("renders the facts strip, hours widget, section nav, listing grid and location list", () => {
    expect(pageSource).toContain("<VendorOperatingHours hours={hoursSource} />");
    expect(pageSource).toContain("<VendorSectionNav items={sectionNavItems} />");
    expect(pageSource).toContain("<VendorListingGrid");
    expect(pageSource).toContain("<VendorLocationList");
    expect(pageSource).toContain('href="#gallery"');
    expect(pageSource).toContain('id="gallery"');
    expect(pageSource).toContain("max-w-7xl");
  });
});

describe("customer vendor mobile layout", () => {
  it("uses a shorter mobile hero and a denser mobile content rhythm", () => {
    expect(pageSource).toContain("h-[200px]");
    expect(pageSource).toContain("sm:h-[300px]");
    expect(pageSource).toContain("space-y-12 sm:space-y-16");
    expect(pageSource).toContain("mb-4 mt-2 max-w-2xl text-sm leading-5 text-muted-foreground sm:mb-6 sm:leading-6");
  });

  it("removes redundant experience and location introductions", () => {
    expect(pageSource).not.toContain("ui.vendor.experienceDescription");
    expect(pageSource).not.toContain("ui.vendor.chooseLocationDescription");
  });
});
