import { describe, expect, it } from "vitest";
import { isPublicCustomerPath } from "@/lib/auth/public-customer-paths";

describe("isPublicCustomerPath", () => {
  it("allows browse, vendor, listing, recommendation, and wallet surfaces", () => {
    for (const path of [
      "/customer/explore",
      "/customer/partners",
      "/customer/activity/product-1",
      "/customer/vendor/vendor-1/outlet/outlet-1",
      "/customer/recommendations",
      "/customer/wallet",
      "/customer/affiliate",
      "/customer/for-you",
      "/customer/outlet/outlet-1",
    ]) {
      expect(isPublicCustomerPath(path)).toBe(true);
    }
  });

  it("does not make account-owned routes public", () => {
    for (const path of [
      "/customer/cart",
      "/customer/checkout",
      "/customer/profile",
      "/customer/notifications",
      "/customer/recommendations/rec-1",
      "/customer/wallet/withdrawals/withdrawal-1",
    ]) {
      expect(isPublicCustomerPath(path)).toBe(false);
    }
  });
});
