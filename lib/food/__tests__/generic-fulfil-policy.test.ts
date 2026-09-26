import { describe, expect, it } from "vitest";
import { canUseGenericFoodFulfilment } from "@/lib/food/generic-fulfil-policy";

describe("generic vendor fulfilment policy", () => {
  it("keeps food items on the signed outlet QR path until the scanner records arrival", () => {
    expect(canUseGenericFoodFulfilment({ categorySlug: "food", scannedAt: null })).toBe(false);
    expect(canUseGenericFoodFulfilment({ categorySlug: "food", scannedAt: "2026-09-25T00:00:00Z" })).toBe(true);
  });

  it("does not change generic fulfilment for non-food items", () => {
    expect(canUseGenericFoodFulfilment({ categorySlug: "ticket", scannedAt: null })).toBe(true);
    expect(canUseGenericFoodFulfilment({ categorySlug: null, scannedAt: null })).toBe(true);
  });
});
