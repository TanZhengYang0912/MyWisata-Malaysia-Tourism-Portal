import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260910114500_fix_multi_outlet_checkout.sql",
);

function readMigration() {
  try {
    return readFileSync(migrationPath, "utf8");
  } catch {
    return "";
  }
}

describe("multi-outlet checkout migration", () => {
  it("accepts only a direct outlet or an active product offer", () => {
    const migration = readMigration();

    expect(migration).toContain(
      "public.prepare_checkout(uuid,uuid[],text,text,text,numeric,numeric,numeric,text,jsonb)",
    );
    expect(migration).toContain("v_product.outlet_id IS DISTINCT FROM v_line.outlet_id");
    expect(migration).toContain("FROM public.outlet_offers offer");
    expect(migration).toContain("offer.product_id = v_product.id");
    expect(migration).toContain("offer.outlet_id = v_line.outlet_id");
    expect(migration).toContain("offer.status = 'active'");
    expect(migration).toContain("prepare_checkout outlet validation pattern not found");
  });
});
