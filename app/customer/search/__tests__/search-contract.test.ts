import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const pageSource = read("app/customer/search/page.tsx");
const clientSource = read("app/customer/search/search-client.tsx");
const catalogueSource = read("backend/domains/catalogue.ts");

describe("customer vendor search contract", () => {
  it("provides the approved vendor directory with promotion data", () => {
    expect(pageSource).toContain("getVendors(db)");
    expect(pageSource).toContain("getRecommendedFeed");
    expect(pageSource).toContain("rankVendorsByPersonalizedFeed");
    expect(pageSource).toContain("initialResults={results}");
    expect(pageSource).toContain("initialVendors=");
    expect(pageSource).toContain("recommendedVendors=");
    expect(clientSource).toContain("PromotionSpotlight");
    expect(clientSource).toContain("Filter by category");
  });

  it("renders vendors as the primary search result", () => {
    expect(clientSource).toContain("filteredVendors");
    expect(clientSource).toContain("Recommended for you");
    expect(clientSource).toContain("recommendedVendors");
    expect(clientSource).toContain("Tune my preferences");
    expect(clientSource).toContain("/customer/preferences");
    expect(clientSource).toContain("Verified local partners");
    expect(clientSource).toContain("Explore vendor");
    expect(clientSource).toContain("Vendor directory pages");
    expect(clientSource).not.toContain("<ActivityCard");
    expect(clientSource).not.toContain("Search Experiences");
  });

  it("also gives place-bound activities their own discovery path", () => {
    expect(clientSource).toContain("Places & trails");
    expect(clientSource).toContain("PlaceActivityCard");
    expect(clientSource).toContain("getActivityDiscoveryMode");
    expect(clientSource).toContain("Place-based experience");
    expect(clientSource).toContain("PLACE_ACTIVITIES_PER_PAGE");
    expect(clientSource).toContain("const PLACE_ACTIVITIES_PER_PAGE = 8");
    expect(clientSource).toContain("Showing");
    expect(clientSource).toContain("Place activity pages");
    expect(clientSource).toContain("Previous places page");
    expect(clientSource).toContain("Next places page");
    expect(clientSource).toContain("getActivityCommerceMode");
    expect(clientSource).toContain("Free to explore");
  });

  it("keeps category and state filtering in the vendor flow", () => {
    expect(clientSource).toContain("CATEGORIES.map");
    expect(clientSource).toContain("STATES_MY.filter");
    expect(clientSource).toContain("category");
    expect(clientSource).toContain("state");
    expect(clientSource).toContain("approved vendors");
  });

  it("uses equal-sized responsive controls for every category filter", () => {
    expect(clientSource).toContain("grid-cols-2");
    expect(clientSource).toContain("sm:grid-cols-3");
    expect(clientSource).toContain("lg:grid-cols-5");
    expect(clientSource).toContain("h-16 w-full");
    expect(clientSource).toContain("h-10 w-10 shrink-0");
  });

  it("keeps the first viewport vendor-first", () => {
    const categoryIndex = clientSource.indexOf("Filter by category");
    const vendorIndex = clientSource.indexOf("Vendor directory");
    const promotionIndex = clientSource.indexOf("<PromotionSpotlight activities={activityPool} />");
    expect(categoryIndex).toBeGreaterThan(-1);
    expect(vendorIndex).toBeGreaterThan(categoryIndex);
    expect(promotionIndex).toBeGreaterThan(vendorIndex);
    expect(clientSource).not.toContain("Browse by Category");
    expect(clientSource).toContain("approved vendors");
  });

  it("uses a white canvas and the brand blue for vendor surfaces", () => {
    expect(clientSource).toContain("min-h-screen bg-white");
    expect(clientSource).toContain("text-[#010066]");
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

  it("offers direct vendor suggestions from the search field", () => {
    expect(clientSource).toContain("vendorSuggestions");
    expect(clientSource).toContain("Suggested vendors");
    expect(clientSource).toContain("/customer/vendor/${vendor.id}");
  });
});
