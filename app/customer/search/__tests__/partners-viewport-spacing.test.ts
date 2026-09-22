import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const searchSource = readFileSync(resolve(process.cwd(), "app/customer/search/search-client.tsx"), "utf8");
const filterSource = readFileSync(resolve(process.cwd(), "components/customer/discovery-filters.tsx"), "utf8");
const railSource = readFileSync(resolve(process.cwd(), "components/customer/sponsored-partner-rail.tsx"), "utf8");

describe("partners first-viewport spacing contract", () => {
  it("keeps the full-width advertising banner compact enough to enter the initial viewport", () => {
    expect(searchSource).toContain("px-4 pb-8 pt-8 sm:px-6 sm:pb-8 sm:pt-10");
    expect(searchSource).toContain('data-testid="partner-filter-bar"');
    expect(searchSource).toContain('categoryVariant="cards"');
    expect(searchSource).toContain("includeAllCategories={false}");
    expect(filterSource).toContain('headingKey="ui.search.category"');
    expect(filterSource).toContain("<div className=\"mb-3 flex items-center justify-between gap-4\">");
    expect(filterSource).toContain("overflow-x-auto");
    expect(filterSource).toContain("min-h-10");
    expect(railSource).toContain("mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6 lg:px-8");
    expect(railSource).toContain('className="group w-full overflow-hidden bg-card"');
  });
});
