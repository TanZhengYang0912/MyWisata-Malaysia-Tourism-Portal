import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDirectory = resolve(process.cwd(), "supabase/migrations");
const migrationName = readdirSync(migrationsDirectory).find((name) => name.endsWith("_food_scan_history_event_scanner_scope.sql"));
const sql = migrationName ? readFileSync(resolve(migrationsDirectory, migrationName), "utf8") : "";

describe("food scan history migration contract", () => {
  it("writes scan history transactionally and preserves the locked fulfilment and RPC grant boundary", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.fulfil_food_order_group");
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("INSERT INTO public.audit_logs");
    expect(sql).toContain("'food_order.scanned'");
    expect(sql).toContain("'vendor_id', p_vendor_id");
    expect(sql).toContain("'outlet_id', p_outlet_id");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.fulfil_food_order_group(UUID, UUID, UUID, UUID) TO service_role");
  });

  it("backfills legacy scans without inventing an operator and exposes food rows inside outlet scope", () => {
    expect(sql).toContain("SELECT NULL, 'food_order.scanned'");
    expect(sql).toContain("food_qr_scanned_at IS NOT NULL");
    expect(sql).toContain("'food_order'::TEXT");
    expect(sql).toContain("a.after_data->>'vendor_id' = p_vendor_id::TEXT");
    expect(sql).toContain("ANY(coalesce(p_scope_outlet_ids");
    expect(sql).toContain("p_kind IN ('all', 'food_order')");
  });
});
