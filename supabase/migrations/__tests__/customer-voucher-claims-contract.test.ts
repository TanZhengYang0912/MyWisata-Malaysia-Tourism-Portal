import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260816180000_customer_voucher_claims.sql");

describe("customer voucher claim migration contract", () => {
  it("adds an owned claim table with a one-claim-per-customer invariant", () => {
    const source = readFileSync(migrationPath, "utf8");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS public.customer_voucher_claims");
    expect(source).toContain("UNIQUE (voucher_id, user_id)");
    expect(source).toContain("ALTER TABLE public.customer_voucher_claims ENABLE ROW LEVEL SECURITY");
    expect(source).toContain("customer_voucher_claims_owner_select");
  });

  it("makes claiming atomic and authenticated", () => {
    const source = readFileSync(migrationPath, "utf8");
    expect(source).toContain("CREATE OR REPLACE FUNCTION public.claim_voucher");
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("auth.uid()");
    expect(source).toContain("GRANT EXECUTE ON FUNCTION public.claim_voucher(UUID) TO authenticated");
  });

  it("binds claimed vouchers to checkout holds and redeems them after payment", () => {
    const source = readFileSync(migrationPath, "utf8");
    expect(source).toMatch(/ALTER TABLE public\.voucher_holds\s+ADD COLUMN IF NOT EXISTS claim_id/);
    expect(source).toContain("CREATE OR REPLACE FUNCTION public.prepare_checkout(");
    expect(source).toContain("p_claim_id UUID");
    expect(source).toContain("UPDATE public.customer_voucher_claims");
    expect(source).toContain("status = 'redeemed'");
    expect(source).toContain("CREATE TRIGGER voucher_hold_claim_redeemed");
  });
});
