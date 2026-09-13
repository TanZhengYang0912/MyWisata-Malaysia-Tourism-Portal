import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const nearbySource = readFileSync(
  resolve(process.cwd(), "components/customer/nearby-outlets.tsx"),
  "utf8",
);

describe("nearby outlets section", () => {
  it("drops the radius from the heading, keeping it on the chips", () => {
    expect(nearbySource).toContain('t("ui.nearbyOutlets.title"');
    expect(nearbySource).toContain('t("ui.nearbyOutlets.summary", { count: filtered.length, radius');
  });

  it("links every row to the outlet's shop page", () => {
    expect(nearbySource).toContain("getOutletShopHref");
    expect(nearbySource).toContain("href={getOutletShopHref(outlet.id)}");
    expect(nearbySource.match(/t\("ui\.nearbyOutlets\.viewShop", \{ name: outlet\.name \}\)/g)).toHaveLength(2);
  });

  it("uses outlet shop photos with a neutral fallback and the shared mature action", () => {
    expect(nearbySource).toContain("outlet.coverUrl");
    expect(nearbySource).toContain("<ArrowUpRight");
    expect(nearbySource).toContain("<Store");
    expect(nearbySource).not.toContain("outlet.logoUrl");
    expect(nearbySource).not.toContain("<ArrowRight");
  });

  it("uses the existing category translation key for a nearby outlet badge", () => {
    expect(nearbySource).toContain("getOptionalDiscoveryCategoryLabelKey");
    expect(nearbySource).toContain("t(categoryKey)");
  });

  it("shows each nearby outlet's operating hours", () => {
    expect(nearbySource).toContain('t("ui.labels.operatingHours")');
    expect(nearbySource).toContain("outlet.hours");
  });

  it("groups type and distance filters and defaults to a local radius", () => {
    expect(nearbySource).toContain('aria-label={t("ui.nearbyOutlets.filterType"');
    expect(nearbySource).toContain('aria-label={t("ui.nearbyOutlets.filterDistance"');
    expect(nearbySource).toContain("useState(Math.min(3, maxRadiusKm))");
    expect(nearbySource).toContain('t("ui.nearbyOutlets.coordinateNote"');
  });

  it("keeps the distance controls fixed instead of deriving them from the server radius", () => {
    expect(nearbySource).toContain("const RADIUS_OPTIONS_KM = [1, 3, 8] as const;");
    expect(nearbySource).not.toContain("new Set([1, 3, 10, maxRadiusKm]");
    expect(nearbySource).toContain("min-w-[64px]");
    expect(nearbySource).toContain("lg:grid-cols-[minmax(0,1fr)_auto_minmax(120px,auto)]");
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
