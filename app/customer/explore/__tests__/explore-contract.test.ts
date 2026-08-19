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
    expect(filterSource).toContain("Filter by Category");
    expect(filterSource).toContain("CATEGORIES.map");
    expect(filterSource).toContain("aria-pressed");
    expect(filterSource).toContain("grid-cols-2");
    expect(filterSource).toContain("sm:grid-cols-3");
    expect(filterSource).toContain("lg:grid-cols-5");
  });

  it("combines Explore search with category filtering and supports Clear", () => {
    expect(exploreSource).toContain("const [query, setQuery] = useState(\"\")");
    expect(exploreSource).toContain("searchActivities({ q: query.trim() || undefined");
    expect(exploreSource).toContain("getDiscoverySearchFilter(category)");
    expect(exploreSource).toContain("onClear");
    expect(exploreSource).toContain("setQuery(\"\")");
    expect(exploreSource).toContain("Search experiences...");
  });

  it("keeps Partners state filtering with direct search controls", () => {
    expect(searchSource).toContain("<select");
    expect(searchSource).toContain("STATES_MY.filter(s => s !== \"All Malaysia\").map");
    expect(searchSource).toContain("Search vendors...");
    expect(searchSource).toContain("setState(e.target.value || null)");
  });

  it("keeps the Explore mode switch on the right with the voucher navy active state", () => {
    expect(exploreSource).toContain("self-end md:self-auto");
    expect(exploreSource).toContain("rounded-2xl border border-border bg-white p-2 shadow-sm");
    expect(exploreSource).toContain("bg-primary text-white shadow-sm");
  });
});
