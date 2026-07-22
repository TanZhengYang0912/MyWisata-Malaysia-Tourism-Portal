import { describe, expect, it } from "vitest";
import { CATEGORY_DETAILS, getCategoryChips } from "@/lib/customer/category-details";
import type { ComputedActivity } from "@/backend/core/types";

// Phase 1 taxonomy: 4 top-level categories.slug values — see
// supabase migration 20260720000000_taxonomy_v2 / categories table.
const REAL_CATEGORY_SLUGS = ["food", "activity", "accommodation", "retail"];

function makeActivity(overrides: Partial<ComputedActivity> = {}): ComputedActivity {
  return {
    id: "a1", outletId: "o1", name: "Test", category: "Activity", description: "",
    image: "", price: 10, rating: 4.5, reviews: 3, duration: "", requiresBooking: false,
    variants: [], categorySlug: "activity", typeSlugs: ["nature"], attributes: {},
    outlet: {
      id: "o1", vendorId: "v1", name: "Outlet", category: "Activity", state: "Penang", city: "Georgetown",
      address: "", lat: 5.4, lng: 100.3, hours: "09:00 - 18:00", phone: "+60123456789",
      verified: true, open: true, rating: 4.5, reviews: 3,
    },
    ...overrides,
  };
}

describe("CATEGORY_DETAILS", () => {
  it("every key maps to a real categories.slug", () => {
    for (const slug of Object.keys(CATEGORY_DETAILS)) {
      expect(REAL_CATEGORY_SLUGS).toContain(slug);
    }
  });

  it("every category has unique field keys", () => {
    for (const [slug, detail] of Object.entries(CATEGORY_DETAILS)) {
      const keys = detail.fields.map((f) => f.key);
      expect(new Set(keys).size, `duplicate field key in "${slug}"`).toBe(keys.length);
    }
  });

  it("every category is configured with its own types and fields (all 4)", () => {
    for (const slug of REAL_CATEGORY_SLUGS) {
      expect(CATEGORY_DETAILS[slug], `missing config for "${slug}"`).toBeDefined();
      expect(CATEGORY_DETAILS[slug].fields.length).toBeGreaterThan(0);
      expect(CATEGORY_DETAILS[slug].types.length).toBeGreaterThan(0);
    }
  });

  it("every type slug has a unique slug within its category", () => {
    for (const [slug, detail] of Object.entries(CATEGORY_DETAILS)) {
      const typeSlugs = detail.types.map((t) => t.slug);
      expect(new Set(typeSlugs).size, `duplicate type slug in "${slug}"`).toBe(typeSlugs.length);
    }
  });
});

describe("getCategoryChips", () => {
  it("skips fields with no value instead of rendering empty chips", () => {
    const chips = getCategoryChips(makeActivity({ attributes: {} }));
    expect(chips.some((c) => c.label === "Difficulty")).toBe(false);
  });

  it("renders configured attribute fields with units and list join", () => {
    const chips = getCategoryChips(makeActivity({
      attributes: { difficulty: "Moderate", distanceKm: 8.5, whatToBring: ["Water", "Shoes"] },
    }));
    expect(chips.find((c) => c.label === "Difficulty")?.value).toBe("Moderate");
    expect(chips.find((c) => c.label === "Trail Distance")?.value).toBe("8.5 km");
    expect(chips.find((c) => c.label === "What to Bring")?.value).toBe("Water · Shoes");
  });

  it("falls back to the generic set for an unconfigured category", () => {
    const chips = getCategoryChips(makeActivity({ categorySlug: "some-future-category", typeSlugs: undefined, attributes: {} }));
    expect(chips.map((c) => c.label)).toEqual(expect.arrayContaining(["Hours", "Contact"]));
  });

  it("renders a Type chip resolving type_slugs to their category label", () => {
    const chips = getCategoryChips(makeActivity({ categorySlug: "food", typeSlugs: ["chinese"], attributes: {} }));
    expect(chips.find((c) => c.label === "Type")?.value).toBe("Chinese");
  });

  it("renders a Good For chip for family/couple friendly badges, but not for hidden gem", () => {
    const chips = getCategoryChips(makeActivity({ isFamilyFriendly: true, isCoupleFriendly: true, isHiddenGem: true, typeSlugs: undefined }));
    expect(chips.find((c) => c.label === "Good For")?.value).toBe("Family Friendly · Couple Friendly");
  });

  it("omits the Good For chip when no badge is set", () => {
    const chips = getCategoryChips(makeActivity({ isFamilyFriendly: false, isCoupleFriendly: false, typeSlugs: undefined }));
    expect(chips.some((c) => c.label === "Good For")).toBe(false);
  });

  it("still renders Food's baseline chips (hours/tags/contact)", () => {
    const chips = getCategoryChips(makeActivity({
      categorySlug: "food",
      typeSlugs: undefined,
      tags: ["halal", "spicy"],
      outlet: { ...makeActivity().outlet, hours: "10:00 - 22:00", phone: "+60111222333" },
    }));
    expect(chips.find((c) => c.label === "Hours")?.value).toBe("10:00 - 22:00");
    expect(chips.find((c) => c.label === "Tags")?.value).toBe("halal · spicy");
    expect(chips.find((c) => c.label === "Contact")).toMatchObject({ value: "+60111222333", href: "tel:+60111222333" });
  });
});
