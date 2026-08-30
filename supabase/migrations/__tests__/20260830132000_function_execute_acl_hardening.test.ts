import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260830132000_function_execute_acl_hardening.sql");
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("function execute ACL hardening", () => {
  it("keeps Profile city lookup authenticated-only", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.search_location_cities\(TEXT, TEXT, INTEGER\)[\s\S]*?FROM PUBLIC, anon/i);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.resolve_profile_location_city\(UUID, TEXT\)[\s\S]*?FROM PUBLIC, anon/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.search_location_cities\(TEXT, TEXT, INTEGER\)\s+TO authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.resolve_profile_location_city\(UUID, TEXT\)\s+TO authenticated/i);
  });

  it("does not expose trigger-only or Admin RPCs to anonymous users", () => {
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.detach_location_city_users\(\)[\s\S]*?FROM PUBLIC, anon, authenticated, service_role/i);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.admin_resolve_recommendation_place\(UUID, TEXT, UUID\)[\s\S]*?FROM PUBLIC, anon/i);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.admin_review_recommendation_translation\(UUID, UUID, TEXT, TEXT\)[\s\S]*?FROM PUBLIC, anon/i);
  });
});
