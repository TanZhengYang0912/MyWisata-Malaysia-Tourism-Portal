import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/customer/search/search-client.tsx"), "utf8");

describe("featured partner directory contract", () => {
  it("defaults to featured-first ordering and supports a featured-only view", () => {
    expect(source).toContain('useState<PartnerView>("all")');
    expect(source).toContain('useState<PartnerSort>("featured")');
    expect(source).toContain("new Set(recommendedVendors.map((vendor) => vendor.id))");
    expect(source).toContain("rankPartnerDirectory({");
    expect(source).toContain('t("ui.search.partnerView")');
    expect(source).toContain('t("ui.search.featuredOnly")');
    expect(source).toContain('t("ui.search.featuredFirst")');
    expect(source).toContain('t("ui.search.nameAscending")');
    expect(source).toContain('t("ui.search.mostOutlets")');
    expect(source).not.toContain("filteredRecommendedVendors");
    expect(source).not.toContain('t("ui.search.recommendFeatured")');
  });

  it("ranks after search filtering and before pagination", () => {
    const filterIndex = source.indexOf("const matchingVendors = useMemo");
    const rankIndex = source.indexOf("const filteredVendors = useMemo");
    const sliceIndex = source.indexOf("filteredVendors.slice(pageStart");

    expect(filterIndex).toBeGreaterThan(-1);
    expect(rankIndex).toBeGreaterThan(filterIndex);
    expect(sliceIndex).toBeGreaterThan(rankIndex);
    expect(source).toContain("setPartnerView(event.target.value as PartnerView); setCurrentPage(1);");
    expect(source).toContain("setPartnerSort(event.target.value as PartnerSort); setCurrentPage(1);");
  });

  it("uses the featured ranking to label the shared vendor card", () => {
    expect(source).toContain("featuredVendorIds");
    expect(source).toContain("rankPartnerDirectory");
    expect(source).toContain("isFeatured={featuredVendorIds.has(vendor.id)}");
  });
});
