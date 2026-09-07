import { describe, expect, it } from "vitest";
import { postLoginDestination } from "@/lib/auth/post-login-destination";

describe("post-login destination", () => {
  it.each([null, "/admin/dashboard", "/admin/vendors", "/admin/wallet/settings", "/admin/refunds", "/admin/withdrawals-exports", "/admin/withdrawals/../users"])("lands wallet approvers in their fixed withdrawal queue for %s", (next) => {
    expect(postLoginDestination("approver", next)).toBe("/admin/withdrawals");
  });

  it("lands admins strictly on their fixed dashboard home page", () => {
    expect(postLoginDestination("super_admin", "/admin/vendors")).toBe("/admin/dashboard");
    expect(postLoginDestination("super_admin", "/customer/checkout")).toBe("/admin/dashboard");
    expect(postLoginDestination("admin", "/admin/catalogue")).toBe("/admin/dashboard");
    expect(postLoginDestination("admin", null)).toBe("/admin/dashboard");
  });

  it("lands Staff on its permission-aware home and preserves Staff invitation completion", () => {
    expect(postLoginDestination("staff", null)).toBe("/staff");
    expect(postLoginDestination("customer", "/staff-invitations/invite-token"))
      .toBe("/staff-invitations/invite-token");
  });

  it("lands customers strictly on their fixed /customer home page", () => {
    expect(postLoginDestination("customer", "/customer/vendor/vendor-1/outlet/outlet-1")).toBe("/customer");
    expect(postLoginDestination("customer", "/customer/checkout")).toBe("/customer");
    expect(postLoginDestination("customer", "/customer/explore")).toBe("/customer");
    expect(postLoginDestination("customer", null)).toBe("/customer");
  });

  it("lands vendors strictly on their fixed /vendor/dashboard home page", () => {
    expect(postLoginDestination("vendor_owner", "/vendor/outlets")).toBe("/vendor/dashboard");
    expect(postLoginDestination("vendor_owner", "/vendor/products")).toBe("/vendor/dashboard");
    expect(postLoginDestination("outlet_manager", "/vendor/bookings")).toBe("/vendor/dashboard");
    expect(postLoginDestination("outlet_manager", "/customer/explore")).toBe("/vendor/dashboard");
  });

  it("preserves only essential authentication actions", () => {
    expect(postLoginDestination("customer", "/reset-password")).toBe("/reset-password");
    expect(postLoginDestination("approver", "/reset-password")).toBe("/reset-password");
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
