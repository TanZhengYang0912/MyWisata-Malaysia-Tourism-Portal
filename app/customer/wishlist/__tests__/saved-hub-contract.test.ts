import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientPath = resolve(process.cwd(), "app/customer/wishlist/wishlist-client.tsx");
// The canonical page is now /customer/saved — wishlist just redirects.
const savedPagePath = resolve(process.cwd(), "app/customer/saved/page.tsx");
const wishlistPagePath = resolve(process.cwd(), "app/customer/wishlist/page.tsx");
const designDemoPath = resolve(process.cwd(), "app/customer/design-demo/design-demo-client.tsx");
const activityCardPath = resolve(process.cwd(), "components/customer/activity-card.tsx");

describe("saved hub UI contract", () => {
  it("renders places and experiences as one saved destination", () => {
    expect(existsSync(clientPath)).toBe(true);
    const client = readFileSync(clientPath, "utf8");
    const savedPage = readFileSync(savedPagePath, "utf8");
    const wishlistPage = readFileSync(wishlistPagePath, "utf8");
    const designDemo = readFileSync(designDemoPath, "utf8");
    const activityCard = readFileSync(activityCardPath, "utf8");
    expect(client).toContain("All saved");
    expect(client).toContain("Places");
    expect(client).toContain("Experiences");
    expect(client).toContain("useSavedDestinations");
    // Canonical page is /customer/saved
    expect(savedPage).toContain("SavedHubClient");
    // Old wishlist page now redirects
    expect(wishlistPage).toContain("/customer/saved");
    expect(designDemo).toContain("useSavedDestinations");
    expect(designDemo).toContain("toggleSaved");
    expect(client).toContain('returnTo="/customer/wishlist"');
    expect(activityCard).toContain("returnTo?: string");
  });
});
