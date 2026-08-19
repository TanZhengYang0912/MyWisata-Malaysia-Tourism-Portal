import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/customer/search/search-client.tsx"), "utf8");

describe.skip("featured vendor filtering contract", () => {
  it("keeps only recommended vendors that are present in the active result set", () => {
    expect(source).toContain("const featuredVendors = useMemo(() =>");
    expect(source).toContain("recommendedVendors.filter((vendor) => filteredVendorIds.has(vendor.id))");
    expect(source).toContain("const fallbackVendors = filteredVendors.filter");
    expect(source).toContain("...fallbackVendors");
    expect(source).toContain("featuredVendors.length > 0");
    expect(source).toContain("featuredVendors.map");
    expect(source).not.toContain("!query && !category && !state && recommendedVendors.length > 0");
  });
});
