import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const nearbySource = readFileSync(
  resolve(process.cwd(), "components/customer/nearby-outlets.tsx"),
  "utf8",
);

describe("nearby outlets section", () => {
  it("drops the radius from the heading, keeping it on the chips", () => {
    expect(nearbySource).toContain("Nearby businesses");
    expect(nearbySource).not.toContain("Nearby businesses, within");
  });

  it("links every row to the outlet's shop page", () => {
    expect(nearbySource).toContain("getOutletShopHref");
    expect(nearbySource).toContain("href={getOutletShopHref(outlet.id)}");
  });
});

describe("nearby outlets pagination", () => {
  it("uses the shared numbered pagination, not a show-more counter", () => {
    expect(nearbySource).toContain("DirectoryPagination");
    expect(nearbySource).not.toContain("Show more");
    expect(nearbySource).not.toContain("setVisible");
  });

  it("resets to the first page whenever a filter changes", () => {
    expect(nearbySource).toContain("setPage(1)");
  });
});
