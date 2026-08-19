import { describe, expect, it } from "vitest";
import { isProductEligibleForVoucherOutlet } from "@/lib/vendor/voucher-scope";

describe("voucher catalogue scope", () => {
  it("accepts a product directly owned by the selected outlet", () => {
    expect(isProductEligibleForVoucherOutlet({
      productOutletId: "outlet-1",
      offers: [],
      selectedOutletId: "outlet-1",
    })).toBe(true);
  });

  it("accepts a shared product with an active offer at the selected outlet", () => {
    expect(isProductEligibleForVoucherOutlet({
      productOutletId: null,
      offers: [{ outletId: "outlet-1", status: "active" }],
      selectedOutletId: "outlet-1",
    })).toBe(true);
  });

  it("rejects inactive or unrelated outlet offers", () => {
    expect(isProductEligibleForVoucherOutlet({
      productOutletId: null,
      offers: [{ outletId: "outlet-1", status: "inactive" }, { outletId: "outlet-2", status: "active" }],
      selectedOutletId: "outlet-1",
    })).toBe(false);
  });
});
