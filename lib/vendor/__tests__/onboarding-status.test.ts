import { describe, expect, it } from "vitest";
import { getVendorOnboardingStatus } from "@/lib/vendor/onboarding-status";

describe("getVendorOnboardingStatus", () => {
  it.each([
    ["pending", "Pending admin review"],
    ["approved", "Approved"],
    ["rejected", "Needs changes"],
    ["suspended", "Suspended"],
  ] as const)("maps %s to a useful status label", (status, label) => {
    expect(getVendorOnboardingStatus(status).label).toBe(label);
  });
});
