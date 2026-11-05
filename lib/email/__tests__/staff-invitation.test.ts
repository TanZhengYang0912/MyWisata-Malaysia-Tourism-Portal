import { describe, expect, it } from "vitest";
import { renderStaffInvitationEmail } from "@/lib/email/staff-invitation";

describe("staff invitation email", () => {
  it.each([
    ["en", "Review KYC applications", "Review and accept invitation", "Hello"],
    ["ms", "Semak permohonan KYC", "Semak dan terima jemputan", "Salam"],
    ["zh-CN", "审核 KYC 申请", "查看并接受邀请", "您好"],
  ] as const)("renders courteous localized recipient copy for %s", (locale, permissionLabel, actionLabel, greeting) => {
    const result = renderStaffInvitationEmail({
      locale,
      roleName: "Reviewer <script>alert(1)</script>",
      permissionKeys: ["admin.kyc.review"],
      invitationUrl: "https://mylawatan.test/staff-invitations/secret",
      expiresAt: "2026-09-13T04:30:00.000Z",
    });

    expect(result.html).toContain("Reviewer &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result.text).toContain(permissionLabel);
    expect(result.text).toContain(actionLabel);
    expect(result.text).toContain(greeting);
    expect(result.text).toContain("2026");
    expect(result.text).toContain("12:30");
  });

  it("uses professional Chinese wording for an employee invitation", () => {
    const result = renderStaffInvitationEmail({
      locale: "zh-CN",
      roleName: "KYC Approval",
      permissionKeys: ["admin.kyc.review"],
      invitationUrl: "https://mywisata.test/staff-invitations/secret",
      expiresAt: "2026-09-13T04:30:00.000Z",
    });

    expect(result.text).toContain("您受邀加入 MYLawatan 团队");
    expect(result.text).toContain("确认无误后");
    expect(result.text).not.toContain("尊贵的用户");
  });

  it("does not expose governance notes, UUIDs, or technical permission keys", () => {
    const result = renderStaffInvitationEmail({
      locale: "en",
      roleName: "Wallet Reviewer",
      permissionKeys: ["admin.withdrawal.approve", "admin.vendor.manage"],
      invitationUrl: "https://mylawatan.test/staff-invitations/secret",
      expiresAt: "2026-09-13T04:30:00.000Z",
    });
    const content = `${result.subject}\n${result.text}\n${result.html}`;

    expect(content).toContain("Approve wallet withdrawal requests");
    expect(content).toContain("Manage vendors");
    expect(content).not.toContain("admin.withdrawal.approve");
    expect(content).not.toContain("governance");
    expect(content).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  });
});
