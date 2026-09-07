import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260904240000_free_activity_reservations.sql"),
  "utf8",
);
const correctiveMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260905070000_fix_free_reservation_checkout.sql",
);
const hardeningMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260905071000_harden_free_reservation_checkout.sql",
);
const priceRuleMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260905072000_align_free_reservation_price_rules.sql",
);

function readCorrectiveMigration() {
  try {
    return readFileSync(correctiveMigrationPath, "utf8");
  } catch {
    return "";
  }
}

function readHardeningMigration() {
  try {
    return readFileSync(hardeningMigrationPath, "utf8");
  } catch {
    return "";
  }
}

function readPriceRuleMigration() {
  try {
    return readFileSync(priceRuleMigrationPath, "utf8");
  } catch {
    return "";
  }
}

describe("free activity reservations migration", () => {
  it("enforces free_reservation zero-payment bypass and capacity booking", () => {
    expect(migration).toContain("'free_reservation'");
    expect(migration).toContain("free_reservation_requires_zero_total");
    expect(migration).toContain("INSERT INTO public.bookings");
    expect(migration).toContain("INSERT INTO public.ticket_passes");
    expect(migration).toContain("booking_capacity_unavailable");
    expect(migration).toContain("UPDATE public.products");
    expect(migration).toContain("slug = 'merdeka-square-heritage-walk'");
  });

  it("keeps free reservations inside the existing paid checkout state machine", () => {
    const correctiveMigration = readCorrectiveMigration();

    expect(correctiveMigration).toContain("DROP CONSTRAINT IF EXISTS orders_payment_method_check");
    expect(correctiveMigration).toMatch(
      /orders_payment_method_check[\s\S]*payment_method[\s\S]*'free_reservation'/,
    );
    expect(correctiveMigration).toContain("DROP CONSTRAINT IF EXISTS payments_method_check");
    expect(correctiveMigration).toMatch(
      /payments_method_check[\s\S]*method[\s\S]*'free_reservation'/,
    );
    expect(correctiveMigration).toContain("v_session_status TEXT := 'pending_payment'");
    expect(correctiveMigration).toContain("v_session_status := 'paid'");
    expect(correctiveMigration).not.toContain("v_session_status := 'succeeded'");
    expect(correctiveMigration).toContain("SECURITY DEFINER SET search_path = public");
    expect(correctiveMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.prepare_checkout(UUID, UUID[], TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, JSONB) TO authenticated, service_role",
    );
  });

  it("does not trust client-supplied cart lines or prices for free reservations", () => {
    const hardeningMigration = readHardeningMigration();

    expect(hardeningMigration).toContain("checkout_lines_required");
    expect(hardeningMigration).toContain("checkout_line_mismatch");
    expect(hardeningMigration).toContain("checkout_selection_mismatch");
    expect(hardeningMigration).toContain("free_reservation_product_not_free");
    expect(hardeningMigration).toContain("FROM public.cart_items");
    expect(hardeningMigration).toContain("FROM public.product_variants");
    expect(hardeningMigration).toContain("FROM public.booking_slots");
    expect(hardeningMigration).toContain("FOR UPDATE");
    expect(hardeningMigration).toContain("COUNT(DISTINCT x.cart_item_id)");
  });

  it("uses the existing price-rule precedence before declaring a reservation free", () => {
    const priceRuleMigration = readPriceRuleMigration();

    expect(priceRuleMigration).toContain("v_price_rule public.price_rules%ROWTYPE");
    expect(priceRuleMigration).toContain("FROM public.price_rules pr");
    expect(priceRuleMigration).toContain("ORDER BY pr.priority DESC");
    expect(priceRuleMigration).toContain("pr.rule_type = 'weekend'");
    expect(priceRuleMigration).toContain("pr.rule_type IN ('group_size', 'tiered')");
    expect(priceRuleMigration).toContain("pr.rule_type = 'bundle'");
    expect(priceRuleMigration).toContain("checkout_line_price_mismatch");
    expect(priceRuleMigration).toContain("free_reservation_product_not_free");
  });
});
