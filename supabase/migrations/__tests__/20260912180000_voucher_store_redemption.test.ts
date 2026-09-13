import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260912180000_voucher_store_redemption.sql"),
  "utf8",
);

describe("store voucher redemption migration contract", () => {
  it("uses a claim-bound unique redemption record", () => {
    expect(migration).toContain("voucher_store_redemptions");
    expect(migration).toContain("UNIQUE (claim_id)");
    expect(migration).toContain("redeemed_by");
  });

  it("locks and validates the claim inside an atomic RPC", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.redeem_store_voucher");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("redemption_mode NOT IN ('in_store', 'both')");
    expect(migration).toContain("status = 'claimed'");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.redeem_store_voucher");
  });
});
