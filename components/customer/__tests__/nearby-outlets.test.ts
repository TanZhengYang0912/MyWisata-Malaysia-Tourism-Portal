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

  it("shows each nearby outlet on the shared OutletCard, linked to its shop page", () => {
    expect(nearbySource).toContain("<OutletCard");
    expect(nearbySource).toContain("href={getOutletShopHref(outlet.id)}");
    expect(nearbySource).toContain("imageUrl: outlet.coverUrl || outlet.vendorLogoUrl");
    expect(nearbySource).toContain("openNow: outlet.currentlyOpen ?? outlet.open");
  });

  it("hides the rating when the outlet has no reviews, and shows no hours or distance on the card", () => {
    expect(nearbySource).toContain("rating: outlet.reviews ? { value: outlet.rating, count: outlet.reviews } : undefined");
    expect(nearbySource).not.toContain("OperatingHoursSummary");
    expect(nearbySource).not.toContain("DISTANCE_UNIT_KM");
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
  it("uses the shared pager, not a show-more counter", () => {
    expect(nearbySource).toContain("<Pagination");
    expect(nearbySource).not.toContain("Show more");
    expect(nearbySource).not.toContain("setVisible");
  });

  it("resets to the first page whenever a filter changes", () => {
    expect(nearbySource).toContain("setPage(1)");
  });
});
