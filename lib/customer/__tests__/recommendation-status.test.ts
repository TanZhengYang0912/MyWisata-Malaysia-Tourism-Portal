import { describe, expect, it } from "vitest";
import { getRecommendationStatus } from "@/lib/customer/recommendation-status";

describe("getRecommendationStatus", () => {
  it("explains that approval still needs vendor linking before going live", () => {
    expect(getRecommendationStatus("approved").description).toContain("vendor");
    expect(getRecommendationStatus("approved").description).toContain("live");
  });

  it("identifies converted recommendations as commission-attributed", () => {
    expect(getRecommendationStatus("converted").label).toBe("Vendor joined");
    expect(getRecommendationStatus("converted").description).toContain("commission");
  });
});
