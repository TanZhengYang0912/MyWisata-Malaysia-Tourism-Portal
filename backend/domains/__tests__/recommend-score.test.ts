import { describe, it, expect } from "vitest";
import { budgetCeiling, passesHardFilters, scoreActivity, type UserPrefs, type ScoreContext } from "@/backend/domains/recommend-score";
import type { ComputedActivity } from "@/backend/core/types";

const basePrefs: UserPrefs = {
  interests: ["food"],
  travelStyle: "mid_range",
  budgetRange: "mid_range",
  mobilityNeeds: "none",
  petFriendly: false,
  preferredRadiusKm: 20,
  learnedAffinity: {},
};

function activity(over: Partial<ComputedActivity> & { id: string }): ComputedActivity {
  return {
    outletId: "o1",
    name: over.name ?? "Test",
    category: over.category ?? "Food & Dining",
    categorySlug: over.categorySlug ?? "food",
    description: "",
    image: "",
    price: over.price ?? 30,
    rating: over.rating ?? 4,
    reviews: over.reviews ?? 10,
    duration: "",
    requiresBooking: false,
    variants: [],
    createdAt: over.createdAt ?? "2020-01-01T00:00:00Z",
    outlet: {
      id: "o1", vendorId: "v1", name: "Outlet", category: "", state: "", city: "", address: "",
      lat: 0, lng: 0, hours: "", verified: true, open: true, rating: 0, reviews: 0,
      wheelchairAccessible: over.outlet?.wheelchairAccessible ?? null,
      petFriendly: null,
    },
    distanceKm: over.distanceKm,
    ...over,
  } as ComputedActivity;
}

const ctx = (over: Partial<ScoreContext> = {}): ScoreContext => ({
  now: new Date("2024-06-15T14:00:00"), // Sat afternoon
  collaborative: {},
  content: {},
  maxCollaborative: 0,
  ...over,
});

describe("budgetCeiling", () => {
  it("maps bands to per-activity price ceilings", () => {
    expect(budgetCeiling("budget")).toBeLessThan(budgetCeiling("mid_range"));
    expect(budgetCeiling("luxury")).toBe(Infinity);
  });
});

describe("passesHardFilters", () => {
  it("excludes listings over the budget ceiling", () => {
    expect(passesHardFilters(activity({ id: "a", price: 500 }), basePrefs)).toBe(false);
    expect(passesHardFilters(activity({ id: "a", price: 30 }), basePrefs)).toBe(true);
  });
  it("excludes listings beyond preferred radius when distance is known", () => {
    expect(passesHardFilters(activity({ id: "a", distanceKm: 50 }), basePrefs)).toBe(false);
    expect(passesHardFilters(activity({ id: "a", distanceKm: 5 }), basePrefs)).toBe(true);
  });
  it("does NOT hard-filter on accessibility (decision 3)", () => {
    const prefs = { ...basePrefs, mobilityNeeds: "wheelchair" as const };
    // outlet accessibility unknown → still passes
    expect(passesHardFilters(activity({ id: "a" }), prefs)).toBe(true);
  });
  it("treats radius 0 as 'any distance'", () => {
    const prefs = { ...basePrefs, preferredRadiusKm: 0 };
    expect(passesHardFilters(activity({ id: "a", distanceKm: 999 }), prefs)).toBe(true);
  });
});

describe("scoreActivity", () => {
  it("ranks an interest match above a non-match", () => {
    const match = scoreActivity(activity({ id: "a", categorySlug: "food" }), basePrefs, ctx());
    const miss = scoreActivity(activity({ id: "b", categorySlug: "shopping" }), basePrefs, ctx());
    expect(match.score).toBeGreaterThan(miss.score);
    expect(match.reason).toBe("interests");
  });

  it("ranks a nearer listing above a farther one, all else equal", () => {
    const near = scoreActivity(activity({ id: "a", categorySlug: "shopping", distanceKm: 1 }), basePrefs, ctx());
    const far = scoreActivity(activity({ id: "b", categorySlug: "shopping", distanceKm: 18 }), basePrefs, ctx());
    expect(near.score).toBeGreaterThan(far.score);
  });

  it("boosts food listings at meal time", () => {
    const lunch = ctx({ now: new Date("2024-06-15T12:30:00") });
    const midday = scoreActivity(activity({ id: "a", categorySlug: "food" }), basePrefs, lunch);
    const teatime = ctx({ now: new Date("2024-06-15T16:00:00") });
    const afternoon = scoreActivity(activity({ id: "a", categorySlug: "food" }), basePrefs, teatime);
    expect(midday.score).toBeGreaterThan(afternoon.score);
  });

  it("flags a highly-rated but little-known listing as a Hidden Gem", () => {
    const gem = scoreActivity(
      activity({ id: "a", categorySlug: "shopping", rating: 5, reviews: 2, createdAt: new Date().toISOString() }),
      basePrefs,
      ctx(),
    );
    expect(gem.reason).toBe("hidden_gem");
  });

  it("surfaces collaborative picks as 'popular with similar travellers'", () => {
    const c = ctx({ collaborative: { a: 10 }, maxCollaborative: 10 });
    const picked = scoreActivity(activity({ id: "a", categorySlug: "shopping" }), basePrefs, c);
    expect(picked.reason).toBe("similar");
  });
});
