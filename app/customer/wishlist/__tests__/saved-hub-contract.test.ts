import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const clientPath = resolve(process.cwd(), "app/customer/wishlist/wishlist-client.tsx");
// The canonical page is now /customer/saved — wishlist just redirects.
const savedPagePath = resolve(process.cwd(), "app/customer/saved/page.tsx");
const wishlistPagePath = resolve(process.cwd(), "app/customer/wishlist/page.tsx");
const designDemoPath = resolve(process.cwd(), "app/customer/design-demo/design-demo-client.tsx");
const activityCardPath = resolve(process.cwd(), "components/customer/product-card.tsx");
const savedDestinationCardPath = resolve(process.cwd(), "components/customer/saved-destination-card.tsx");

describe("saved hub UI contract", () => {
  it("uses the bookmark icon for the saved hub shortlist marker", () => {
    const client = readFileSync(clientPath, "utf8");

    expect(client).toContain('<Bookmark size={17} fill="currentColor" />');
    expect(client).not.toContain("Heart");
  });

  it("renders places and experiences as one saved destination", () => {
    expect(existsSync(clientPath)).toBe(true);
    const client = readFileSync(clientPath, "utf8");
    const savedPage = readFileSync(savedPagePath, "utf8");
    const wishlistPage = readFileSync(wishlistPagePath, "utf8");
    const designDemo = readFileSync(designDemoPath, "utf8");
    const activityCard = readFileSync(activityCardPath, "utf8");
    expect(client).toContain('tCustomer("ui.wishlist.allSaved")');
    expect(client).toContain('tCustomer("ui.labels.places")');
    expect(client).toContain('tCustomer("ui.wishlist.savedExperiences")');
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

  it("omits the Saved intro and destination descriptions", () => {
    const client = readFileSync(clientPath, "utf8");
    const destinationCard = readFileSync(savedDestinationCardPath, "utf8");

    expect(client).not.toContain('tCustomer("ui.wishlist.description")');
    expect(destinationCard).not.toContain("{destination.tagline}");
    for (const locale of ["en", "zh-CN", "ms"]) {
      const messages = JSON.parse(readFileSync(resolve(process.cwd(), `app/i18n/locales/${locale}/customer.json`), "utf8")) as { ui: { wishlist: Record<string, unknown> } };
      expect(messages.ui.wishlist).not.toHaveProperty("description");
    }
  });

  it("uses the unified, unlabelled product card for Saved experiences", () => {
    const client = readFileSync(clientPath, "utf8");
    const savedActivityCard = client.match(/<ProductCard key=\{activity\.id\}[\s\S]*?\/>/)?.[0] ?? "";

    expect(savedActivityCard).toContain("listing={toDiscoveryCatalogueCard(activity, { labels: false })}");
    expect(savedActivityCard).toContain('returnTo="/customer/wishlist"');
    expect(savedActivityCard).not.toContain("detailsRevealStyle");
  });
});
