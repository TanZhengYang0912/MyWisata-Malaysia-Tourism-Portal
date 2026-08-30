import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260816170354_canonicalize_catalogue_vouchers.sql");

describe("catalogue voucher canonicalization", () => {
  it("keeps outlet offers as the source scope while collapsing generated rows by product", () => {
    const source = readFileSync(migrationPath, "utf8");

    expect(source).toContain("MYW-LAUNCH-%");
    expect(source).toContain("customer_voucher_claims");
    expect(source).toContain("canonical_id");
    expect(source).toContain("outlet_id = NULL");
    expect(source).toContain("is_active = FALSE");
    expect(source).toContain("review_status = 'rejected'");
  });

  it("does not delete the superseded voucher rows", () => {
    const source = readFileSync(migrationPath, "utf8");

    expect(source).not.toMatch(/DELETE\s+FROM\s+public\.vouchers/i);
    expect(source).toContain("review_note");
  });
});
