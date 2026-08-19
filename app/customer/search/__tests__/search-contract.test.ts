import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const pageSource = read("app/customer/partners/page.tsx");
const clientSource = read("app/customer/search/search-client.tsx");
const catalogueSource = read("backend/domains/catalogue.ts");
const filterSource = read("components/customer/discovery-filters.tsx");

describe("customer vendor search contract", () => {
  it("provides the approved vendor directory with promotion data", () => {
    expect(pageSource).toContain("getVendors(db)");
    expect(pageSource).toContain("getRecommendedFeed");
    expect(pageSource).toContain("rankVendorsByPersonalizedFeed");
    expect(pageSource).toContain("initialResults={results}");
    expect(pageSource).toContain("initialVendors=");
    expect(pageSource).toContain("recommendedVendors=");
    expect(clientSource).toContain('tCustomer("ui.search.recommendFeatured")');
    expect(filterSource).toContain("CATEGORIES.map");
  });

  it("renders vendors as the primary search result", () => {
    expect(clientSource).toContain("filteredVendors");
    expect(clientSource).toContain('tCustomer("ui.search.recommendFeatured")');
    expect(clientSource).toContain("recommendedVendors");
    expect(clientSource).toContain('tCustomer("ui.search.verifiedPartners")');
    expect(clientSource).not.toContain("<ActivityCard");
    expect(clientSource).not.toContain("Search Experiences");
  });

  it("also gives place-bound activities their own discovery path", () => {
    expect(clientSource).toContain("PlaceActivityCard");
    expect(clientSource).toContain("getActivityDiscoveryMode");
    expect(clientSource).toContain("PLACE_ACTIVITIES_PER_PAGE");
    expect(clientSource).toContain("const PLACE_ACTIVITIES_PER_PAGE = 8");
    expect(clientSource).toContain("getActivityCommerceMode");
  });

  it("keeps category and state filtering in the vendor flow", () => {
    expect(filterSource).toContain("CATEGORIES.map");
    expect(clientSource).toContain("STATES_MY.filter");
    expect(clientSource).toContain("category");
    expect(clientSource).toContain("state");
  });

  it("uses equal-sized responsive controls for every category filter", () => {
    // Categories are now standard buttons
    expect(filterSource).toContain("flex-col");
    expect(filterSource).toContain("min-h-20");
    expect(filterSource).toContain("rounded-2xl");
  });

  it("keeps the first viewport vendor-first", () => {
    const filterIndex = clientSource.indexOf("<DiscoveryCategoryFilter");
    const vendorIndex = clientSource.indexOf("<VendorDirectoryCard");
    expect(filterIndex).toBeGreaterThan(-1);
    expect(vendorIndex).toBeGreaterThan(filterIndex);
  });

  it("uses a white canvas and the brand blue for vendor surfaces", () => {
    expect(clientSource).toContain("min-h-screen bg-background");
    expect(clientSource).toContain("text-foreground");
    expect(clientSource).toContain("bg-[#eef2ff]");
    expect(clientSource).not.toContain("#0c6b6d");
    expect(clientSource).not.toContain("#dcebea");
    expect(clientSource).not.toContain("#f6f4ef");
    expect(clientSource).not.toContain("#f8f2e5");
  });

  it("uses vendor media and never turns a destination photo into a vendor cover", () => {
    expect(catalogueSource).toContain('select("id,name,status,logo_url,cover_url,outlets(id,name,city,state)")');
    expect(clientSource).toContain("getVendorVisual");
    expect(clientSource).toContain("visual.logoUrl");
    expect(clientSource).not.toContain("MALAYSIA_DESTINATIONS");
    expect(clientSource).not.toContain("vendorDestination");
    expect(clientSource).not.toContain("destination.image");
  });
});
