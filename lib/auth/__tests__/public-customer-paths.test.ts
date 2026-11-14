import { describe, expect, it } from "vitest";
import { isPublicCustomerPath } from "@/lib/auth/public-customer-paths";

describe("isPublicCustomerPath", () => {
  it("allows browse, vendor, listing, recommendation, and wallet surfaces", () => {
    for (const path of [
      "/customer",
      "/customer/explore",
      "/customer/partners",
      "/customer/vendors",
      "/customer/vendors/vendor-1",
      "/customer/products/product-1",
      "/customer/outlets/outlet-1",
      "/customer/activity/product-1",
      "/customer/vendor/vendor-1/outlet/outlet-1",
      "/customer/recommendations",
      "/customer/wallet",
      "/customer/affiliate",
      "/customer/for-you",
      "/customer/outlet/outlet-1",
      "/customer/events",
      "/customer/events/real-campaign",
    ]) {
      expect(isPublicCustomerPath(path)).toBe(true);
    }
  });

  it("exposes guest commerce without exposing history or malformed order paths", () => {
    for (const path of ["/customer/cart", "/customer/checkout", "/customer/checkout/success", "/customer/orders/access", "/customer/orders/1d4057cf-c821-4b05-a454-61dbdc42d32c", "/customer/checkout/simulator/1d4057cf-c821-4b05-a454-61dbdc42d32c"]) expect(isPublicCustomerPath(path)).toBe(true);
    for (const path of ["/customer/orders", "/customer/orders/order-1", "/customer/orders/access/extra", "/customer/checkout/extra"]) expect(isPublicCustomerPath(path)).toBe(false);
  });

  it("does not make account-owned routes public", () => {
    for (const path of [
      "/customer/profile",
      "/customer/notifications",
      "/customer/recommendations/rec-1",
      "/customer/wallet/withdrawals/withdrawal-1",
    ]) {
      expect(isPublicCustomerPath(path)).toBe(false);
    }
  });
});
