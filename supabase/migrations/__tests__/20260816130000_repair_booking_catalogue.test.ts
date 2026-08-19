import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260816130000_repair_booking_catalogue.sql");
const seedPath = resolve(process.cwd(), "supabase/seed.sql");

describe("booking catalogue repair contract", () => {
  it("normalises vendor-backed booking products before creating slots", () => {
    const source = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

    expect(source).toContain("p.requires_booking = TRUE");
    expect(source).toContain("p.outlet_id IS NULL");
    expect(source).toContain("o.vendor_id = p.vendor_id");
    expect(source).toContain("o.status = 'active'");
  });

  it("backfills checkout variants and future available slots idempotently", () => {
    const source = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

    expect(source).toContain("INSERT INTO public.product_variants");
    expect(source).toContain("NOT EXISTS");
    expect(source).toContain("INSERT INTO public.booking_slots");
    expect(source).toContain("CURRENT_TIMESTAMP");
    expect(source).toContain("status = 'available'");
    expect(source).toContain("b.booked < b.capacity");
    expect(source).toContain("generate_series");
    expect(source).toContain("existing.starts_at = s.starts_at");
  });

  it("keeps the checked-in seed aligned with the production repair rule", () => {
    const source = existsSync(seedPath) ? readFileSync(seedPath, "utf8") : "";

    expect(source).toContain("requires_booking = TRUE");
    expect(source).toContain("INSERT INTO booking_slots");
    expect(source).toContain("CURRENT_TIMESTAMP");
  });
});
