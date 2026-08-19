import { describe, expect, it } from "vitest";
import {
  ACCOUNT_MENU_GROUPS,
  CUSTOMER_NAV,
  getCustomerDisplayName,
  getAllAccountRoutes,
  isCustomerNavActive,
} from "@/lib/customer/header-navigation";

describe("customer header navigation", () => {
  it("keeps every customer destination discoverable", () => {
    expect(CUSTOMER_NAV.map((item) => item.href)).toEqual([
      "/customer",
      "/customer/explore",
      "/customer/partners",
      "/customer/trip",
      "/customer/chat",
      "/customer/activity?tab=itinerary",
      "/customer/saved",
    ]);
    expect(CUSTOMER_NAV[0]).toMatchObject({ href: "/customer", label: "Home" });
    expect(CUSTOMER_NAV.some((item) => item.href === "/customer/for-you")).toBe(false);
    expect(CUSTOMER_NAV.some((item) => item.href === "/customer/chat")).toBe(true);
    expect(CUSTOMER_NAV.some((item) => item.href === "/customer/map")).toBe(false);

    expect(getAllAccountRoutes()).toEqual([
      "/customer/profile",
      "/customer/notifications",
      "/customer/preferences",
      "/customer/vouchers",
      "/customer/wallet",
      "/customer/kyc",
      "/customer/support",
      "/customer/affiliate",
      "/customer/profile/register-vendor",
      "/customer/recommendations",
    ]);

    expect(ACCOUNT_MENU_GROUPS.map((group) => group.label)).toEqual([
      "Account",
      "Payments & verification",
      "Help",
      "More",
    ]);
  });

  it("uses a profile name and falls back to an email local part", () => {
    expect(getCustomerDisplayName({ name: "Aisha Lim", email: "aisha@example.com" })).toBe("Aisha Lim");
    expect(getCustomerDisplayName({ name: "mock_cf_7@example.com", email: "mock_cf_7@example.com" })).toBe("mock_cf_7");
    expect(getCustomerDisplayName({ name: "", email: "" })).toBe("Account");
  });

  it("matches navigation items by their pathname even when a link has a query", () => {
    expect(isCustomerNavActive("/customer/activity", "/customer/activity?tab=itinerary")).toBe(true);
    expect(isCustomerNavActive("/customer/activity/details", "/customer/activity?tab=itinerary")).toBe(true);
    expect(isCustomerNavActive("/customer/explore", "/customer/for-you")).toBe(false);
  });

  it("activates Home only on exactly /customer, not on sub-routes", () => {
    expect(isCustomerNavActive("/customer", "/customer")).toBe(true);
    expect(isCustomerNavActive("/customer/explore", "/customer")).toBe(false);
    expect(isCustomerNavActive("/customer/partners", "/customer")).toBe(false);
    expect(isCustomerNavActive("/customer/trip", "/customer")).toBe(false);
  });
});
