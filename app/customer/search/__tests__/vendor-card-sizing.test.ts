import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/customer/vendor-card.tsx"), "utf8");
const searchSource = readFileSync(resolve(process.cwd(), "app/customer/search/search-client.tsx"), "utf8");

describe("partner vendor card sizing contract", () => {
  it("takes its sizing from the shared CardFrame instead of its own fixed heights", () => {
    expect(source).toContain("<CardFrame");
    expect(source).not.toContain("min-h-[220px]");
  });

  it("keeps the vendor grids stretched across each responsive row", () => {
    expect(searchSource).toContain("grid grid-cols-2 items-stretch gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4");
  });

  it("shows no Featured or verified label on partner cards", () => {
    expect(source).not.toContain("PhotoCardLabels");
    expect(source).not.toContain('t("ui.search.verifiedLocalPartner")');
    expect(source).not.toContain('t("ui.search.featuredPartner")');
  });
});
