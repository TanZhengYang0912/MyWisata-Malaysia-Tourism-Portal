import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../20260908165700_demo_vendor_order_earnings.sql", import.meta.url);

function migrationSql() {
  expect(existsSync(migrationUrl), "demo Vendor earning migration must exist").toBe(true);
  return readFileSync(migrationUrl, "utf8");
}

function functionSql() {
  const sql = migrationSql();
  const match = sql.match(
    /CREATE OR REPLACE FUNCTION public\.seed_demo_vendor_order_earning\([^]*?\n\$\$;/i,
  );
  expect(match, "seed_demo_vendor_order_earning must exist").not.toBeNull();
  return match![0];
}

describe("demo Vendor order earning migration", () => {
  it("restricts execution to service_role and demo-owned approved Vendors", () => {
    const sql = functionSql();

    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toMatch(/vendor\.status\s*=\s*'approved'/i);
    expect(sql).toMatch(/owner_user\.email\s+LIKE\s+'%@demo\.local'/i);
    expect(migrationSql()).toContain(
      "REVOKE ALL ON FUNCTION public.seed_demo_vendor_order_earning(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated",
    );
    expect(migrationSql()).toContain(
      "GRANT EXECUTE ON FUNCTION public.seed_demo_vendor_order_earning(UUID, UUID, TEXT) TO service_role",
    );
  });

  it("derives a positive amount from a paid or completed customer order owned by the Vendor", () => {
    const sql = functionSql();

    expect(sql).toMatch(/order_row\.status\s+IN\s+\('paid',\s*'completed'\)/i);
    expect(sql).toMatch(/order_item\.vendor_id\s*=\s*p_vendor_id/i);
    expect(sql).toMatch(/outlet\.vendor_id\s*=\s*p_vendor_id/i);
    expect(sql).toMatch(/SUM\(order_item\.line_total\)/i);
    expect(sql).toContain("demo_order_has_no_positive_vendor_items");
  });

  it("inserts the order-linked ledger row before changing the locked Wallet balance", () => {
    const sql = functionSql();
    const lockPosition = sql.indexOf("FOR UPDATE");
    const insertPosition = sql.indexOf("INSERT INTO public.wallet_transactions");
    const updatePosition = sql.indexOf("UPDATE public.wallets");

    expect(lockPosition).toBeGreaterThan(-1);
    expect(insertPosition).toBeGreaterThan(lockPosition);
    expect(updatePosition).toBeGreaterThan(insertPosition);
    expect(sql).toContain("order_id");
    expect(sql).toContain("idempotency_key");
    expect(sql).toContain("ON CONFLICT (user_id, idempotency_key)");
    expect(sql).toContain("type, amount_sen, bucket, direction");
    expect(sql).toContain("'earnings', v_amount_sen, 'earnings', 'credit'");
  });

  it("records an audit and an owner-only Wallet notification on first insert", () => {
    const sql = functionSql();

    expect(sql).toContain("INSERT INTO public.audit_logs");
    expect(sql).toContain("'vendor.demo_order_earning_seeded'");
    expect(sql).toContain("INSERT INTO public.notifications");
    expect(sql).toContain("'vendor_owner'");
    expect(sql).toContain("'vendor_wallet'");
    expect(sql).toContain("ON CONFLICT (event_key) DO NOTHING");
    expect(sql).not.toContain("outlet_manager");
  });
});
