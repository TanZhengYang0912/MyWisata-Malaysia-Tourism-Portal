import { describe, expect, it } from "vitest";
import {
  GUEST_EXPLORE_PATH,
  guestLoginHref,
  guestProtectedCustomerPath,
  guestPathToCustomerPath,
  guestVendorHref,
  postLoginPath,
} from "@/lib/auth/guest-mode";

describe("Guest Mode navigation", () => {
  it("identifies only private same-origin customer links while keeping the return query and hash", () => {
    expect(typeof guestProtectedCustomerPath).toBe("function");
    const base = "https://mywisata.test/customer/explore";
    expect(guestProtectedCustomerPath("/customer/profile?tab=account#preferences", base)).toBe("/customer/profile?tab=account#preferences");
    expect(guestProtectedCustomerPath("/customer/cart", base)).toBe("/customer/cart");
    expect(guestProtectedCustomerPath("https://mywisata.test/customer/chat", base)).toBe("/customer/chat");
    expect(guestProtectedCustomerPath("/customer/wallet/withdrawals/123", base)).toBe("/customer/wallet/withdrawals/123");
  });

  it("leaves public browsing, explicit authentication and external navigation alone", () => {
    expect(typeof guestProtectedCustomerPath).toBe("function");
    for (const href of ["/customer", "/customer/explore", "/customer/activity/123", "/customer/wallet", "/customer/for-you", "/login?next=%2Fcustomer%2Fcart&mode=signup", "https://other.test/customer/cart", "//other.test/customer/cart", "mailto:help@example.com", "#listings", "http://[", "/customer-service"]) {
      expect(guestProtectedCustomerPath(href, "https://mywisata.test/customer/explore")).toBeNull();
    }
  });

  it("uses a dedicated public explore route", () => {
    expect(GUEST_EXPLORE_PATH).toBe("/guest/explore");
  });

  it("encodes a local listing return path", () => {
    expect(guestLoginHref("/customer/activity/a/b?slot=1"))
      .toBe("/login?next=%2Fcustomer%2Factivity%2Fa%2Fb%3Fslot%3D1");
  });

  it("rejects an external return path", () => {
    expect(guestLoginHref("https://untrusted.example"))
      .toBe("/login?next=%2Fguest%2Fexplore");
  });

  it("keeps vendor links in the guest route group", () => {
    expect(guestVendorHref("vendor/a")).toBe("/guest/vendor/vendor%2Fa");
  });

  it("uses only a safe local return path after sign-in", () => {
    expect(postLoginPath("/customer/activity/product-1")).toBe("/customer/activity/product-1");
    expect(postLoginPath("//untrusted.example")).toBeNull();
    expect(postLoginPath("/\\untrusted.example")).toBeNull();
  });

  describe("guestPathToCustomerPath — the header Sign In link's return path", () => {
    it("maps every real /guest route to its 1:1 /customer equivalent", () => {
      expect(guestPathToCustomerPath("/guest/activity/abc-123")).toBe("/customer/activity/abc-123");
      expect(guestPathToCustomerPath("/guest/vendor/xyz-789")).toBe("/customer/vendor/xyz-789");
      expect(guestPathToCustomerPath("/guest/explore")).toBe("/customer/explore");
    });

    it("falls back to /customer/explore for a path that isn't under /guest", () => {
      expect(guestPathToCustomerPath("/login")).toBe("/customer/explore");
      expect(guestPathToCustomerPath("/")).toBe("/customer/explore");
    });

    it("composes with guestLoginHref to build a working return-to-page login link", () => {
      expect(guestLoginHref(guestPathToCustomerPath("/guest/activity/abc-123")))
        .toBe("/login?next=%2Fcustomer%2Factivity%2Fabc-123");
    });
  });
});
