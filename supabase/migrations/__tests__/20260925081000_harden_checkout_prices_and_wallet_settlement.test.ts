import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260925081000_harden_checkout_prices_and_wallet_settlement.sql"), "utf8");

describe("authoritative checkout price and wallet migration", () => {
  it("fails closed if either current checkout function definition drifts", () => {
    expect(migration).toContain("prepare_checkout price definition changed");
    expect(migration).toContain("reserve_wallet_split_checkout");
    expect(migration).toContain("EXECUTE v_definition");
  });

  it("validates database-derived price for every checkout line and exact selection", () => {
    expect(migration).toContain("checkout_line_price_mismatch");
    expect(migration).toContain("checkout_selection_mismatch");
    expect(migration).toContain("v_authoritative_price");
    expect(migration).toContain("ROUND(v_line.unit_price, 2)");
    expect(migration).toContain("checkout_product_snapshot_mismatch");
    expect(migration).toContain("checkout_variant_snapshot_mismatch");
    expect(migration).toContain("checkout_slot_snapshot_mismatch");
    expect(migration).toContain("offer.outlet_id = v_line.outlet_id");
    expect(migration).toContain("offer.status = 'active'");
    expect(migration).toContain("offer.price + COALESCE(v_variant.price_offset, 0)");
    expect(migration).toContain("selected_outlet.status = 'active'");
  });

  it("only allows a wallet reservation for a wallet checkout session", () => {
    expect(migration).toContain("invalid_wallet_checkout_method");
    expect(migration).toContain("payment_method NOT IN ('wallet', 'wallet_split')");
  });

  it("retains voucher scope and the full-wallet finalizer coverage guard", () => {
    expect(migration).toContain("v_eligible_subtotal");
    expect(migration).toContain("checkout_wallet_reservations");
    expect(migration).toContain("provider_confirmation_required");
    expect(migration).toContain("v_reservation.topup_amount_sen + v_reservation.earnings_amount_sen");
  });
});
