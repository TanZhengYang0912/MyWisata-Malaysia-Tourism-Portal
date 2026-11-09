import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
const pageSource = read("app/customer/partners/page.tsx");
const clientSource = read("app/customer/search/search-client.tsx");
const exploreSource = read("app/customer/explore/explore-client.tsx");
const vendorCardSource = read("components/customer/vendor-card.tsx");
const catalogueSource = read("backend/domains/catalogue.ts");
const filterSource = read("components/customer/discovery-filters.tsx");

describe("customer vendor search contract", () => {
  it("reuses the directory catalogue for the no-query recommendation feed", () => {
    expect(pageSource).toContain("const resultsPromise = searchActivities");
    expect(pageSource).toContain("resultsPromise.then((results) => getRecommendedFeed");
    expect(pageSource).toContain("candidates: results");
  });

  it("loads outlet-owned gallery photos for sponsored outlets even when a Hero exists", () => {
    expect(pageSource).toContain("attachSponsoredOutletGalleryCovers");
    expect(pageSource).toContain('.from("media_assets")');
    expect(pageSource).toContain('.in("outlet_id", sponsoredOutletIds)');
    expect(pageSource).toContain('.is("product_id", null)');
  });

  it("provides approved vendors with a safe sponsored placement projection", () => {
    expect(pageSource).toContain("getVendors(db)");
    expect(pageSource).toContain("getRecommendedFeed");
    expect(pageSource).toContain("rankVendorsByPersonalizedFeed");
    expect(pageSource).toContain('rpc("list_active_sponsored_discovery_placements")');
    expect(pageSource).toContain("initialResults={partnerResults}");
    expect(pageSource).toContain("initialVendors=");
    expect(pageSource).toContain("recommendedVendors=");
    expect(pageSource).toContain("sponsoredPlacements=");
    expect(pageSource).not.toContain("review_note");
    expect(pageSource).not.toContain("approved_by");
    expect(clientSource).toContain("<SponsoredPartnerRail");
    expect(filterSource).toContain("categoryOptions.map");
  });

  it("renders vendors as the primary search result", () => {
    expect(clientSource).toContain("filteredVendors");
    expect(clientSource).toContain("recommendedVendors");
    expect(clientSource).not.toContain("detailsRevealOnHover");
    expect(clientSource).not.toContain('t("ui.search.approvedPartnerDescription")');
    expect(clientSource).not.toContain("<ActivityCard");
    expect(clientSource).not.toContain("<PlaceActivityCard");
  });

  it("shows four vendor cards per page and keeps pagination tied to that page size", () => {
    expect(clientSource).toContain("const RESULTS_PER_PAGE = 4");
    expect(clientSource).toContain("Math.ceil(filteredVendors.length / RESULTS_PER_PAGE)");
    expect(clientSource).toContain("filteredVendors.slice(pageStart, pageStart + RESULTS_PER_PAGE)");
  });

  it("also gives place-bound activities their own discovery path", () => {
    expect(clientSource).toContain("PlaceActivityCard");
    expect(clientSource).toContain("getActivityDiscoveryMode");
    expect(clientSource).toContain("PLACE_ACTIVITIES_PER_PAGE");
    expect(clientSource).toContain("const PLACE_ACTIVITIES_PER_PAGE = 8");
    expect(clientSource).toContain("getActivityCommerceMode");
  });

  it("keeps category and state filtering in the vendor flow", () => {
    expect(filterSource).toContain("categoryOptions.map");
    expect(clientSource).toContain("<CustomerDiscoveryFilterPanel");
    expect(clientSource).toContain("category");
    expect(clientSource).toContain("state");
  });

  it("filters partners by open-now and complete operating-hour ranges", () => {
    expect(clientSource).toContain("timeFrom");
    expect(clientSource).toContain("timeTo");
    expect(filterSource).toContain('type="time"');
    expect(filterSource).toContain('t("ui.labels.openNow")');
    expect(clientSource).toContain("isOperatingHoursWindowAvailable");
    expect(clientSource).toContain("operatingHours");
  });

  it("uses the same customer discovery filter panel as Explore", () => {
    expect(clientSource).toContain("<CustomerDiscoveryFilterPanel");
    expect(clientSource).toContain("operatingDays");
    expect(clientSource).toContain("hoursMode");
    expect(clientSource).toContain("timeAt");
    expect(clientSource).toContain("overnight");
  });

  it("inherits the shared collapsed advanced filter behavior", () => {
    expect(clientSource).toContain("<CustomerDiscoveryFilterPanel");
    expect(filterSource).toContain("filtersOpen");
    expect(filterSource).toContain('t("ui.map.moreFilters")');
  });

  it("uses equal-sized responsive controls for every category filter", () => {
    // Categories are now standard buttons
    expect(filterSource).toContain("flex-col");
    expect(filterSource).toContain("min-h-20");
    expect(filterSource).toContain("rounded-2xl");
  });

  it("keeps the first viewport vendor-first", () => {
    const filterIndex = clientSource.indexOf("<CustomerDiscoveryFilterPanel");
    const vendorIndex = clientSource.indexOf("<VendorCard");
    expect(filterIndex).toBeGreaterThan(-1);
    expect(vendorIndex).toBeGreaterThan(filterIndex);
  });

  it("removes explanatory blurbs while keeping discovery before featured recommendations", () => {
    const titleIndex = clientSource.indexOf('t("ui.search.title")');
    const sponsoredIndex = clientSource.indexOf("<SponsoredPartnerRail");
    const filterIndex = clientSource.indexOf("<CustomerDiscoveryFilterPanel");
    expect(clientSource).not.toContain('t("ui.search.description")');
    expect(clientSource).not.toContain('t("ui.search.directoryDescription")');
    expect(titleIndex).toBeGreaterThan(-1);
    expect(sponsoredIndex).toBeGreaterThan(-1);
    expect(filterIndex).toBeGreaterThan(-1);
    expect(titleIndex).toBeLessThan(filterIndex);
    expect(filterIndex).toBeLessThan(sponsoredIndex);
  });

  it("keeps partner discovery controls in one unified filter surface", () => {
    expect(clientSource.match(/bar: "partner-filter-bar"/g)).toHaveLength(1);
    expect(clientSource).toContain("<CustomerDiscoveryFilterPanel");
    expect(clientSource).toContain('data-testid="partner-view-control"');
    expect(clientSource).toContain('sort: "partner-sort-control"');
    expect(clientSource).toContain('t("ui.search.activeFilters")');
    expect(filterSource).toContain('includeAll={includeAllCategories}');
    expect(filterSource).toContain('headingKey="ui.search.category"');
    expect(clientSource).not.toContain('!hasActiveFilters && <span className="text-xs text-muted-foreground">');
    expect(clientSource).not.toContain("lg:w-[460px]");
  });

  it("keeps Partners filter alignment and uses the Explore sidebar", () => {
    expect(clientSource).toContain('filterButtonAlignment="end"');
    expect(exploreSource).toContain('layout="sidebar"');
    expect(filterSource).toContain('filterButtonAlignment = "start"');
  });

  it("uses a white canvas and the brand blue for vendor surfaces", () => {
    expect(clientSource).toContain('className="min-h-screen overflow-x-clip bg-background text-foreground"');
    expect(clientSource).toContain("text-foreground");
    expect(clientSource).toContain("bg-[#eef2ff]");
    expect(clientSource).not.toContain("#0c6b6d");
    expect(clientSource).not.toContain("#dcebea");
    expect(clientSource).not.toContain("#f6f4ef");
    expect(clientSource).not.toContain("#f8f2e5");
  });

  it("uses vendor media and never turns a destination photo into a vendor cover", () => {
    // Vendor cards still read the vendor's own logo and cover (the select also asks for outlet badges when available).
    expect(catalogueSource).toContain('"id,name,status,kind,logo_url,cover_url,outlets(id,name,city,state,status,review_status,operating_hours,badge_slugs)"');
    expect(catalogueSource).toContain('"id,name,status,kind,logo_url,cover_url,outlets(id,name,city,state,status,review_status,operating_hours)"');
    expect(vendorCardSource).toContain("getVendorVisual");
    // The shared card shows the vendor cover (or initials); the logo tile was dropped with the caption card.
    expect(vendorCardSource).toContain("visual.coverUrl");
    expect(clientSource).not.toContain("MALAYSIA_DESTINATIONS");
    expect(clientSource).not.toContain("vendorDestination");
    expect(clientSource).not.toContain("destination.image");
  });
});
