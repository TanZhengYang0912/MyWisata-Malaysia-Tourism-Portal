import { escapeHtml, type RenderedEmail } from "@/lib/email/templates";
import type { StaffInvitationEmailInput, StaffInvitationLocale } from "@/lib/staff-invitations/types";
import type { StaffPermissionKey } from "@/lib/staff-permissions/types";

// The invitation email is English; PERMISSION_LABELS below also serve the acceptance page in its own language.
const COPY = {
  subject: "Invitation to join the MYLawatan team",
  heading: "You are invited to join the MYLawatan team",
  introduction: "Hello, please review the role, permissions, and expiry below. If everything looks right, use the button to review and accept your invitation.",
  role: "Role",
  permissions: "Permissions",
  expires: "This invitation expires",
  action: "Review and accept invitation",
  ignore: "If you were not expecting this invitation, please do not accept it. You may ignore this email or contact a MYLawatan administrator through an official channel.",
};

const PERMISSION_LABELS: Record<StaffInvitationLocale, Record<StaffPermissionKey, string>> = {
  en: {
    "admin.kyc.review": "Review KYC applications",
    "admin.withdrawal.approve": "Approve wallet withdrawal requests",
    "admin.vendor.manage": "Manage vendors",
    "admin.map_campaign.manage": "Manage sponsored map campaigns",
  },
  ms: {
    "admin.kyc.review": "Semak permohonan KYC",
    "admin.withdrawal.approve": "Luluskan permohonan pengeluaran dompet",
    "admin.vendor.manage": "Urus peniaga",
    "admin.map_campaign.manage": "Urus kempen peta tajaan",
  },
  "zh-CN": {
    "admin.kyc.review": "审核 KYC 申请",
    "admin.withdrawal.approve": "审批钱包提款申请",
    "admin.vendor.manage": "管理商家",
    "admin.map_campaign.manage": "管理赞助地图活动",
  },
};

export function staffPermissionLabel(locale: StaffInvitationLocale, key: StaffPermissionKey): string {
  return PERMISSION_LABELS[locale][key];
}

function formatExpiry(expiresAt: string): string {
  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(expiresAt));
}

export function renderStaffInvitationEmail(input: StaffInvitationEmailInput): RenderedEmail {
  const copy = COPY;
  const roleName = input.roleName.trim();
  const permissionLabels = input.permissionKeys.map((key) => staffPermissionLabel("en", key));
  const expiry = formatExpiry(input.expiresAt);
  const text = [
    copy.heading,
    copy.introduction,
    `${copy.role}: ${roleName}`,
    `${copy.permissions}:`,
    ...permissionLabels.map((label) => `- ${label}`),
    `${copy.expires}: ${expiry}`,
    `${copy.action}: ${input.invitationUrl}`,
    copy.ignore,
  ].join("\n");

  const safeUrl = escapeHtml(input.invitationUrl);
  const html = `<!doctype html><html lang="en"><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><h1>${escapeHtml(copy.heading)}</h1><p>${escapeHtml(copy.introduction)}</p><p><strong>${escapeHtml(copy.role)}:</strong> ${escapeHtml(roleName)}</p><p><strong>${escapeHtml(copy.permissions)}:</strong></p><ul>${permissionLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul><p><strong>${escapeHtml(copy.expires)}:</strong> ${escapeHtml(expiry)}</p><p><a href="${safeUrl}" rel="noreferrer" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2436c7;color:#fff;text-decoration:none">${escapeHtml(copy.action)}</a></p><p>${escapeHtml(copy.ignore)}</p></body></html>`;

  return { subject: copy.subject, html, text };
}
