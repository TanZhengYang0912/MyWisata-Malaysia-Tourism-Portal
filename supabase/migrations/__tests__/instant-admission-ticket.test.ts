import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20261108082307_instant_admission_ticket_qr.sql");
const migrationExists = existsSync(migrationPath);
const migration = migrationExists ? readFileSync(migrationPath, "utf8").toLowerCase().replace(/\s+/g, " ").trim() : "";
const checkoutCoreSource = readFileSync(resolve(process.cwd(), "supabase/migrations/20261017143000_accommodation_checkout_nights.sql"), "utf8");

function normalizeSql(source: string) {
  return source.toLowerCase().replace(/\s+/g, " ").trim();
}

describe("instant admission ticket migration", () => {
  it("adds the planned local migration", () => {
    expect(migrationExists).toBe(true);
  });

  it("allows bookings without a slot and fails closed when patching checkout", () => {
    expect(migration).toContain("alter table public.bookings alter column slot_id drop not null");
    expect(migration).toContain("pg_get_functiondef(");
    expect(migration).toContain("v_anchor_count <> 1");
    expect(migration).toContain("position(v_inventory_block_new in v_core)");
    expect(migration).toContain("execute v_core");
    expect(migration).toContain("update public.inventory");
    expect(migration).toContain("inventory_unavailable");
  });

  it("anchors the guarded patch to the existing checkout inventory branch", () => {
    const inventoryAnchor = migration.match(/v_inventory_block_old text := \$old\$(.*?)\$old\$;/)?.[1] ?? "";
    expect(inventoryAnchor).not.toBe("");
    expect(normalizeSql(checkoutCoreSource)).toContain(normalizeSql(inventoryAnchor));
  });

  it("creates a pass only for explicit admission links after inventory succeeds", () => {
    expect(migration).toContain("product_places");
    expect(migration).toContain("relation_type = 'admission'");
    expect(migration).toContain("values (v_order_item_id, null, v_user, p_owner_guest, 'confirmed')");
    expect(migration).toContain("insert into public.ticket_passes");
    expect(migration).toContain("case when v_line.quantity > 1 then 'group_entry' else 'single_entry' end");
    expect(migration).toContain("on conflict (booking_id) do nothing");
  });

  it("backfills only unpaid-risk-free outstanding admission items idempotently", () => {
    expect(migration).toContain("lower(o.status) = 'paid'");
    expect(migration).toContain("oi.fulfil_status = 'pending'");
    expect(migration).toContain("p.requires_booking is false");
    expect(migration).toContain("oi.slot_id is null");
    expect(migration).toContain("not exists ( select 1 from public.bookings");
    expect(migration).toContain("refund.status in ('pending', 'approved', 'processed')");
    expect(migration).toContain("set_config('request.jwt.claim.role', 'service_role', true)");
    expect(migration).toContain("set_config('request.jwt.claim.role', coalesce(v_previous_role, ''), true)");
    expect(migration).toContain("on conflict (order_item_id) do nothing");
    expect(migration).toContain("on conflict (booking_id) do nothing");
  });
});
