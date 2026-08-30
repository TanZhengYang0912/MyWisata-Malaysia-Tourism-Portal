import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260830131000_independent_reward_release_guard.sql");
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("independent recommendation reward release guard", () => {
  it("requires approved KYC without requiring Phone, Profile, or compatibility tier", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.clear_matured_recommendation_rewards()");
    expect(sql).toMatch(/v_reward\.kyc_status\s*<>\s*'approved'/i);
    expect(sql).not.toContain("v_reward.tier");
    expect(sql).not.toContain("u.tier");
    expect(sql).not.toContain("phone_verified_at");
    expect(sql).not.toContain("profile_completed_at");
  });

  it("preserves the release safety and accounting boundaries", () => {
    expect(sql).toContain("FOR UPDATE OF rc SKIP LOCKED");
    expect(sql).toContain("pending_wallet_balance_mismatch");
    expect(sql).toContain("skipped_missing_order");
    expect(sql).toContain("skipped_wallet");
    expect(sql).toContain("earnings_reverse");
    expect(sql).toContain("earnings_confirm");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.clear_matured_recommendation_rewards() TO service_role");
  });
});
