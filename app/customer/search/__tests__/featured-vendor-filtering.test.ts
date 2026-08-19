import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/customer/search/search-client.tsx"), "utf8");

describe("featured vendor filtering contract", () => {
  it("only shows featured vendors when no search filters are active", () => {
    expect(source).toContain("!query && !category && !state && recommendedVendors.length > 0");
    expect(source).toContain("recommendedVendors.slice(0, 4).map");
    expect(source).not.toContain("const featuredVendors = useMemo");
  });
});
