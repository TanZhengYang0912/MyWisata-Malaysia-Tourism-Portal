import { describe, expect, it } from "vitest";
import {
  GUEST_EXPLORE_PATH,
  guestLoginHref,
  guestVendorHref,
  postLoginDestination,
  postLoginPath,
} from "@/lib/auth/guest-mode";

describe("Guest Mode navigation", () => {
  it("uses the shared customer experience as the public entry", () => {
    expect(GUEST_EXPLORE_PATH).toBe("/customer");
  });

  it("encodes a local listing return path", () => {
    expect(guestLoginHref("/customer/activity/a/b?slot=1"))
      .toBe("/login?next=%2Fcustomer%2Factivity%2Fa%2Fb%3Fslot%3D1");
  });

  it("rejects an external return path", () => {
    expect(guestLoginHref("https://untrusted.example"))
      .toBe("/login?next=%2Fcustomer");
  });

  it("uses the canonical customer vendor route", () => {
    expect(guestVendorHref("vendor/a")).toBe("/customer/vendor/vendor%2Fa");
  });

  it("uses only a safe local return path after sign-in", () => {
    expect(postLoginPath("/customer/activity/product-1")).toBe("/customer/activity/product-1");
    expect(postLoginPath("//untrusted.example")).toBeNull();
    expect(postLoginPath("/\\untrusted.example")).toBeNull();
  });

  it("rejects a stale return path that belongs to another account role", () => {
    expect(postLoginPath("/admin/dashboard", "outlet_manager")).toBeNull();
    expect(postLoginPath("/admin/dashboard", "vendor_owner")).toBeNull();
    expect(postLoginPath("/admin/dashboard", "customer")).toBeNull();
    expect(postLoginPath("/vendor/dashboard", "super_admin")).toBeNull();
  });

  it("preserves compatible and role-neutral return paths", () => {
    expect(postLoginPath("/admin/recommendations", "super_admin")).toBe("/admin/recommendations");
    expect(postLoginPath("/vendor/orders", "outlet_manager")).toBe("/vendor/orders");
    expect(postLoginPath("/customer/saved", "customer")).toBe("/customer/saved");
    expect(postLoginPath("/outlet-manager-invitations/token", "outlet_manager"))
      .toBe("/outlet-manager-invitations/token");
  });

  it("falls back to the authenticated role home for an incompatible return path", () => {
    expect(postLoginDestination("/admin/dashboard", "outlet_manager")).toBe("/vendor/dashboard");
    expect(postLoginDestination("/vendor/dashboard", "super_admin")).toBe("/admin/dashboard");
    expect(postLoginDestination("/admin/dashboard", "customer")).toBe("/customer");
  });
});
