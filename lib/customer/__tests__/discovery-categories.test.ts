import { describe, expect, it } from "vitest";
import {
  DISCOVERY_CATEGORIES,
  REAL_CATEGORY_SLUGS,
  canonicalCategorySlug,
  getDiscoverySearchFilter,
  normalizeCategoryRows,
  normalizeCategorySlugs,
  getDiscoveryCategoryLabel,
  getOptionalDiscoveryCategoryLabelKey,
} from "@/lib/customer/discovery-categories";

describe("discovery category contract", () => {
  it("exposes exactly the five customer discovery entries", () => {
    expect(DISCOVERY_CATEGORIES.map((category) => category.slug)).toEqual([
      "food",
      "activity",
      "accommodation",
      "retail",
      "hidden_gem",
    ]);
    expect(DISCOVERY_CATEGORIES.map((category) => category.label)).toEqual([
      "Food",
      "Activity",
      "Accommodation",
      "Retail",
      "Hidden Gem",
    ]);
  });

  it("keeps Hidden Gem as a collection, not a real category", () => {
    expect(REAL_CATEGORY_SLUGS).toEqual(["food", "activity", "accommodation", "retail"]);
    expect(REAL_CATEGORY_SLUGS).not.toContain("hidden_gem");
  });

  it("maps legacy database categories to the canonical real categories", () => {
    expect(canonicalCategorySlug("food")).toBe("food");
    expect(canonicalCategorySlug("nature")).toBe("activity");
    expect(canonicalCategorySlug("cultural")).toBe("activity");
    expect(canonicalCategorySlug("shopping")).toBe("retail");
    expect(canonicalCategorySlug("accommodation")).toBe("accommodation");
    expect(canonicalCategorySlug("old-unknown")).toBeNull();
  });

  it("uses the canonical label for known slugs and a safe fallback for legacy data", () => {
    expect(getDiscoveryCategoryLabel("activity")).toBe("Activity");
    expect(getDiscoveryCategoryLabel("nature")).toBe("Activity");
    expect(getDiscoveryCategoryLabel("old-unknown")).toBe("Activity");
  });

  it("translates only known system categories and preserves unknown database labels", () => {
    expect(getOptionalDiscoveryCategoryLabelKey("food")).toBe("categories.food");
    expect(getOptionalDiscoveryCategoryLabelKey("nature")).toBe("categories.activity");
    expect(getOptionalDiscoveryCategoryLabelKey("hidden_gem")).toBe("categories.hiddenGem");
    expect(getOptionalDiscoveryCategoryLabelKey("Community-created label")).toBeNull();
  });

  it("builds a category filter without treating Hidden Gem as a category row", () => {
    expect(getDiscoverySearchFilter("activity")).toEqual({ categorySlug: "activity" });
    expect(getDiscoverySearchFilter("hidden_gem")).toEqual({ hiddenGemOnly: true });
    expect(getDiscoverySearchFilter(null)).toEqual({});
  });

  it("maps every customer category to its exact search predicate", () => {
    expect(Object.fromEntries(
      DISCOVERY_CATEGORIES.map(({ slug }) => [slug, getDiscoverySearchFilter(slug)]),
    )).toEqual({
      food: { categorySlug: "food" },
      activity: { categorySlug: "activity" },
      accommodation: { categorySlug: "accommodation" },
      retail: { categorySlug: "retail" },
      hidden_gem: { hiddenGemOnly: true },
    });
  });

  it("normalizes legacy database rows into one option per real category", () => {
    expect(normalizeCategoryRows([
      { id: "food-id", name: "Food & Dining", slug: "food" },
      { id: "nature-id", name: "Nature & Hiking", slug: "nature" },
      { id: "cultural-id", name: "Cultural & Heritage", slug: "cultural" },
      { id: "shopping-id", name: "Shopping", slug: "shopping" },
      { id: "stay-id", name: "Accommodation", slug: "accommodation" },
    ])).toEqual([
      { id: "food-id", name: "Food", slug: "food" },
      { id: "nature-id", name: "Activity", slug: "activity" },
      { id: "stay-id", name: "Accommodation", slug: "accommodation" },
      { id: "shopping-id", name: "Retail", slug: "retail" },
    ]);
  });

  it("deduplicates legacy values that collapse into one canonical category", () => {
    expect(normalizeCategorySlugs(["nature", "cultural", "food", "food", "shopping"])).toEqual(["activity", "food", "retail"]);
  });
});
