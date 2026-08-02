import { describe, expect, it } from "vitest";
import { buildActivityPath, getCustomerReturnPath } from "@/lib/customer/navigation-context";

describe("customer navigation context", () => {
  it("keeps safe customer return paths including filters", () => {
    expect(getCustomerReturnPath("/customer/search?q=heritage&category=walk")).toBe("/customer/search?q=heritage&category=walk");
  });

  it("rejects external and protocol-relative return paths", () => {
    expect(getCustomerReturnPath("https://example.com/phishing")).toBe("/customer");
    expect(getCustomerReturnPath("//example.com/phishing")).toBe("/customer");
    expect(getCustomerReturnPath("/vendor/dashboard")).toBe("/customer");
  });

  it("builds an activity link without losing the return context", () => {
    expect(buildActivityPath("activity-1", "/customer/for-you")).toBe("/customer/activity/activity-1?returnTo=%2Fcustomer%2Ffor-you");
    expect(buildActivityPath("activity-1")).toBe("/customer/activity/activity-1");
  });
});
