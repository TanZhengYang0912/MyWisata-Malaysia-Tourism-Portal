import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260920145000_remove_committed_cart_items_by_reservation.sql",
);

describe("checkout cart cleanup", () => {
  it("removes exactly the committed cart lines recorded by checkout reservations", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("FROM public.checkout_reservations reservation");
    expect(migration).toContain("reservation.checkout_session_id = v_session.id");
    expect(migration).toContain("reservation.status = 'committed'");
    expect(migration).toContain("reservation.cart_item_id IS NOT NULL");
    expect(migration).toContain("finalize_checkout cart cleanup pattern not found");
  });
});
