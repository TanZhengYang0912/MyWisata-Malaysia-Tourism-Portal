import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => {
  const path = resolve(process.cwd(), file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
};
const exploreSource = read("app/customer/explore/explore-client.tsx");
const searchSource = read("app/customer/search/search-client.tsx");
const filterSource = read("components/customer/discovery-filters.tsx");
const storyMapSource = read("components/demo-map/story-map.tsx");

describe("customer discovery filter contract", () => {
  it("shares the searchable category-card controls", () => {
    expect(filterSource).toContain("placeholder");
    expect(filterSource).toContain('headingKey = "ui.explore.filterByCategory"');
    expect(filterSource).toContain("CATEGORIES.map");
    expect(filterSource).toContain("aria-pressed");
    expect(filterSource).toContain("grid-cols-2");
    expect(filterSource).toContain("sm:grid-cols-3");
    expect(filterSource).toContain("lg:grid-cols-5");
    expect(filterSource).toContain('selected ? "border-primary bg-primary text-white shadow-sm" : "border-transparent bg-card text-foreground shadow-sm"');
  });

  it("connects Explore search and filters to the shared discovery query", () => {
    expect(exploreSource).toContain("parseDiscoveryQuery");
    expect(exploreSource).toContain("serializeDiscoveryQuery");
    expect(exploreSource).toContain("<CustomerDiscoveryFilterPanel");
    expect(exploreSource).toContain("timeFrom");
    expect(exploreSource).toContain("timeTo");
    expect(exploreSource).toContain("onClear");
    expect(exploreSource).toContain("visibleLimit");
    expect(exploreSource).toContain('placeholder={t("ui.map.searchExperience")}');
  });

  it("shares the complete weekly-hours filter surface with Partners", () => {
    expect(exploreSource).toContain("<CustomerDiscoveryFilterPanel");
    expect(exploreSource).toContain("operatingDays");
    expect(exploreSource).toContain("hoursMode");
    expect(exploreSource).toContain("openNow");
  });

  it("keeps sponsored analytics metadata and labels sponsored places in the customer UI", () => {
    expect(exploreSource).toContain("sponsorship");
    expect(exploreSource).toContain("onSponsoredClick");
    expect(storyMapSource).toContain('t("ui.labels.sponsored")');
  });

  it("keeps the canonical category selector out of the advanced filter panel", () => {
    expect(filterSource).not.toContain('<p className="text-sm font-bold text-foreground">{t("ui.explore.filterByCategory")}</p>');
    expect(filterSource).not.toContain('CATEGORIES.filter((category) => category.id !== "hidden_gem")');
  });

  it("collapses the complete advanced filter surface behind one shared toggle", () => {
    expect(filterSource).toContain("filtersOpen");
    expect(filterSource).toContain('t("ui.map.moreFilters")');
    expect(filterSource).toContain('t("ui.map.activeFilters"');
    expect(filterSource).toContain("aria-expanded={filtersOpen}");
    expect(filterSource).toContain("filtersOpen && <DiscoveryAdvancedFilters");
  });

  it("keeps Partners state and schedule filtering in the shared panel", () => {
    expect(searchSource).toContain("<CustomerDiscoveryFilterPanel");
    expect(searchSource).toContain("operatingDays");
    expect(searchSource).toContain("hoursMode");
    expect(searchSource).toContain('placeholder={t("ui.search.searchVendors")}');
    expect(filterSource).toContain('t("ui.discovery.state")');
  });

  it("keeps the Explore mode switch on the right with the voucher navy active state", () => {
    expect(exploreSource).toContain("self-end md:self-auto");
    expect(exploreSource).toContain("rounded-2xl border border-border bg-card p-2 shadow-sm");
    expect(exploreSource).toContain("bg-primary text-white shadow-sm");
  });

  it("orders explore destination zones by tourism prominence starting with Federal Territory", () => {
    const zoneMatch = exploreSource.match(/const ZONE_ORDER = \[([\s\S]*?)\];/);
    expect(zoneMatch).toBeTruthy();
    const parsedZones = (zoneMatch?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/['"]/g, ""))
      .filter(Boolean);
    expect(parsedZones[0]).toBe("Federal Territory");
    expect(parsedZones).toEqual([
      "Federal Territory",
      "Northern Malaysia",
      "Central Malaysia",
      "Southern Malaysia",
      "Borneo Malaysia",
      "East Coast Malaysia",
    ]);
  });
});
