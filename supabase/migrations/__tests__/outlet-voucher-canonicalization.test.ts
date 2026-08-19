import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260817110000_outlet_voucher_catalogue.sql");

describe("outlet voucher canonicalization", () => {
  it("creates one deterministic voucher for each eligible outlet", () => {
    const source = readFileSync(migrationPath, "utf8");

    expect(source).toContain("MYW-OUTLET-");
    expect(source).toContain("outlet_id");
    expect(source).toContain("product_id");
    expect(source).toContain("active_product_count");
    expect(source).toContain("ON CONFLICT (code) DO NOTHING");
  });

  it("moves existing claims before hiding generated product-level rows", () => {
    const source = readFileSync(migrationPath, "utf8");

    expect(source).toContain("customer_voucher_claims");
    expect(source).toContain("outlet_voucher_map");
    expect(source).toContain("status = 'rejected'");
    expect(source).toContain("is_claimable = FALSE");
    expect(source).toContain("is_active = FALSE");
    expect(source).not.toMatch(/\bDELETE\s+FROM\b/i);
  });
});
