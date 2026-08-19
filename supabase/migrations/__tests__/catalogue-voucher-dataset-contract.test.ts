import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260816230000_seed_catalogue_vouchers.sql");

describe("catalogue-derived voucher dataset", () => {
  it("derives voucher rows from approved products and active outlet offers", () => {
    const source = readFileSync(migrationPath, "utf8");

    expect(source).toContain("INSERT INTO public.vouchers");
    expect(source).toContain("FROM public.products p");
    expect(source).toContain("JOIN public.outlet_offers oo");
    expect(source).toContain("oo.status = 'active'");
    expect(source).toContain("GROUP BY p.vendor_id, v.slug, v.name, oo.outlet_id, o.name, o.city, o.state");
    expect(source).toContain("active_product_count");
    expect(source).toContain("p.status = 'active'");
    expect(source).toContain("p.review_status = 'approved'");
    expect(source).toContain("ON CONFLICT (code) DO NOTHING");
    expect(source).toContain("p.vendor_id");
    expect(source).toContain("oo.outlet_id");
    expect(source).toContain("p.id");
    expect(source).toContain("10% off all eligible products");
    expect(source).toContain("code LIKE 'MYW-OUTLET-%'");
  });

  it("uses one outlet-level voucher covering every eligible product at that outlet", () => {
    const source = readFileSync(migrationPath, "utf8");

    expect(source).toContain("NULL::UUID");
    expect(source).toContain("active_product_count");
    expect(source).toContain("MYW-OUTLET-");
    expect(source).toContain("all eligible products");
    expect(source).toContain("oo.outlet_id");
  });

  it("uses one data-derived percentage offer and does not hardcode catalogue UUIDs", () => {
    const source = readFileSync(migrationPath, "utf8");

    expect(source).toContain("'percent'");
    expect(source).toContain("10::NUMERIC");
    expect(source).toContain("MYW-OUTLET-");
    expect(source).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  });
});
