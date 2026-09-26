import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/customer/vendor-card.tsx"), "utf8");
const searchSource = readFileSync(resolve(process.cwd(), "app/customer/search/search-client.tsx"), "utf8");

describe("partner vendor card sizing contract", () => {
  it("uses a fixed-height flex structure with reserved text slots", () => {
    expect(source).toContain("flex h-full flex-col");
    expect(source).toContain("shrink-0");
    expect(source).toContain("flex min-h-[220px] flex-1 flex-col");
    expect(source).toContain("min-h-10 break-words whitespace-normal");
    expect(source).not.toContain("line-clamp-2");
    expect(source).toContain("mt-auto");
  });

  it("keeps the vendor grids stretched across each responsive row", () => {
    expect(searchSource).toContain("grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4");
  });

  it("shows a featured badge for featured partners and a verified badge otherwise", () => {
    expect(source).toContain('t("ui.search.verifiedLocalPartner")');
    expect(source).toContain('t("ui.search.featuredPartner")');
    expect(source).toContain("isFeatured ?");
  });
});
