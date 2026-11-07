import { describe, expect, it } from "vitest";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";

describe("shop navigation", () => {
  it("builds the public outlet shop URL", () => {
    expect(getOutletShopHref("outlet-123")).toBe("/customer/outlets/outlet-123");
  });
});
