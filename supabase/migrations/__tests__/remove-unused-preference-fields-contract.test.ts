import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260821015200_remove_unused_preference_fields.sql",
);
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const legacyDistanceMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260821020700_drop_legacy_preferred_distance.sql",
);
const legacyDistanceSql = existsSync(legacyDistanceMigrationPath)
  ? readFileSync(legacyDistanceMigrationPath, "utf8")
  : "";
const seed = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");

describe("remove unused preference fields migration", () => {
  it("replaces the exact legacy RPC and drops only the approved preference columns", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(sql).toMatch(
      /DROP FUNCTION IF EXISTS public\.complete_preference_survey\s*\(\s*UUID\s*,\s*TEXT\[\]\s*,\s*TEXT\s*,\s*TEXT\s*,\s*TEXT\s*,\s*TEXT\[\]\s*,\s*BOOLEAN\s*,\s*INTEGER\s*,\s*TEXT\s*\)/i,
    );
    expect(sql).toMatch(/DROP COLUMN IF EXISTS travel_style/i);
    expect(sql).toMatch(/DROP COLUMN IF EXISTS group_composition/i);
    expect(sql.match(/DROP COLUMN IF EXISTS/g)).toHaveLength(2);
    expect(sql).not.toMatch(/p_travel_style|p_group_composition/);
  });

  it("preserves retained fields, authorization, promotion, and grants", () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.complete_preference_survey\s*\(\s*p_user_id\s+UUID\s*,\s*p_interests\s+TEXT\[\]\s*,\s*p_budget_range\s+TEXT\s*,\s*p_mobility_needs\s+TEXT\s+DEFAULT\s+'none'\s*,\s*p_pet_friendly\s+BOOLEAN\s+DEFAULT\s+FALSE\s*,\s*p_preferred_radius_km\s+INTEGER\s+DEFAULT\s+20\s*,\s*p_notes\s+TEXT\s+DEFAULT\s+NULL\s*\)/i,
    );
    expect(sql).toContain("p_preferred_radius_km INTEGER DEFAULT 20");
    expect(sql).toContain("auth.uid() IS DISTINCT FROM p_user_id");
    expect(sql).toContain("is_admin(auth.uid())");
    expect(sql).toContain("ON CONFLICT (user_id) DO UPDATE");
    expect(sql).toContain("promote_to_profile_complete(p_user_id)");
    expect(sql).toMatch(/SECURITY DEFINER\s+SET search_path = public, pg_temp/i);
    expect(sql).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC, anon/i);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO authenticated/i);
    for (const field of [
      "interests",
      "budget_range",
      "mobility_needs",
      "pet_friendly",
      "preferred_radius_km",
      "notes",
    ]) {
      expect(sql).toContain(field);
    }
  });

  it("keeps seed preference rows aligned with the reduced schema", () => {
    const preferenceSeed = seed.slice(seed.indexOf("INSERT INTO preference_survey_responses"));
    expect(preferenceSeed).not.toMatch(/travel_style|group_composition/);
    expect(preferenceSeed).toContain("preferred_radius_km");
  });

  it("removes the legacy text distance column without touching the numeric radius", () => {
    expect(existsSync(legacyDistanceMigrationPath)).toBe(true);
    expect(legacyDistanceSql).toMatch(/DROP COLUMN IF EXISTS preferred_distance/i);
    expect(legacyDistanceSql.match(/DROP COLUMN IF EXISTS/g)).toHaveLength(1);
    expect(legacyDistanceSql).not.toMatch(/DROP COLUMN IF EXISTS preferred_radius_km/i);
  });
});
