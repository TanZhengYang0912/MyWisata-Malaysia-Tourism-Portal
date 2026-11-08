import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("hotel-first discovery surfaces", () => {
  it("feeds the Explore postcard board the hotel-grouped list", () => {
    expect(read("app/customer/explore/explore-client.tsx")).toContain("<ExplorePostcardBoard activities={displayActivities}");
  });

  it("links a hotel on the map to its hotel page and never shows hotel opening hours", () => {
    const storyMap = read("components/demo-map/story-map.tsx");
    expect(storyMap).toContain("getOutletShopHref(selectedActivity.outlet.id)");
    const hourLines = storyMap.split("\n").filter((line) => line.includes("outlet.hours &&"));
    expect(hourLines.length).toBeGreaterThan(0);
    for (const line of hourLines) expect(line).toContain('categorySlug !== "accommodation" &&');
  });

  it("groups rooms into hotels on the home pages and For You", () => {
    expect(read("app/customer/page.tsx")).toContain("selectHomeDiscoverySections(activities, recommended, placements, requestedAt)");
    expect(read("lib/customer/discovery-ranking.ts")).toContain("groupAccommodationByProperty(activities)");
    expect(read("lib/customer/discovery-ranking.ts")).toContain("groupAccommodationByProperty(recommended)");
    expect(read("app/customer/home-client.tsx")).toContain("groupAccommodationByProperty(");
    expect(read("app/customer/for-you/for-you-client.tsx")).toContain("groupRankedByProperty(");
  });

  it("never shows opening hours on a hotel or stay card", () => {
    expect(read("components/customer/product-card.tsx")).toMatch(/\{isStayCard \? null : activity\.outlet\.operatingHours/);
  });

  it("names the pin preview card apart from the shared ActivityCard", () => {
    const preview = read("components/demo-map/discovery-pin-preview.tsx");
    expect(preview).toContain("function PinActivityCard(");
    expect(preview).not.toMatch(/^function ActivityCard\(/m);
  });
});
