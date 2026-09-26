import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260925081100_harden_external_booking_reservations.sql"), "utf8");

describe("external reservation boundary migration", () => {
  it("binds the configured source, product, outlet and slot before booking", () => {
    expect(migration).toMatch(/v_source\.sync_enabled\s+IS NOT TRUE/i);
    expect(migration).toContain("source_slot_mismatch");
    expect(migration).toContain("product_vendor_mismatch");
    expect(migration).toMatch(/v_slot\.product_id\s+IS DISTINCT FROM\s+v_source\.product_id/i);
    expect(migration).toMatch(/v_slot\.outlet_id\s+IS DISTINCT FROM\s+v_source\.outlet_id/i);
  });

  it("validates action/quantity and persists the latest slot and quantity when rebooking", () => {
    expect(migration).toContain("invalid_reservation_quantity");
    expect(migration).toContain("invalid_reservation_action");
    expect(migration).toMatch(/slot_id\s*=\s*EXCLUDED\.slot_id/i);
    expect(migration).toMatch(/quantity\s*=\s*EXCLUDED\.quantity/i);
  });

  it("locks old and target slots in a stable order and releases the old confirmed capacity before rebooking", () => {
    expect(migration).toMatch(/WHERE id IN \(p_slot_id, v_existing\.slot_id\)[\s\S]*?ORDER BY id[\s\S]*?FOR UPDATE/i);
    expect(migration).toMatch(/v_existing\.external_status IN \('confirmed', 'modified'\)[\s\S]*?SET booked = GREATEST\(0, booked - v_existing\.quantity\)/i);
  });

  it("makes the SECURITY DEFINER mutation service-role only", () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.apply_external_reservation[\s\S]+FROM PUBLIC, anon, authenticated/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.apply_external_reservation[\s\S]+TO service_role/i);
    expect(migration).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.apply_external_reservation[^;]+authenticated/i);
  });
});
