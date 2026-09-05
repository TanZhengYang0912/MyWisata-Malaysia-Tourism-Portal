import { describe, expect, it } from "vitest";

import {
  isStaffPermissionKey,
  STAFF_PERMISSION_KEYS,
  type StaffPermissionKey,
} from "@/lib/staff-permissions/types";

describe("staff permission type contract", () => {
  it("keeps the database permission catalogue stable", () => {
    expect(STAFF_PERMISSION_KEYS).toEqual([
      "admin.kyc.review",
      "admin.withdrawal.approve",
      "admin.vendor.manage",
      "admin.map_campaign.manage",
    ]);
  });

  it("recognizes only permission keys from the catalogue", () => {
    expect(STAFF_PERMISSION_KEYS.every(isStaffPermissionKey)).toBe(true);
    expect(isStaffPermissionKey("admin.unknown"))
      .toBe(false);
  });

  it("exposes a literal union for callers", () => {
    const permission: StaffPermissionKey = "admin.vendor.manage";
    expect(permission).toBe("admin.vendor.manage");

    // @ts-expect-error Staff APIs must reject unregistered permission keys.
    const invalidPermission: StaffPermissionKey = "admin.unknown";
    expect(invalidPermission).toBe("admin.unknown");
  });
});
