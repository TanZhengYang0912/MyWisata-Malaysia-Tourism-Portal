import { describe, expect, it } from "vitest";
import { buildActivityPath, buildProductPath, getVendorHref, getCustomerReturnPath } from "@/lib/customer/navigation-context";

describe("customer navigation context", () => {
  it('builds canonical product and vendor paths with encoded context', () => {
    const url = new URL(buildProductPath('商品 1', '/customer/explore?q=茶#map', 'o1', 'home'), 'https://example.test');
    expect(url.pathname).toBe('/customer/products/%E5%95%86%E5%93%81%201');
    expect(url.searchParams.get('returnTo')).toBe('/customer/explore?q=茶#map');
    expect(url.searchParams.get('outletId')).toBe('o1');
    expect(getVendorHref('vendor 1')).toBe('/customer/vendors/vendor%201');
  });
  it("keeps safe customer return paths including filters", () => {
    expect(getCustomerReturnPath("/customer/search?q=heritage&category=walk")).toBe("/customer/search?q=heritage&category=walk");
  });

  it("rejects external and protocol-relative return paths", () => {
    expect(getCustomerReturnPath("https://example.com/phishing")).toBe("/customer");
    expect(getCustomerReturnPath("//example.com/phishing")).toBe("/customer");
    expect(getCustomerReturnPath("/vendor/dashboard")).toBe("/customer");
  });

  it("builds an activity link without losing the return context", () => {
    expect(buildActivityPath("activity-1", "/customer/for-you")).toBe("/customer/products/activity-1?returnTo=%2Fcustomer%2Ffor-you");
    expect(buildActivityPath("activity-1")).toBe("/customer/products/activity-1");
  });

  it("automatically preserves vendor scope when navigating from vendor context", () => {
    expect(buildActivityPath("activity-1", "/customer/vendor/v123", "o456")).toBe(
      "/customer/products/activity-1?source=vendor&outletId=o456&returnTo=%2Fcustomer%2Fvendor%2Fv123",
    );
    expect(buildActivityPath("activity-1", "/customer/explore", "o456", "vendor")).toBe(
      "/customer/products/activity-1?source=vendor&outletId=o456&returnTo=%2Fcustomer%2Fexplore",
    );
  });
});
