import { describe, expect, it } from "vitest";

import {
  compareEligibleSponsoredPlacements,
  getSponsoredSpecificity,
} from "@/lib/sponsored-placements/targeting";

describe("getSponsoredSpecificity", () => {
  const request = { state: "Penang", categorySlug: "food" };

  it.each([
    [{ state: "Penang", categorySlug: "food" }, 0],
    [{ state: "Penang", categorySlug: null }, 1],
    [{ state: null, categorySlug: "food" }, 2],
    [{ state: null, categorySlug: null }, 3],
  ])("orders matching scopes from exact to broad", (target, expected) => {
    expect(getSponsoredSpecificity(target, request)).toBe(expected);
  });

  it("rejects a non-matching state or category", () => {
    expect(getSponsoredSpecificity({ state: "Melaka", categorySlug: "food" }, request)).toBeNull();
    expect(getSponsoredSpecificity({ state: "Penang", categorySlug: "retail" }, request)).toBeNull();
  });

  it("normalizes state and category values before matching", () => {
    expect(getSponsoredSpecificity(
      { state: "  PENANG ", categorySlug: "Food" },
      request,
    )).toBe(0);
  });
});

describe("compareEligibleSponsoredPlacements", () => {
  const request = { state: "Penang", categorySlug: "food" };

  it("orders specificity before one-based position", () => {
    const exactAtFour = {
      id: "exact",
      state: "Penang",
      categorySlug: "food",
      priority: 4,
      startsAt: "2026-09-02T00:00:00.000Z",
    };
    const broadAtOne = {
      id: "broad",
      state: null,
      categorySlug: null,
      priority: 1,
      startsAt: "2026-09-01T00:00:00.000Z",
    };

    expect(compareEligibleSponsoredPlacements(exactAtFour, broadAtOne, request)).toBeLessThan(0);
  });

  it("orders Position 1 before Position 4 inside the same tier", () => {
    const atOne = {
      id: "one",
      state: null,
      categorySlug: null,
      priority: 1,
      startsAt: "2026-09-02T00:00:00.000Z",
    };
    const atFour = { ...atOne, id: "four", priority: 4 };

    expect(compareEligibleSponsoredPlacements(atOne, atFour, request)).toBeLessThan(0);
  });
});
