import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("customer purchase flow", () => {
  it("lets customers leave the cart for discovery and continue to checkout", () => {
    const source = read("app/customer/cart/page.tsx");
    expect(source).toContain('href="/customer"');
    expect(source).toContain("Continue shopping");
    expect(source).toContain("Proceed to Checkout");
    expect(source).toContain('href={appliedVoucher ? `/customer/checkout');
  });

  it("preserves the selected cart lines across a full checkout navigation", () => {
    const source = read("components/providers/cart.tsx");
    expect(source).toContain("customer-cart-selection-");
    expect(source).toContain("sessionStorage");
  });

  it("lets customers return from checkout when they need to change the cart", () => {
    const source = read("app/customer/checkout/page.tsx");
    expect(source).toContain('href="/customer/cart"');
    expect(source).toContain("Back to cart");
    expect(source).toContain("Nothing to check out");
  });

  it("offers both history and discovery after an order is confirmed", () => {
    const source = read("app/customer/orders/[id]/page.tsx");
    expect(source).toContain("Back to Order History");
    expect(source).toContain('href="/customer"');
    expect(source).toContain("Continue exploring");
  });
});
