import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../20260908180000_harden_demo_vendor_order_earnings.sql", import.meta.url);

function migrationSql() {
  expect(existsSync(migrationUrl), "hardened demo Vendor earning migration must exist").toBe(true);
  return readFileSync(migrationUrl, "utf8");
}

describe("hardened demo Vendor order earning migration", () => {
  it("requires an active Product owned by the Vendor and available at the order Outlet", () => {
    const sql = migrationSql();

    expect(sql).toMatch(/JOIN public\.products AS product[\s\S]+product\.id = order_item\.product_id/i);
    expect(sql).toMatch(/product\.vendor_id = p_vendor_id/i);
    expect(sql).toMatch(/product\.outlet_id = order_item\.outlet_id/i);
    expect(sql).toMatch(/offer\.product_id = product\.id[\s\S]+offer\.outlet_id = order_item\.outlet_id/i);
    expect(sql).not.toMatch(/product\.outlet_id IS NULL[\s\S]+offer\.product_id/i);
    expect(sql).toMatch(/product\.status = 'active'/i);
    expect(sql).toMatch(/outlet\.status = 'active'/i);
  });

  it("requires the demo owner role and rejects mismatched idempotency rows", () => {
    const sql = migrationSql();

    expect(sql).toContain("role.name = 'vendor_owner'");
    expect(sql).toMatch(/transaction\.wallet_id = v_wallet_id/i);
    expect(sql).toMatch(/transaction\.order_id = p_order_id/i);
    expect(sql).toMatch(/transaction\.amount_sen = v_amount_sen/i);
    expect(sql).toContain("existing_demo_earning_mismatch");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.seed_demo_vendor_order_earning(UUID, UUID, TEXT) TO service_role");
  });
});
