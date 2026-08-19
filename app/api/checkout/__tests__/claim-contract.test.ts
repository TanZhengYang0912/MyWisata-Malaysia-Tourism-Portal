import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("claimed voucher checkout handoff", () => {
  it("validates and forwards claimId to the authoritative checkout RPC", () => {
    const schema = read("lib/validation/schemas.ts");
    const route = read("app/api/checkout/prepare/route.ts");
    expect(schema).toContain("claimId");
    expect(route).toContain("claimId");
    expect(route).toContain("p_claim_id");
  });

  it("preserves the claim when the customer moves from cart to checkout", () => {
    const cart = read("app/customer/cart/page.tsx");
    const checkout = read("app/customer/checkout/page.tsx");
    expect(cart).toContain("claimId");
    expect(cart).toContain("claim=");
    expect(checkout).toContain("claimId");
  });
});
