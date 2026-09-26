import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260924224000_scope_online_voucher_checkout.sql"), "utf8");

describe("online checkout voucher scope migration", () => {
  it("replaces the existing prepare_checkout body without changing its signature", () => {
    expect(migration).toContain("public.prepare_checkout(uuid,uuid[],text,text,text,numeric,numeric,numeric,text,jsonb)");
    expect(migration).toContain("pg_get_functiondef");
    expect(migration).toContain("EXECUTE v_definition");
  });

  it("validates redemption mode and discounts only matching vendor, outlet, and product lines", () => {
    expect(migration).toContain("v_voucher.redemption_mode NOT IN ('online', 'both')");
    expect(migration).toContain("x.vendor_id = v_voucher.vendor_id");
    expect(migration).toContain("x.outlet_id = v_voucher.outlet_id");
    expect(migration).toContain("x.product_id = v_voucher.product_id");
    expect(migration).toContain("v_eligible_subtotal * v_voucher.discount_value / 100");
  });

  it("fails closed when the deployed function body has drifted", () => {
    expect(migration).toContain("prepare_checkout voucher definition changed");
  });
});
