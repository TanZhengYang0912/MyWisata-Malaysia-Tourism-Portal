import { describe, expect, it } from "vitest";
import {
  GUEST_EXPLORE_PATH,
  guestLoginHref,
  guestVendorHref,
  postLoginPath,
} from "@/lib/auth/guest-mode";

describe("Guest Mode navigation", () => {
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
  });
});
