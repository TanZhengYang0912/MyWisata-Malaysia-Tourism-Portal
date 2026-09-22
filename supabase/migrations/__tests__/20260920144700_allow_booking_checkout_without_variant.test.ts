import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260920144700_allow_booking_checkout_without_variant.sql",
);

describe("booking checkout without product variants", () => {
  it("allows a null variant only for booking products and uses the base price", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("v_variant := NULL;");
    expect(migration).toContain("IF v_line.variant_id IS NOT NULL THEN");
    expect(migration).toContain("ELSIF NOT v_product_booking THEN");
    expect(migration).toContain("RAISE EXCEPTION 'variant_not_purchasable';");
    expect(migration).toContain("COALESCE(v_variant.price_offset, 0)");
    expect(migration).toContain("prepare_checkout variant validation pattern not found");
    expect(migration).toContain("prepare_checkout base price pattern not found");
  });
});
