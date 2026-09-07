export const STAFF_PERMISSION_KEYS = [
  "admin.kyc.review",
  "admin.withdrawal.approve",
  "admin.vendor.manage",
  "admin.map_campaign.manage",
] as const;

export type StaffPermissionKey = typeof STAFF_PERMISSION_KEYS[number];

export function isStaffPermissionKey(value: string): value is StaffPermissionKey {
  return (STAFF_PERMISSION_KEYS as readonly string[]).includes(value);
}
