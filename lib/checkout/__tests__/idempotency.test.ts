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
});
