import { describe, expect, it } from "vitest";
import * as commerce from "@/lib/customer/activity-commerce";
import { getEffectiveOutletCount } from "@/lib/customer/activity-commerce";

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

  it("has no separate outlet-selection step: every entry gets a default purchase outlet", () => {
    expect(Object.keys(commerce)).not.toContain("shouldRequireOutletSelection");
  });
});
