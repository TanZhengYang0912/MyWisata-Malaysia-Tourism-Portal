import { describe, expect, it } from "vitest";
import { signFoodFulfilmentToken, verifyFoodFulfilmentToken } from "../food-fulfilment-token";

describe("food order fulfilment token", () => {
  const claims = { orderId: "order-a", outletId: "outlet-a", issuedAt: 100 };

  it("signs an order and outlet scoped token", () => {
    const token = signFoodFulfilmentToken(claims, "test-secret");
    expect(verifyFoodFulfilmentToken(token, "test-secret", 101)).toMatchObject({ valid: true, claims: { kind: "food_order", ...claims } });
  });

  it("rejects tampered signatures, another secret, and malformed values", () => {
    const token = signFoodFulfilmentToken(claims, "test-secret");
    expect(verifyFoodFulfilmentToken(token.slice(0, -1) + "x", "test-secret").valid).toBe(false);
    expect(verifyFoodFulfilmentToken(token, "other-secret").valid).toBe(false);
    expect(verifyFoodFulfilmentToken("wrong.format").valid).toBe(false);
  });
});
