import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260921081735_complete_ticket_food_fulfilment_flow.sql"), "utf8");

describe("ticket and food fulfilment migration", () => {
  it("starts multi-entry validity from successful payment", () => {
    expect(migration).toContain("CREATE TRIGGER orders_start_multi_entry_validity");
    expect(migration).toContain("COALESCE(NEW.paid_at, now()) + make_interval(days => p.ticket_validity_days)");
    expect(migration).toContain("valid_from = CASE WHEN o.status IN ('paid', 'completed') THEN COALESCE(o.paid_at, now()) ELSE NULL END");
  });

  it("persists only allowed outlet food modes alongside existing checkout functions", () => {
    expect(migration).toContain("DEFAULT ARRAY['dine_in', 'takeaway']::TEXT[]");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.prepare_checkout_with_food_service_modes");
    expect(migration).toContain("public.prepare_checkout(");
    expect(migration).toContain("food_service_mode_selection_mismatch");
    expect(migration).toContain("food_service_mode_unavailable");
    expect(migration).toContain("food_service_mode_persistence_failed");
  });

  it("serializes one-time food fulfilment and rejects replayed groups", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.fulfil_food_order_group");
    expect(migration).toContain("WHERE id = p_order_id FOR UPDATE");
    expect(migration).toContain("food_order_already_fulfilled");
    expect(migration).toContain("food_order_fulfilment_conflict");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS food_qr_scanned_at TIMESTAMPTZ");
    expect(migration).toContain("CASE WHEN v_mode = 'takeaway' THEN 'fulfilled' ELSE 'checked_in' END");
    expect(migration).toContain("oi.food_qr_scanned_at IS NOT NULL");
    expect(migration).toContain("oi.food_fulfilment_mode IS DISTINCT FROM v_mode");
  });
});
