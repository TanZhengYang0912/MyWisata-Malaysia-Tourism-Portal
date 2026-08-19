import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/customer/search/search-client.tsx"), "utf8");

describe("featured vendor filtering contract", () => {
  it("only shows featured vendors when no search filters are active", () => {
    expect(source).toContain("!query.trim() && !state && !category");
    expect(source).toContain("filteredRecommendedVendors.map");
    expect(source).not.toContain("const featuredVendors = useMemo");
  });
});
