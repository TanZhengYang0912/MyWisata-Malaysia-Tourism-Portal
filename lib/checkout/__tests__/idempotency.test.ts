import { describe, expect, it } from "vitest";
import { buildCheckoutRequestHash, normalizeCheckoutRequest } from "../idempotency";

describe("checkout idempotency request", () => {
  it("normalizes selected keys so retries with different ordering share a hash", () => {
    const first = normalizeCheckoutRequest({
      selectedKeys: ["b|v|s", "a|v|"],
      voucherCode: " travel10 ",
      paymentMethod: "stripe_card",
    });
    const second = normalizeCheckoutRequest({
      selectedKeys: ["a|v|", "b|v|s"],
      voucherCode: "TRAVEL10",
      paymentMethod: "stripe_card",
    });

    expect(first).toEqual(second);
    expect(buildCheckoutRequestHash(first)).toBe(buildCheckoutRequestHash(second));
  });

  it("binds an external simulator provider into the idempotency hash", () => {
    const tng = normalizeCheckoutRequest({
      selectedKeys: ["activity|variant||outlet"],
      paymentMethod: "ewallet",
      paymentProvider: "tng_ewallet_simulator",
    });
    const grab = normalizeCheckoutRequest({
      selectedKeys: ["activity|variant||outlet"],
      paymentMethod: "ewallet",
      paymentProvider: "grabpay_simulator",
    });

    expect(tng.paymentProvider).toBe("tng_ewallet_simulator");
    expect(grab.paymentProvider).toBe("grabpay_simulator");
    expect(buildCheckoutRequestHash(tng)).not.toBe(buildCheckoutRequestHash(grab));
  });
});
