import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertCartItemHasBackingRecord } from "@/backend/core/helpers";

describe("cart item persistence guard", () => {
  it("rejects a cart line that has neither a product variant nor a booking slot", () => {
    expect(() => assertCartItemHasBackingRecord({ variantId: "", slotId: undefined })).toThrow("cart_item_requires_variant_or_slot");
    expect(() => assertCartItemHasBackingRecord({ variantId: "variant-1", slotId: undefined })).not.toThrow();
    expect(() => assertCartItemHasBackingRecord({ variantId: "", slotId: "slot-1" })).not.toThrow();
  });
});

describe("outlet-specific cart pricing", () => {
  it("restores a persisted outlet price override for non-booking items", () => {
    const source = readFileSync(resolve(process.cwd(), "backend/domains/commerce.ts"), "utf8");
    expect(source).toContain("priceOverride: row.unit_price > 0 ? Number(row.unit_price) : undefined");
  });
});
