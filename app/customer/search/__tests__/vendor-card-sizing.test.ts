import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/customer/search/search-client.tsx"), "utf8");

describe("partner vendor card sizing contract", () => {
  it("uses a fixed-height flex structure with reserved text slots", () => {
    expect(source).toContain("flex h-full flex-col");
    expect(source).toContain("shrink-0");
    expect(source).toContain("flex min-h-[220px] flex-1 flex-col");
    expect(source).toContain("line-clamp-2 min-h-10");
    expect(source).toContain("mt-auto");
  });

  it("keeps the vendor grids stretched across each responsive row", () => {
    expect(source).toContain("grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4");
  });
});
