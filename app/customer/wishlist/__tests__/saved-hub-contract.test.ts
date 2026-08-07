import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientPath = resolve(process.cwd(), "app/customer/wishlist/wishlist-client.tsx");
const pagePath = resolve(process.cwd(), "app/customer/wishlist/page.tsx");
const designDemoPath = resolve(process.cwd(), "app/customer/design-demo/design-demo-client.tsx");
const activityCardPath = resolve(process.cwd(), "components/customer/activity-card.tsx");

describe("saved hub UI contract", () => {
  it("renders places and experiences as one saved destination", () => {
    expect(existsSync(clientPath)).toBe(true);
    const client = readFileSync(clientPath, "utf8");
    const page = readFileSync(pagePath, "utf8");
    const designDemo = readFileSync(designDemoPath, "utf8");
    const activityCard = readFileSync(activityCardPath, "utf8");
    expect(client).toContain("All saved");
    expect(client).toContain("Places");
    expect(client).toContain("Experiences");
    expect(client).toContain("useSavedDestinations");
    expect(page).toContain("SavedHubClient");
    expect(designDemo).toContain("useSavedDestinations");
    expect(designDemo).toContain("toggleSaved");
    expect(client).toContain('returnTo="/customer/wishlist"');
    expect(activityCard).toContain("returnTo?: string");
  });
});
