import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  new URL("../20260830013000_independent_capability_hard_guards.sql", import.meta.url),
  "utf8",
);

describe("independent capability database hard guards", () => {
  it("keeps Phone as the order and booking hard guard", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.enforce_phone_verified_order()");
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.enforce_phone_verified_booking()");
    expect(sql).toContain("phone_verified_at IS NOT NULL");
  });

  it("allows recommendation submission through Profile Complete or approved KYC", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.customer_can_submit_recommendation(p_user_id UUID)");
    expect(sql).toMatch(/profile_completed_at IS NOT NULL[\s\S]+OR u\.kyc_status = 'approved'/);
    const recommendationSection = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.customer_can_submit_recommendation"),
      sql.indexOf("-- Full affiliate always wins"),
    );
    expect(recommendationSection).not.toContain("phone_verified_at");
  });

  it("derives Limited and Full affiliate modes from independent facts", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.customer_affiliate_mode(p_user_id UUID)");
    expect(sql).toContain("WHEN u.kyc_status = 'approved' THEN 'full'");
    expect(sql).toContain("WHEN u.profile_completed_at IS NOT NULL THEN 'limited'");
    expect(sql).toContain("'vendor_owner', 'outlet_manager'");
    expect(sql).toContain("r.name = 'customer'");
  });

  it("rechecks approved KYC under commission clearing locks", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.confirm_pending_earnings()");
    expect(sql).toContain("u.kyc_status = 'approved'");
    expect(sql).toContain("FOR UPDATE OF aa, u");
  });

  it("requires KYC and financial readiness for withdrawals without Phone or Profile", () => {
    const withdrawalSection = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.submit_wallet_withdrawal"));
    expect(withdrawalSection).toContain("kyc_status <> 'approved'");
    expect(withdrawalSection).toContain("below_min_withdrawal");
    expect(withdrawalSection).toContain("active_withdrawal_exists");
    expect(withdrawalSection).toContain("EXCEPTION WHEN unique_violation");
    expect(withdrawalSection).toContain("insufficient_earnings");
    expect(withdrawalSection).not.toContain("phone_verified_at");
    expect(withdrawalSection).not.toContain("profile_completed_at");
    expect(withdrawalSection).not.toContain("u.tier");
    expect(sql).toContain("REVOKE ALL ON FUNCTION public.submit_wallet_withdrawal(BIGINT) FROM authenticated");
  });

  it("keeps Admin approval and completion functions unchanged", () => {
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.approve_wallet_withdrawal");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.complete_withdrawal_payout");
    expect(sql).toContain("approver-only, valid-state, self-dealing, idempotency, risk");
    expect(sql).toContain("requires_dual_approval");
  });

  it("separates the Admin actor guard from locked commission-subject KYC", () => {
    const clearing = sql.slice(
      sql.indexOf("CREATE OR REPLACE FUNCTION public.confirm_pending_earnings"),
      sql.indexOf("-- Withdrawal requires KYC"),
    );
    expect(clearing).toContain("NOT public.is_admin(auth.uid())");
    expect(clearing).toContain("u.kyc_status = 'approved'");
    expect(clearing).toContain("r.name = 'customer'");
    expect(clearing).toContain("r.name IN ('vendor_owner', 'outlet_manager')");
    expect(clearing).toContain("FOR UPDATE OF aa, u");
  });
});
