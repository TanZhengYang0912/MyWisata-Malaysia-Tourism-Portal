import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260816100320_customer_voucher_claim_visibility.sql");

describe("customer voucher claim visibility migration contract", () => {
  it("lets owners see approved vouchers after the public deal filters no longer match", () => {
    const source = readFileSync(migrationPath, "utf8");
    expect(source).toContain("CREATE POLICY vouchers_claim_owner_read");
    expect(source).toContain("customer_voucher_claims");
    expect(source).toContain("(SELECT auth.uid())");
  });

  it("removes anonymous execution from claim security-definer entry points", () => {
    const source = readFileSync(migrationPath, "utf8");
    expect(source).toContain("REVOKE EXECUTE ON FUNCTION public.claim_voucher(UUID) FROM anon");
    expect(source).toContain("REVOKE EXECUTE ON FUNCTION public.prepare_checkout(");
    expect(source).toContain("FROM anon");
    expect(source).toContain("REVOKE EXECUTE ON FUNCTION public.mark_customer_voucher_claim_redeemed() FROM anon");
  });
});
