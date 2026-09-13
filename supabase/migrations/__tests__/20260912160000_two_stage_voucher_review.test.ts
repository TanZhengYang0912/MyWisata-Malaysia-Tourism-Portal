import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "supabase/migrations/20260912140000_voucher_owner_approval.sql"), "utf8");

describe("two-stage voucher review migration", () => {
  it("adds an additive vendor review state with a legacy-safe default", () => {
    expect(source).toMatch(/ADD COLUMN IF NOT EXISTS vendor_review_status/i);
    expect(source).toMatch(/DEFAULT\s+'approved'/i);
    expect(source).toMatch(/vendor_reviewed_by/i);
    expect(source).toMatch(/vendor_reviewed_at/i);
    expect(source).toMatch(/vendor_review_status IN \('pending', 'approved', 'rejected'\)/i);
  });
});
