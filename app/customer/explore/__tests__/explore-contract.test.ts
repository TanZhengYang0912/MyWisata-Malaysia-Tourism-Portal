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

describe("customer discovery filter contract", () => {
  it("shares the searchable category-card controls", () => {
    expect(filterSource).toContain("placeholder");
    expect(filterSource).toContain('t("ui.explore.filterByCategory")');
    expect(filterSource).toContain("CATEGORIES.map");
    expect(filterSource).toContain("aria-pressed");
    expect(filterSource).toContain("grid-cols-2");
    expect(filterSource).toContain("sm:grid-cols-3");
    expect(filterSource).toContain("lg:grid-cols-5");
  });

  it("connects Explore search and filters to the shared discovery query", () => {
    expect(exploreSource).toContain("parseDiscoveryQuery");
    expect(exploreSource).toContain("serializeDiscoveryQuery");
    expect(exploreSource).toContain("DiscoveryAdvancedFilters");
    expect(exploreSource).toContain("onClear");
    expect(exploreSource).toContain("visibleLimit");
    expect(exploreSource).toContain('placeholder={t("ui.map.searchExperience")}');
  });

  it("keeps Partners state filtering with direct search controls", () => {
    expect(searchSource).toContain("<select");
    expect(searchSource).toContain("STATES_MY.filter(s => s !== \"All Malaysia\").map");
    expect(searchSource).toContain('placeholder={t("ui.search.searchVendors")}');
    expect(searchSource).toContain("setState(e.target.value || null)");
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
