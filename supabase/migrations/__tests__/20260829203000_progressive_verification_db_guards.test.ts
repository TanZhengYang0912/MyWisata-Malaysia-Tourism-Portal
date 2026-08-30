import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../20260830013000_independent_capability_hard_guards.sql", import.meta.url),
  "utf8",
);

describe("progressive verification database guards", () => {
  it("requires a phone-verified owner for service-role order inserts", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.enforce_phone_verified_order()");
    expect(sql).toContain("NEW.user_id");
    expect(sql).toContain("phone_verified_at IS NOT NULL");
    expect(sql).not.toContain("service_role' THEN\n    RETURN NEW");
  });

  it("enforces Profile Complete or approved KYC on recommendation and affiliate inserts", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.enforce_recommendation_profile_or_kyc()");
    expect(sql).toContain("CREATE TRIGGER vendor_recommendations_require_profile_or_kyc");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.enforce_affiliate_link_eligibility()");
    expect(sql).toContain("CREATE TRIGGER affiliate_links_require_eligible_profile");
    expect(sql).toContain("u.profile_completed_at IS NOT NULL OR u.kyc_status = 'approved'");
    expect(sql).not.toContain("u.tier IN ('profile_complete', 'kyc_verified')");
    expect(sql).toContain("'vendor_owner', 'outlet_manager'");
  });

  it("requires approved KYC before affiliate earnings can be credited", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.confirm_pending_earnings()");
    expect(sql).not.toContain("u.tier = 'kyc_verified'");
    expect(sql).toContain("u.kyc_status = 'approved'");
    expect(sql).toContain("FOR UPDATE OF aa, u");
  });

  it("does not require Phone, Profile, or legacy tier for KYC-approved withdrawals", () => {
    const withdrawal = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.enforce_withdrawal_eligibility()"));
    expect(withdrawal).toContain("v_user.kyc_status <> 'approved'");
    expect(withdrawal).not.toContain("phone_verified_at");
    expect(withdrawal).not.toContain("profile_completed_at");
    expect(withdrawal).not.toContain("u.tier");
  });

  it("keeps the supported withdrawal entry point authenticated and service-role callable", () => {
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.submit_wallet_withdrawal(BIGINT, UUID) FROM PUBLIC, anon");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.submit_wallet_withdrawal(BIGINT, UUID) TO authenticated");
  });
});
