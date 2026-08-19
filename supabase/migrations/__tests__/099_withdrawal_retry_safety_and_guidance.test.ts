import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../099_withdrawal_retry_safety_and_guidance.sql', import.meta.url);

describe('withdrawal retry safety migration', () => {
  it('records Stripe payout ids before later accounting updates', () => {
    expect(existsSync(migrationUrl)).toBe(true);
    if (!existsSync(migrationUrl)) return;
    const sql = readFileSync(migrationUrl, 'utf8');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.record_stripe_payout');
    expect(sql).toContain("v_request.status <> 'approved'");
    expect(sql).toContain('stripe_payout_id');
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_stripe_payout[\s\S]+TO service_role/i);
    expect(sql).toContain('payout_attempt_started_at');
    expect(sql).toContain('payout_execution_claim_token');
    expect(sql).toContain('payout_execution_claimed_at');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.start_withdrawal_payout_attempt');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.record_tng_payout');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.mark_provider_withdrawal_processing');
    expect(sql).toContain('v_request.payout_provider_event_id IS DISTINCT FROM p_provider_payout_id');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.record_stripe_transfer');
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_stripe_transfer\(UUID, TEXT\)[\s\S]+FROM PUBLIC, anon, authenticated/i);
  });

  it('persists retry eligibility without exposing the RPC to application roles', () => {
    const sql = readFileSync(migrationUrl, 'utf8');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.record_withdrawal_execution_failure');
    expect(sql).toContain('payout_failure_retryable = p_retryable');
    expect(sql).toContain('payout_execution_claim_token = CASE WHEN p_retryable THEN NULL ELSE payout_execution_claim_token END');
    expect(sql).toContain("v_request.payout_execution_claim_token IS NOT NULL");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.record_withdrawal_execution_failure[\s\S]+FROM PUBLIC, anon, authenticated/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_withdrawal_execution_failure[\s\S]+TO service_role/i);
  });
});
