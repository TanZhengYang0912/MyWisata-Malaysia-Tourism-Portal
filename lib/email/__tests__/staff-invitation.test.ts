import { describe, expect, it } from "vitest";
import { renderStaffInvitationEmail } from "@/lib/email/staff-invitation";

describe("staff invitation email", () => {
  it.each([
    ["en", "Review KYC applications", "Accept staff invitation"],
    ["ms", "Semak permohonan KYC", "Terima jemputan kakitangan"],
    ["zh-CN", "审核 KYC 申请", "接受员工邀请"],
  ] as const)("renders safe localized recipient copy for %s", (locale, permissionLabel, actionLabel) => {
    const result = renderStaffInvitationEmail({
      locale,
      roleName: "Reviewer <script>alert(1)</script>",
      permissionKeys: ["admin.kyc.review"],
      invitationUrl: "https://mywisata.test/staff-invitations/secret",
      expiresAt: "2026-09-13T04:30:00.000Z",
    });

    expect(result.html).toContain("Reviewer &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result.text).toContain(permissionLabel);
    expect(result.text).toContain(actionLabel);
    expect(result.text).toContain("2026");
    expect(result.text).toContain("12:30");
  });

  it("does not expose governance notes, UUIDs, or technical permission keys", () => {
    const result = renderStaffInvitationEmail({
      locale: "en",
      roleName: "Wallet Reviewer",
      permissionKeys: ["admin.withdrawal.approve", "admin.vendor.manage"],
      invitationUrl: "https://mywisata.test/staff-invitations/secret",
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
