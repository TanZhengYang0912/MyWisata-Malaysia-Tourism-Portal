import { describe, expect, it } from "vitest";
import * as recommendationStatus from "@/lib/customer/recommendation-status";

const { getRecommendationStatus } = recommendationStatus;
const groupRecommendations = (recommendationStatus as { groupRecommendations?: <T extends { status: string }>(rows: T[]) => Record<string, T[]> }).groupRecommendations;

describe("getRecommendationStatus", () => {
  it("explains that approval still needs vendor linking before going live", () => {
    expect(getRecommendationStatus("approved").description).toContain("vendor");
    expect(getRecommendationStatus("approved").description).toContain("live");
  });

  it("identifies converted recommendations as commission-attributed", () => {
    expect(getRecommendationStatus("converted").label).toBe("Vendor joined");
    expect(getRecommendationStatus("converted").description).toContain("commission");
  });

  it("groups every current database status exactly once", () => {
    expect(groupRecommendations).toBeTypeOf("function");
    if (!groupRecommendations) return;
    const rows = ["pending", "changes_requested", "approved", "rejected", "invited", "claimed", "onboarding", "vendor_pending_review", "converted"].map((status) => ({ id: status, status }));
    const groups = groupRecommendations(rows);

    expect(groups.action_required.map((row) => row.status)).toEqual(["changes_requested"]);
    expect(groups.in_review.map((row) => row.status)).toEqual(["pending"]);
    expect(groups.decided.map((row) => row.status)).toEqual(["approved", "rejected", "invited", "claimed", "onboarding", "vendor_pending_review"]);
    expect(groups.converted.map((row) => row.status)).toEqual(["converted"]);
    expect(Object.values(groups).flat()).toHaveLength(rows.length);
    expect(new Set(Object.values(groups).flat().map((row) => row.id)).size).toBe(rows.length);
  });
});
