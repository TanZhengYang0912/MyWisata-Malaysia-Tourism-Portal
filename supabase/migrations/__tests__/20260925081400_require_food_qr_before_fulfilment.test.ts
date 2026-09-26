import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260925081400_require_food_qr_before_fulfilment.sql"), "utf8");

describe("food QR fulfilment trigger", () => {
  it("rejects direct fulfilment for food without a scanner timestamp", () => {
    expect(migration).toContain("NEW.fulfil_status = 'fulfilled'");
    expect(migration).toContain("NEW.food_qr_scanned_at IS NULL");
    expect(migration).toContain("v_category_slug = 'food'");
    expect(migration).toContain("food_qr_scan_required");
  });

  it("allows the food QR RPC to set the scan timestamp atomically with fulfilment", () => {
    expect(migration).toMatch(/BEFORE UPDATE OF fulfil_status, food_qr_scanned_at ON public\.order_items/i);
    expect(migration).toContain("RETURN NEW");
  });

  it("prevents vendor sessions from forging or clearing the scanner timestamp", () => {
    expect(migration).toMatch(/NEW\.food_qr_scanned_at IS DISTINCT FROM OLD\.food_qr_scanned_at[\s\S]*?auth\.role\(\) IS DISTINCT FROM 'service_role'/i);
    expect(migration).toContain("food_qr_scan_service_required");
  });
});
