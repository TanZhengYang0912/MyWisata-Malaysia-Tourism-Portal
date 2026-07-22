import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/customer/activity/[id]/activity-detail-client.tsx"),
  "utf8",
);

describe("activity detail booking layout", () => {
  it("places the shorter hero and content before the desktop booking card inside one grid", () => {
    const gridIndex = source.indexOf('className="grid items-start gap-6');
    const heroIndex = source.indexOf("h-44");
    const sectionIndex = source.indexOf('<section className="min-w-0 lg:flex');
    const asideIndex = source.indexOf("<aside className=");

    expect(gridIndex).toBeGreaterThanOrEqual(0);
    expect(heroIndex).toBeGreaterThan(gridIndex);
    expect(sectionIndex).toBeGreaterThan(heroIndex);
    expect(asideIndex).toBeGreaterThan(sectionIndex);
  });

  it("keeps the mobile fixed add-to-cart action", () => {
    expect(source).toContain("md:hidden");
    expect(source).toContain("Add to Cart");
  });

  it("scopes scrolling to the reviews list, not the whole page", () => {
    expect(source).toContain("lg:overflow-y-auto");
    expect(source).toContain("<ActivityReviews");
  });

  it("moves the Visit shop action into the booking aside", () => {
    const asideIndex = source.indexOf("<aside className=");
    const visitShopIndex = source.indexOf("Visit shop");
    expect(visitShopIndex).toBeGreaterThan(asideIndex);
  });

  it("shows a Hidden Gem badge driven by activity.isHiddenGem", () => {
    expect(source).toContain("activity.isHiddenGem");
    expect(source).toContain("Hidden Gem");
  });

  it("has no Details/Map toggle or map-only view remnants", () => {
    expect(source).not.toContain('"details", "map"');
    expect(source).not.toContain("MapView");
    expect(source).not.toContain("TRAVEL_MODES");
    expect(source).not.toContain("Add to trip");
    expect(source).not.toContain("useTrip");
  });

  it("renders the category chips as a Details card inside the aside", () => {
    const asideIndex = source.indexOf("<aside className=");
    const detailsCardIndex = source.indexOf(">Details<");
    const chipsIndex = source.indexOf("chips.map");
    expect(detailsCardIndex).toBeGreaterThan(asideIndex);
    expect(chipsIndex).toBeGreaterThan(detailsCardIndex);
  });

  it("evaluates category chips before the empty-activity early return", () => {
    const chipsHookIndex = source.indexOf("const chips = useMemo");
    const emptyActivityGuardIndex = source.indexOf("if (activity === null)");

    expect(chipsHookIndex).toBeGreaterThanOrEqual(0);
    expect(emptyActivityGuardIndex).toBeGreaterThanOrEqual(0);
    expect(chipsHookIndex).toBeLessThan(emptyActivityGuardIndex);
  });
});
