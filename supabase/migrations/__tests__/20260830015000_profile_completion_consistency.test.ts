import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(process.cwd(), "supabase/migrations/20260830015000_profile_completion_consistency.sql");
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";
const localSeed = readFileSync(resolve(process.cwd(), "supabase/seed.sql"), "utf8");
const remoteSeed = readFileSync(resolve(process.cwd(), "scripts/seed-remote-demo.mjs"), "utf8");

function functionBody(signature: RegExp): string {
  return migration.match(signature)?.[1] ?? "";
}

describe("Profile completion consistency repair", () => {
  it("defines one fail-closed four-section eligibility predicate", () => {
    const body = functionBody(/CREATE OR REPLACE FUNCTION public\.profile_completion_eligible\(p_user_id UUID\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);

    expect(body).toContain("full_name");
    expect(body).toContain("city");
    expect(body).toContain("country");
    expect(body).toContain("avatar_url");
    expect(body).toContain("bio");
    expect(body).toContain("preference_survey_responses");
    expect(body).toContain("cardinality(response.interests)");
    expect(body).toContain("default-avatar.svg");
    expect(body).not.toContain("phone_verified_at");
    expect(body).not.toContain("kyc_status");
  });

  it("uses the eligibility predicate at every Profile-backed authorization boundary", () => {
    const factBody = functionBody(/CREATE OR REPLACE FUNCTION public\.entitlement_fact_value\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
    const guardBody = functionBody(/CREATE OR REPLACE FUNCTION public\.capability_hard_guard\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
    const recommendationBody = functionBody(/CREATE OR REPLACE FUNCTION public\.customer_can_submit_recommendation\(p_user_id UUID\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
    const affiliateBody = functionBody(/CREATE OR REPLACE FUNCTION public\.customer_affiliate_mode\(p_user_id UUID\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);
    const compatibilityBody = functionBody(/CREATE OR REPLACE FUNCTION public\.recompute_compatibility_tier\(p_user_id UUID\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/);

    expect(factBody).toMatch(/profile_completed_at IS NOT NULL[\s\S]*profile_completion_eligible/);
    expect(guardBody).toMatch(/profile_completed_at IS NOT NULL[\s\S]*profile_completion_eligible/);
    expect(recommendationBody).toMatch(/profile_completed_at IS NOT NULL[\s\S]*profile_completion_eligible/);
    expect(affiliateBody).toMatch(/profile_completed_at IS NOT NULL[\s\S]*profile_completion_eligible/);
    expect(compatibilityBody).toMatch(/profile_completed_at IS NOT NULL[\s\S]*profile_completion_eligible/);
  });

  it("does not destroy historical Profile completion evidence", () => {
    expect(migration).not.toMatch(/SET\s+profile_completed_at\s*=\s*NULL/i);
    expect(migration).not.toContain("profile.completion_reconciled");
  });

  it("does not seed Profile completion without the required evidence", () => {
    const localUserSeed = localSeed.match(/INSERT INTO users[\s\S]*?ON CONFLICT \(id\) DO UPDATE/)?.[0] ?? "";

    expect(localUserSeed).not.toMatch(/,\s*(?:NOW\(\)|NULL),\s*NOW\(\)\s*\)/);
    expect(remoteSeed).toContain("profile_completed_at: null");
  });
});
