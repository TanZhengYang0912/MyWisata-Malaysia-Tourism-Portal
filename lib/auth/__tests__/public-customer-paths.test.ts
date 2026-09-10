import { describe, expect, it } from "vitest";
import { isPublicCustomerPath } from "@/lib/auth/public-customer-paths";

describe("isPublicCustomerPath", () => {
  it("allows customer browsing surfaces by default", () => {
    for (const path of [
      "/customer",
      "/customer/explore",
      "/customer/partners",
      "/customer/activity",
      "/customer/activity/product-1",
      "/customer/vendor/vendor-1/outlet/outlet-1",
      "/customer/recommendations",
      "/customer/wallet",
      "/customer/affiliate",
      "/customer/for-you",
      "/customer/outlet/outlet-1",
      "/customer/cart",
      "/customer/vouchers",
      "/customer/profile/customer-1",
      "/customer/map",
    ]) {
      expect(isPublicCustomerPath(path)).toBe(true);
    }
  });

  it("keeps account-owned routes and subtrees private", () => {
    for (const path of [
      "/customer/calendar",
      "/customer/kyc",
      "/customer/notifications",
      "/customer/phone",
      "/customer/preferences",
      "/customer/profile",
      "/customer/profile/register-vendor",
      "/customer/saved",
      "/customer/support",
      "/customer/trip",
      "/customer/verification",
      "/customer/wishlist",
      "/customer/bookings/booking-1",
      "/customer/chat",
      "/customer/chat/thread-1",
      "/customer/checkout",
      "/customer/checkout/simulator/session-1",
      "/customer/orders",
      "/customer/orders/order-1",
      "/customer/recommendations/rec-1",
      "/customer/support/ticket-1",
      "/customer/trip/trip-1",
      "/customer/wallet/withdrawals/withdrawal-1",
    ]) {
      expect(isPublicCustomerPath(path)).toBe(false);
    }
  });

  it("does not classify paths outside the customer route group as public", () => {
    expect(isPublicCustomerPath("/guest/explore")).toBe(false);
  });
});
