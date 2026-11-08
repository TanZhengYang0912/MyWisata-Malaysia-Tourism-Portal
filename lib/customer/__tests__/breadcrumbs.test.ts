import { describe, expect, it } from "vitest";
import { getCustomerBreadcrumbModel, getProductBreadcrumbAncestors } from "@/lib/customer/breadcrumbs";

describe("customer breadcrumb routes", () => {
  it('always uses the commercial vendor and selected outlet ancestry', () => {
    const outlet = { vendorId: 'v', vendorName: 'Vendor', outletId: 'o', outletName: 'Outlet' };
    expect(getProductBreadcrumbAncestors(outlet, false).map((item) => item.href)).toEqual(['/customer/vendors', '/customer/vendors/v', '/customer/outlets/o']);
    expect(getProductBreadcrumbAncestors(outlet, true).map((item) => item.href)).toEqual(['/customer/explore?tab=experiences']);
  });
  it('drops the outlet crumb when it only repeats the vendor name', () => {
    const outlet = { vendorId: 'v', vendorName: 'Yati Ayam Percik', outletId: 'o', outletName: 'Yati Ayam Percik' };
    expect(getProductBreadcrumbAncestors(outlet, false).map((item) => item.href)).toEqual(['/customer/vendors', '/customer/vendors/v']);
  });
  it("separates automatic, page-owned and hidden routes", () => {
    expect(getCustomerBreadcrumbModel("/customer/explore").mode).toBe("automatic");
    expect(getCustomerBreadcrumbModel("/customer/vendor/v1").mode).toBe("page-owned");
    expect(getCustomerBreadcrumbModel("/customer/checkout").mode).toBe("hidden");
    expect(getCustomerBreadcrumbModel("/customer/trip/t1").mode).toBe("hidden");
    expect(getCustomerBreadcrumbModel("/customer/unknown").mode).toBe("hidden");
  });
  it("recognizes order access before generic order details", () => {
    expect(getCustomerBreadcrumbModel("/customer/orders/access").items.at(-1)?.labelKey).not.toBe("ui.breadcrumbs.orderDetails");
    expect(getCustomerBreadcrumbModel("/customer/orders/a-uuid").items.at(-1)?.labelKey).toBe("ui.breadcrumbs.orderDetails");
  });
});
