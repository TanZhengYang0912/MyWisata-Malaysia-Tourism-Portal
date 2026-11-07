import { describe, expect, it } from "vitest";
import { postLoginDestination } from "@/lib/auth/post-login-destination";

describe("post-login destination", () => {
  it('requests native MFA before staff access, including when local Passkey enforcement is off', () => {
    expect(postLoginDestination('super_admin', null, false, false, true)).toBe('/auth/staff-mfa?next=%2Fadmin%2Fdashboard');
  });
  it('uses the original staff home only when the server explicitly projects local compatibility', () => {
    expect(postLoginDestination('super_admin', null, false, false)).toBe('/admin/dashboard');
    expect(postLoginDestination('super_admin', null, false, true)).toBe('/auth/staff-verification?next=%2Fadmin%2Fdashboard');
  });
  it.each([
    ["admin", "/admin/dashboard"],
    ["super_admin", "/admin/dashboard"],
    ["approver", "/admin/withdrawals"],
    ["staff", "/staff"],
  ] as const)("requires Passkey verification before the %s home", (role, destination) => {
    expect(postLoginDestination(role, null)).toBe(`/auth/staff-verification?next=${encodeURIComponent(destination)}`);
  });

  it.each([null, "/admin/dashboard", "/admin/vendors", "/admin/wallet/settings", "/admin/refunds", "/admin/withdrawals-exports", "/admin/withdrawals/../users"])("lands wallet approvers in their fixed withdrawal queue for %s", (next) => {
    expect(postLoginDestination("approver", next, true)).toBe("/admin/withdrawals");
  });

  it("lands admins strictly on their fixed dashboard home page", () => {
    expect(postLoginDestination("super_admin", "/admin/vendors", true)).toBe("/admin/dashboard");
    expect(postLoginDestination("super_admin", "/customer/checkout", true)).toBe("/admin/dashboard");
    expect(postLoginDestination("admin", "/admin/catalogue", true)).toBe("/admin/dashboard");
    expect(postLoginDestination("admin", null, true)).toBe("/admin/dashboard");
  });

  it("lands Staff on its permission-aware home and preserves Staff invitation completion", () => {
    expect(postLoginDestination("staff", null, true)).toBe("/staff");
    expect(postLoginDestination("customer", "/staff-invitations/invite-token"))
      .toBe("/staff-invitations/invite-token");
  });

  it("lands customers strictly on their fixed /customer home page", () => {
    expect(postLoginDestination("customer", "/customer/vendor/vendor-1/outlet/outlet-1")).toBe("/customer");
    expect(postLoginDestination("customer", "/customer/checkout")).toBe("/customer");
    expect(postLoginDestination("customer", "/customer/explore")).toBe("/customer");
    expect(postLoginDestination("customer", null)).toBe("/customer");
  });

  it("lands vendors strictly on their fixed Announcements home page", () => {
    expect(postLoginDestination("vendor_owner", "/vendor/outlets")).toBe("/vendor/announcements");
    expect(postLoginDestination("vendor_owner", "/vendor/products")).toBe("/vendor/announcements");
    expect(postLoginDestination("outlet_manager", "/vendor/bookings")).toBe("/vendor/announcements");
    expect(postLoginDestination("outlet_manager", "/customer/explore")).toBe("/vendor/announcements");
  });

  it("preserves only essential authentication actions", () => {
    expect(postLoginDestination("customer", "/reset-password")).toBe("/reset-password");
    expect(postLoginDestination("approver", "/reset-password", true)).toBe("/reset-password");
    expect(postLoginDestination("customer", "/outlet-manager-invitations/invite-token"))
      .toBe("/outlet-manager-invitations/invite-token");
  });

  it.each([
    "/customer/../admin/dashboard",
    "/%2e%2e/admin/dashboard",
    "/auth/callback?next=/admin/dashboard",
    "/api/private",
  ])("rejects a non-allowlisted or normalized role bypass: %s", (next) => {
    expect(postLoginDestination("customer", next)).toBe("/customer");
  });
});
