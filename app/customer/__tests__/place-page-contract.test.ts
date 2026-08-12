import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "app/customer/place/[slug]/page.tsx"),
  "utf8",
);

describe("place page layout and copy", () => {
  it("matches the sticky nav's container width", () => {
    expect(pageSource).toContain("mx-auto max-w-7xl px-4 py-8 sm:px-6");
    expect(pageSource).not.toContain("max-w-6xl");
  });

  it("leads the vendor-product block with 'Activities here'", () => {
    expect(pageSource).toContain("Activities here");
    expect(pageSource).not.toContain('"option" : "options"');
  });

  it("singularises the activity and vendor counts", () => {
    expect(pageSource).toContain('products.length === 1 ? "activity" : "activities"');
    expect(pageSource).toContain('vendorCount === 1 ? "vendor" : "vendors"');
  });
});

describe("place page nearby-business filtering", () => {
  it("drops the operating vendor's own outlets from the nearby list", () => {
    expect(pageSource).toContain("place.managedByVendorId");
    expect(pageSource).toContain("entry.outlet.vendorId !== place.managedByVendorId");
    expect(pageSource).toContain("outlets={nearbyBusinesses}");
  });
});
