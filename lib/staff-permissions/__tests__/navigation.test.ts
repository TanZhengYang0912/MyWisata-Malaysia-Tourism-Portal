import { describe, expect, it } from "vitest";
import { staffDestinations } from "@/lib/staff-permissions/navigation";

describe("Staff permission navigation", () => {
  it("maps only the four supported permissions to their work areas", () => {
    expect(staffDestinations([
      "admin.vendor.manage",
      "admin.kyc.review",
      "admin.vendor.manage",
    ])).toEqual([
      expect.objectContaining({ permission: "admin.kyc.review", href: "/admin/kyc" }),
      expect.objectContaining({ permission: "admin.vendor.manage", href: "/admin/vendors" }),
    ]);
  });

  it("returns no work areas for a Staff identity with zero assignments", () => {
    expect(staffDestinations([])).toEqual([]);
  });
});
