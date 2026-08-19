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

  it("releases prepared checkout reservations when Stripe setup fails", () => {
    const route = read("app/api/checkout/prepare/route.ts");
    const stripeBlock = route.slice(route.indexOf("stripe.checkout.sessions.create"));

    expect(stripeBlock).toContain("failPreparedCheckout(null)");
    expect(stripeBlock).toContain("stripe.checkout.sessions.expire(stripeSession.id)");
    expect(stripeBlock).toContain("failPreparedCheckout(stripeSession.id)");
    expect(route).toContain("p_outcome: 'failed'");
    expect(route).toContain("finalizationError");
    expect(route).toContain("checkout_compensation_failed");
    expect(route).toContain(".in('status', ['prepared', 'requires_action'])");
    expect(route).toContain(".select('status')");
  });
});
