import type { StaffPermissionKey } from "@/lib/staff-permissions/types";

export type StaffInvitationLocale = "en" | "ms" | "zh-CN";

export type StaffInvitationEmailInput = {
  locale: StaffInvitationLocale;
  roleName: string;
  permissionKeys: StaffPermissionKey[];
  invitationUrl: string;
  expiresAt: string;
};

export type StaffInvitationSummary = {
  id: string;
  invitedEmail: string;
  roleName: string;
  permissionKeys: StaffPermissionKey[];
  status: "pending" | "accepted" | "revoked";
  deliveryStatus: "pending" | "sending" | "sent" | "failed";
  sendAttemptCount: number;
  expiresAt: string;
};
