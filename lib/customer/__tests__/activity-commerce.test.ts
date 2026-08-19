import { describe, expect, it } from "vitest";
import { getEffectiveOutletCount, shouldRequireOutletSelection } from "@/lib/customer/activity-commerce";

describe("activity outlet commerce rules", () => {
  it("treats a direct product outlet as one effective outlet", () => {
    expect(getEffectiveOutletCount("outlet-direct", [])).toBe(1);
  });

  it("deduplicates the representative outlet from a single active offer", () => {
    expect(getEffectiveOutletCount("outlet-single", [{ outletId: "outlet-single" }])).toBe(1);
  });

  it("counts multiple offered outlets without duplicating the representative one", () => {
    expect(getEffectiveOutletCount("outlet-a", [{ outletId: "outlet-a" }, { outletId: "outlet-b" }])).toBe(2);
  });

  it("requires selection only for vendor discovery with multiple outlets", () => {
    expect(shouldRequireOutletSelection("vendor", 1)).toBe(false);
    expect(shouldRequireOutletSelection("vendor", 2)).toBe(true);
    expect(shouldRequireOutletSelection(null, 2)).toBe(false);
  });
});
