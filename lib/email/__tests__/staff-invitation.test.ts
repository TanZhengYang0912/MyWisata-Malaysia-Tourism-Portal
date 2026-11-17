import { describe, expect, it } from "vitest";
import { renderStaffInvitationEmail } from "@/lib/email/staff-invitation";

describe("staff invitation email", () => {
  it("renders courteous English copy with escaped role names", () => {
    const result = renderStaffInvitationEmail({
      roleName: "Reviewer <script>alert(1)</script>",
      permissionKeys: ["admin.kyc.review"],
      invitationUrl: "https://mylawatan.test/staff-invitations/secret",
      expiresAt: "2026-09-13T04:30:00.000Z",
    });

    expect(result.html).toContain('lang="en"');
    expect(result.html).toContain("Reviewer &lt;script&gt;alert(1)&lt;/script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result.text).toContain("Review KYC applications");
    expect(result.text).toContain("Review and accept invitation");
    expect(result.text).toContain("You are invited to join the MYLawatan team");
    expect(result.text).toContain("2026");
    expect(result.text).toContain("12:30");
  });

  it("does not expose governance notes, UUIDs, or technical permission keys", () => {
    const result = renderStaffInvitationEmail({
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
