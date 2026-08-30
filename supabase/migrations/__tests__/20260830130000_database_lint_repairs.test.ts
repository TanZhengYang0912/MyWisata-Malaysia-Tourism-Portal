import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260830130000_database_lint_repairs.sql");
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("database lint repair migration", () => {
  it("removes only the revoked legacy KYC submission RPC", () => {
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.submit_kyc(UUID, TEXT, TEXT, TEXT)");
    expect(sql).not.toMatch(/DROP\s+TABLE|TRUNCATE|DELETE\s+FROM/i);
  });

  it("qualifies wallet columns that collide with output parameters", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.clear_matured_recommendation_rewards()");
    expect(sql.match(/FROM public\.wallets w[\s\S]*?WHERE w\.user_id = v_reward\.recommender_id/g)).toHaveLength(2);
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.clear_matured_recommendation_rewards() TO service_role");
  });

  it("resolves pgcrypto from the extension schema without widening search_path", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.admin_review_recommendation_translation(");
    expect(sql).toContain("extensions.digest(v_source_text, 'sha256')");
    expect(sql).toMatch(/SET search_path = public, pg_temp/i);
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.admin_review_recommendation_translation(UUID, UUID, TEXT, TEXT) TO authenticated");
  });
});
