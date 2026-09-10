import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260911000000_vendor_order_settlement.sql");
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("vendor order settlement migration", () => {
  it("adds the configurable platform commission rate", () => {
    expect(sql).toContain("'commission.platform_rate'");
    expect(sql).toContain("ALTER TABLE public.vendors");
    expect(sql).toMatch(/platform_commission_rate\s+NUMERIC\(5,4\)/);
  });

  it("creates the order_settlements ledger with an idempotency key and own-vendor RLS", () => {
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.order_settlements");
    expect(sql).toContain("UNIQUE (order_id, vendor_id)");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(/CREATE POLICY order_settlements_read[\s\S]*owner_id = auth\.uid\(\)/);
    // no write policy — RPC only
    expect(sql).not.toMatch(/CREATE POLICY[^\n]*order_settlements[^\n]*FOR (INSERT|UPDATE|DELETE)/i);
  });

  it("settles each vendor their held net minus commission, idempotently", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.settle_order_vendor_earnings(p_order_id UUID)");
    expect(sql).toContain("ON CONFLICT (order_id, vendor_id) DO NOTHING");
    expect(sql).toContain("pending_earnings_sen = pending_earnings_sen + v_net_sen");
    expect(sql).toContain("'earnings_pending'");
    expect(sql).toMatch(/GREATEST\(0, v_total_sen - v_allocated\)/); // last vendor absorbs the rounding remainder
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.settle_order_vendor_earnings(UUID) TO service_role");
  });

  it("clears matured settlements and reverses on a cancelled/refunded order", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.clear_matured_vendor_settlements(p_ignore_hold BOOLEAN DEFAULT FALSE)");
    expect(sql).toContain("FOR UPDATE OF s SKIP LOCKED");
    expect(sql).toContain("LOWER(COALESCE(o.status, '')) IN ('cancelled', 'refunded')");
    expect(sql).toContain("pending_wallet_balance_mismatch");
    expect(sql).toContain("earnings_confirm");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.clear_matured_vendor_settlements(BOOLEAN) TO service_role");
  });

  it("claws back a confirmed settlement on refund, logging any shortfall", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.reverse_order_vendor_settlement(");
    expect(sql).toContain("settlement_clawback_shortfalls");
    expect(sql).toMatch(/reversed_amount_sen = reversed_amount_sen \+ v_target/);
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.reverse_order_vendor_settlement(UUID, BIGINT) TO service_role");
  });

  it("does not deploy the demo purchase RPC", () => {
    expect(sql).not.toMatch(/FUNCTION\s+public\.create_demo_purchase/i);
  });
});
