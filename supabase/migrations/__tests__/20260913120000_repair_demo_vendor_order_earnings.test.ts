import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20260913120000_repair_demo_vendor_order_earnings.sql"), "utf8");

describe("demo vendor earning repair migration", () => {
  it("is service-role-only and recalculates before updating the ledger", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.repair_demo_vendor_order_earning");
    expect(sql).toContain("IF auth.role() <> 'service_role'");
    expect(sql).toContain("FROM public.order_items AS order_item");
    expect(sql).toContain("UPDATE public.wallet_transactions");
    expect(sql).toContain("UPDATE public.wallets");
    expect(sql).toContain("INSERT INTO public.audit_logs");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.repair_demo_vendor_order_earning(UUID) TO service_role");
  });

  it("documents the migration-first fallback when the remote RPC is absent", () => {
    const repairSource = readFileSync(resolve(process.cwd(), "scripts/repair-enabled-vendor-earnings.mjs"), "utf8");
    expect(repairSource).toContain("Remote repair RPC is not installed");
    expect(repairSource).toContain("20260913120000_repair_demo_vendor_order_earnings.sql");
  });
});
