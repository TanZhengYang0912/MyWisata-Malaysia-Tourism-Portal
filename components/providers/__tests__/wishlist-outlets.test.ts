import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("saved hotels in the wishlist provider", () => {
  const provider = read("components/providers/wishlist.tsx");

  it("loads and toggles saved hotels through /api/saved-outlets", () => {
    expect(provider).toContain("savedOutletIds: ReadonlySet<string>");
    expect(provider).toContain("toggleSavedOutlet: (outletId: string) => Promise<boolean>");
    expect(provider).toContain('endpoint: "/api/saved-outlets", responseKey: "outletIds", inputKey: "outletId"');
    expect(provider).toMatch(/fetch\(endpoint, \{\s*method: nextSaved \? "POST" : "DELETE"/);
  });

  it("saves the whole hotel from hotel cards and the hotel page", () => {
    expect(read("components/customer/activity-card.tsx")).toContain("toggleSavedOutlet(activity.outlet.id)");
    expect(read("components/outlet/hotel-page.tsx")).toContain("toggleSavedOutlet(outlet.id)");
  });

  it("lists saved hotels as hotel cards in the wishlist", () => {
    const wishlist = read("app/customer/wishlist/wishlist-client.tsx");
    expect(wishlist).toContain("savedOutletIds");
    expect(wishlist).toContain("groupAccommodationByProperty(");
    expect(wishlist).toContain('"ui.wishlist.savedHotels"');
  });
});
