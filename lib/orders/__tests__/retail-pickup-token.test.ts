import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { signRetailPickupToken, verifyRetailPickupToken } from "@/lib/orders/retail-pickup-token";

const ids = {
  orderId: "10000000-0000-4000-8000-000000000001",
  orderItemId: "10000000-0000-4000-8000-000000000002",
  vendorId: "10000000-0000-4000-8000-000000000003",
  outletId: "10000000-0000-4000-8000-000000000004",
};

describe("retail pickup token", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it.each(["orderId", "orderItemId", "vendorId", "outletId"] as const)("accepts database UUID shape for %s", field => {
    const claims = { ...ids, [field]: "aaaaaaaa-bbbb-accc-3ddd-eeeeeeeeeeee", issuedAt: 100 };
    const token = signRetailPickupToken(claims, "synthetic-uuid-compatibility-test-secret");
    expect(verifyRetailPickupToken(token, "synthetic-uuid-compatibility-test-secret", 101)).toMatchObject({ valid: true, claims });
  });

  it.each(["not-a-uuid", "aaaaaaaa-bbbb-accc-3ddd-eeeeeeeeeeeg", "aaaaaaaabbbbaccc3dddeeeeeeeeeeee", " aaaaaaaa-bbbb-accc-3ddd-eeeeeeeeeeee", "../../private", 123, null])("rejects malformed database IDs in signing and validly signed payloads: %s", value => {
    const claims = { ...ids, outletId: value, issuedAt: 100, kind: "retail_pickup" };
    const secret = "synthetic-uuid-compatibility-test-secret";
    expect(() => signRetailPickupToken(claims as unknown as Parameters<typeof signRetailPickupToken>[0], secret)).toThrow("retail_pickup_claims_invalid");
    const input = `retail1.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`;
    const signature = createHmac('sha256', secret).update(input).digest('base64url');
    expect(verifyRetailPickupToken(`${input}.${signature}`, secret).valid).toBe(false);
  });

  it("rejects extra claims even with a valid HMAC", () => {
    const secret = "synthetic-uuid-compatibility-test-secret";
    const input = `retail1.${Buffer.from(JSON.stringify({ ...ids, issuedAt: 100, kind: 'retail_pickup', isAdmin: true })).toString('base64url')}`;
    const signature = createHmac('sha256', secret).update(input).digest('base64url');
    expect(verifyRetailPickupToken(`${input}.${signature}`, secret).valid).toBe(false);
  });

  it("signs a distinct retail1 pickup credential and verifies its exact claim scope", () => {
    const token = signRetailPickupToken({ ...ids, issuedAt: 100 }, "a-test-secret-that-is-long-enough");
    expect(token.startsWith("retail1.")).toBe(true);
    expect(verifyRetailPickupToken(token, "a-test-secret-that-is-long-enough", 101)).toMatchObject({ valid: true, claims: { ...ids, issuedAt: 100, kind: "retail_pickup" } });
  });

  it("rejects tampering, other token kinds, malformed claims, and missing secrets", () => {
    const token = signRetailPickupToken({ ...ids, issuedAt: 100 }, "a-test-secret-that-is-long-enough");
    expect(verifyRetailPickupToken(`${token}x`, "a-test-secret-that-is-long-enough").valid).toBe(false);
    expect(verifyRetailPickupToken("food1.anything.signature", "a-test-secret-that-is-long-enough").valid).toBe(false);
    expect(verifyRetailPickupToken("retail1.a.b").valid).toBe(false);
  });

  it("reports an expired credential without accepting it", () => {
    const token = signRetailPickupToken({ ...ids, issuedAt: 100, exp: 110 }, "a-test-secret-that-is-long-enough");
    expect(verifyRetailPickupToken(token, "a-test-secret-that-is-long-enough", 111)).toMatchObject({ valid: false, expired: true });
  });
});
