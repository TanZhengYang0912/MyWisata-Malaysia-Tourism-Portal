import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("reference price purchase surfaces", () => {
  it("uses the shared reference display throughout cart and checkout", () => {
    const cart = read("app/customer/cart/page.tsx");
    const checkout = read("app/customer/checkout/page.tsx");

    expect(cart).toContain('from "@/components/shared/reference-price"');
    expect(cart.match(/<ReferencePrice\b/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(checkout).toContain('from "@/components/shared/reference-price"');
    expect(checkout.match(/<ReferencePrice\b/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(cart).toContain("showSettlementMYR");
    expect(checkout).toContain("showSettlementMYR");
  });

  it("makes MYR charging and the dated estimate disclaimer visible at checkout", () => {
    const checkout = read("app/customer/checkout/page.tsx");

    expect(checkout).toContain("useReferenceCurrency");
    expect(checkout).toContain('tCommon("currency.chargedInMYR")');
    expect(checkout).toContain('tCommon("currency.referenceOnly")');
    expect(checkout).toContain('tCommon("currency.rateDate"');
  });

  it("keeps converted values out of checkout requests and commerce calculations", () => {
    const checkout = read("app/customer/checkout/page.tsx");
    const requestPayloads = checkout.match(/JSON\.stringify\(\{[\s\S]*?\}\)/g) ?? [];

    expect(checkout).not.toContain("convertMYR");
    expect(checkout).not.toContain("snapshot.rate");
    expect(requestPayloads.length).toBeGreaterThan(0);
    for (const payload of requestPayloads) expect(payload).not.toContain("currency");
  });
});
