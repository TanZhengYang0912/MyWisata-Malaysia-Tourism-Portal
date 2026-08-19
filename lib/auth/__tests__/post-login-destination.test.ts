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

  it("keeps vendor routes for vendor roles", () => {
    expect(postLoginDestination("vendor_owner", "/vendor/outlets"))
      .toBe("/vendor/outlets");
  });
});
