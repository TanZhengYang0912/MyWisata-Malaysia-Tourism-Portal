import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("customer product save entry points", () => {
  it("uses the shared authenticated wishlist toggle for every product", () => {
    const button = read("components/customer/product-save-button.tsx");

    expect(button).toContain("useOptionalWishlist");
    expect(button).toContain("savedIds.has(productId)");
    expect(button).toContain("toggleSaved(productId)");
    expect(button).toContain("CUSTOMER_CAPABILITY.ACCOUNT_MUTATION");
    expect(button).toContain('appearance="icon"');
  });

  it("offers saving from outlet food and product cards through the shared ProductCard", () => {
    expect(read("components/outlet/outlet-menu.tsx")).toContain("<ProductCard");
  });

  it.each([
    ["vendor featured product cards", "components/customer/product-card.tsx"],
    ["product detail pages", "app/customer/activity/[id]/activity-detail-client.tsx"],
  ])("offers saving from %s", (_surface, path) => {
    const source = read(path);
    expect(source).toContain("ProductSaveButton");
  });

  it("uses the shared card for vendor featured products", () => {
    expect(read("app/customer/vendor/[vendorId]/page.tsx")).toContain("<VendorListingGrid");
    expect(read("components/customer/vendor-listing-grid.tsx")).toContain("<ProductCard");
  });

  it("keeps saved product cards in sync when a customer removes an item", () => {
    const savedHub = read("app/customer/wishlist/wishlist-client.tsx");

    expect(savedHub).toContain("useWishlist");
    expect(savedHub).toContain("activities.filter((activity) => effectiveSavedIds.has(activity.id))");
  });

  it("uses product-wide copy in every customer locale", () => {
    for (const locale of ["en", "zh-CN", "ms"]) {
      const messages = JSON.parse(read(`app/i18n/locales/${locale}/customer.json`)) as {
        ui: { wishlist: { savedExperiences: string; experienceCount: string } };
      };

      expect(messages.ui.wishlist.savedExperiences).not.toMatch(/saved experiences|已保存体验|pengalaman disimpan/i);
      expect(messages.ui.wishlist.experienceCount).not.toMatch(/experiences|体验|pengalaman/i);
    }
  });
});
