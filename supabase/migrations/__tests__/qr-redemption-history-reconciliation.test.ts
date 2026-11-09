import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20261109084435_reconcile_qr_redemption_history.sql"), "utf8");

describe("QR redemption history reconciliation migration", () => {
  it("keeps admission and all pickup history branches in one query", () => {
    expect(migration).toContain("admission_place.relation_type = 'admission'");
    expect(migration).toContain("a.action = 'food_order.scanned'");
    expect(migration).toContain("a.action = 'event_pickup.fulfilled'");
    expect(migration).toContain("a.action = 'retail_pickup.fulfilled'");
  });

  it("preserves vendor/outlet scope and the bounded history page size", () => {
    expect(migration).toContain("a.after_data->>'vendor_id' = p_vendor_id::TEXT");
    expect(migration).toContain("o.id = ANY(coalesce(p_scope_outlet_ids, ARRAY[]::UUID[]))");
    expect(migration).toContain("least(50, greatest(1, coalesce(p_page_size, 15)))");
  });
});
