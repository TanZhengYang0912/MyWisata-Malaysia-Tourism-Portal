import { escapeHtml, type RenderedEmail } from "@/lib/email/templates";
import type { StaffInvitationEmailInput, StaffInvitationLocale } from "@/lib/staff-invitations/types";
import type { StaffPermissionKey } from "@/lib/staff-permissions/types";

const COPY: Record<StaffInvitationLocale, {
  subject: string;
  heading: string;
  introduction: string;
  role: string;
  permissions: string;
  expires: string;
  action: string;
  ignore: string;
}> = {
  en: {
    subject: "Your MyLawatan staff invitation",
    heading: "You are invited to join MyLawatan staff",
    introduction: "Review the role and permissions below before accepting.",
    role: "Role",
    permissions: "Permissions",
    expires: "This invitation expires",
    action: "Accept staff invitation",
    ignore: "If you were not expecting this invitation, you can ignore this email.",
  },
  ms: {
    subject: "Jemputan kakitangan MyLawatan anda",
    heading: "Anda dijemput menyertai kakitangan MyLawatan",
    introduction: "Semak peranan dan kebenaran di bawah sebelum menerima.",
    role: "Peranan",
    permissions: "Kebenaran",
    expires: "Jemputan ini tamat tempoh",
    action: "Terima jemputan kakitangan",
    ignore: "Jika anda tidak menjangkakan jemputan ini, anda boleh mengabaikan e-mel ini.",
  },
  "zh-CN": {
    subject: "您的 MyLawatan 员工邀请",
    heading: "您受邀加入 MyLawatan 员工团队",
    introduction: "接受前，请先检查以下角色和权限。",
    role: "角色",
    permissions: "权限",
    expires: "邀请有效至",
    action: "接受员工邀请",
    ignore: "如果您没有预期收到此邀请，可以忽略这封邮件。",
  },
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

function formatExpiry(expiresAt: string, locale: StaffInvitationLocale): string {
  const localeName = locale === "zh-CN" ? "zh-CN" : locale === "ms" ? "ms-MY" : "en-MY";
  return new Intl.DateTimeFormat(localeName, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kuala_Lumpur",
  }).format(new Date(expiresAt));
}

export function renderStaffInvitationEmail(input: StaffInvitationEmailInput): RenderedEmail {
  const copy = COPY[input.locale];
  const roleName = input.roleName.trim();
  const permissionLabels = input.permissionKeys.map((key) => staffPermissionLabel(input.locale, key));
  const expiry = formatExpiry(input.expiresAt, input.locale);
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
  const html = `<!doctype html><html lang="${escapeHtml(input.locale)}"><body style="font-family:Arial,sans-serif;color:#172033;line-height:1.5"><h1>${escapeHtml(copy.heading)}</h1><p>${escapeHtml(copy.introduction)}</p><p><strong>${escapeHtml(copy.role)}:</strong> ${escapeHtml(roleName)}</p><p><strong>${escapeHtml(copy.permissions)}:</strong></p><ul>${permissionLabels.map((label) => `<li>${escapeHtml(label)}</li>`).join("")}</ul><p><strong>${escapeHtml(copy.expires)}:</strong> ${escapeHtml(expiry)}</p><p><a href="${safeUrl}" rel="noreferrer" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#2436c7;color:#fff;text-decoration:none">${escapeHtml(copy.action)}</a></p><p>${escapeHtml(copy.ignore)}</p></body></html>`;

  return { subject: copy.subject, html, text };
}
