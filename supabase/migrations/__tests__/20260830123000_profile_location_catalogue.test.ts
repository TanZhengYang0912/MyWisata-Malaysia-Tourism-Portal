import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260830123000_profile_location_catalogue.sql");
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("Profile location catalogue migration", () => {
  it("adds a provider-neutral GeoNames city catalogue and compatible user references", () => {
    expect(sql).toContain("CREATE TABLE public.location_cities");
    expect(sql).toMatch(/geonames_id\s+BIGINT\s+NOT NULL\s+UNIQUE/i);
    expect(sql).toMatch(/country_code\s+TEXT\s+NOT NULL/i);
    expect(sql).toContain("alternate_names");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS city_id UUID");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS country_code TEXT");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS city_source TEXT");
    expect(sql).toMatch(/city_source[\s\S]*?CHECK \(city_source IN \('manual', 'catalogue'\)\)/i);
  });

  it("exposes only bounded catalogue RPCs to authenticated users", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.search_location_cities");
    expect(sql).toMatch(/country_code\s*=\s*upper\(p_country_code\)/i);
    expect(sql).toMatch(/LEAST\(GREATEST\(COALESCE\(p_limit, 5\), 1\), 5\)/i);
    expect(sql).toMatch(/search_location_cities[\s\S]*?SECURITY DEFINER/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.search_location_cities[\s\S]+FROM PUBLIC/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.search_location_cities[\s\S]+TO authenticated/i);
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.resolve_profile_location_city");
    expect(sql).toMatch(/resolve_profile_location_city[\s\S]*?SECURITY DEFINER/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.location_cities FROM anon, authenticated/i);
    expect(sql).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*location_cities[^;]*authenticated/i);
  });

  it("keeps catalogue selection metadata internally consistent", () => {
    expect(sql).toMatch(/city_source = 'catalogue' AND city_id IS NOT NULL/i);
    expect(sql).toMatch(/city_source = 'manual' AND city_id IS NULL/i);
    expect(sql).toContain("ON DELETE SET NULL");
  });
});
