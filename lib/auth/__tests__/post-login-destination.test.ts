import { describe, expect, it } from "vitest";
import { postLoginDestination } from "@/lib/auth/post-login-destination";

describe("post-login destination", () => {
  it("keeps customers on the requested customer path", () => {
    expect(postLoginDestination("customer", "/customer/vendor/vendor-1/outlet/outlet-1"))
      .toBe("/customer/vendor/vendor-1/outlet/outlet-1");
  });

  it("does not send outlet managers into customer routes", () => {
    expect(postLoginDestination("outlet_manager", "/customer/vendor/vendor-1/outlet/outlet-1"))
      .toBe("/vendor/dashboard");
  });

  it("does not send customers into admin routes", () => {
    expect(postLoginDestination("customer", "/admin/dashboard"))
      .toBe("/customer");
  });

  it("keeps vendor routes for vendor roles", () => {
    expect(postLoginDestination("vendor_owner", "/vendor/outlets"))
      .toBe("/vendor/outlets");
  });

  it("keeps safe role-neutral paths needed to finish authentication", () => {
    expect(postLoginDestination("customer", "/reset-password"))
      .toBe("/reset-password");
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
