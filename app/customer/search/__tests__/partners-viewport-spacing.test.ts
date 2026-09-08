import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const searchSource = readFileSync(resolve(process.cwd(), "app/customer/search/search-client.tsx"), "utf8");
const filterSource = readFileSync(resolve(process.cwd(), "components/customer/discovery-filters.tsx"), "utf8");
const railSource = readFileSync(resolve(process.cwd(), "components/customer/sponsored-partner-rail.tsx"), "utf8");

describe("partners first-viewport spacing contract", () => {
  it("keeps the advertising rail compact enough to enter the initial viewport", () => {
    expect(searchSource).toContain("px-4 py-8 sm:px-6 sm:py-10");
    expect(searchSource).toContain("mt-8 space-y-6");
    expect(filterSource).toContain("<div className=\"mb-3 flex items-center justify-between gap-4\">");
    expect(filterSource).toContain("flex min-h-20 w-full");
    expect(railSource).toContain("mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8");
    expect(railSource).toContain("min-w-[300px]");
  });
});
