import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260816103103_default_purchase_variants.sql");

describe("default purchase variant migration contract", () => {
  it("backfills a standard variant for every active non-booking product without one", () => {
    const source = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

    expect(source).toContain("INSERT INTO public.product_variants");
    expect(source).toContain("'Standard'");
    expect(source).toContain("p.requires_booking = FALSE");
    expect(source).toContain("NOT EXISTS");
    expect(source).toContain("v.product_id = p.id");
  });

  it("creates outlet-scoped inventory for the generated purchase variant", () => {
    const source = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

    expect(source).toContain("INSERT INTO public.inventory");
    expect(source).toContain("outlet_offers");
    expect(source).toContain("ON CONFLICT (variant_id, outlet_id) DO NOTHING");
    expect(source).toContain("quantity");
  });
});
