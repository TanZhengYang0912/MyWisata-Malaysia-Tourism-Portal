import type { StaffPermissionKey } from "@/lib/staff-permissions/types";

export type StaffDestination = {
  permission: StaffPermissionKey;
  href: string;
  labelKey: string;
  descriptionKey: string;
};

const DESTINATIONS: Record<StaffPermissionKey, StaffDestination> = {
  "admin.kyc.review": {
    permission: "admin.kyc.review",
    href: "/admin/kyc",
    labelKey: "staffHome.work.kyc.title",
    descriptionKey: "staffHome.work.kyc.description",
  },
  "admin.withdrawal.approve": {
    permission: "admin.withdrawal.approve",
    href: "/admin/withdrawals",
    labelKey: "staffHome.work.withdrawals.title",
    descriptionKey: "staffHome.work.withdrawals.description",
  },
  "admin.vendor.manage": {
    permission: "admin.vendor.manage",
    href: "/admin/vendors",
    labelKey: "staffHome.work.vendors.title",
    descriptionKey: "staffHome.work.vendors.description",
  },
  "admin.map_campaign.manage": {
    permission: "admin.map_campaign.manage",
    href: "/admin/sponsored-placements",
    labelKey: "staffHome.work.campaigns.title",
    descriptionKey: "staffHome.work.campaigns.description",
  },
};

export function staffDestinations(permissionKeys: readonly StaffPermissionKey[]): StaffDestination[] {
  const allowed = new Set(permissionKeys);
  return Object.values(DESTINATIONS).filter((destination) => allowed.has(destination.permission));
}
