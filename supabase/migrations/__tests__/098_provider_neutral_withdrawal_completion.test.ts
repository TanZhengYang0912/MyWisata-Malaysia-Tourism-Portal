import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../098_provider_neutral_withdrawal_completion.sql', import.meta.url);

describe('provider-neutral withdrawal completion migration', () => {
  it('replaces Stripe-only terminal invariants with provider-aware checks', () => {
    expect(existsSync(migrationUrl)).toBe(true);
    if (!existsSync(migrationUrl)) return;
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain('DROP CONSTRAINT IF EXISTS wr_terminal_has_stripe_ids');
    expect(sql).toContain("payout_provider = 'tng_direct_credit'");
    expect(sql).toContain('payout_provider_event_id IS NOT NULL');
    expect(sql).toContain("COALESCE(payout_provider, 'stripe_connect') = 'stripe_connect'");
    expect(sql).toContain('stripe_transfer_id IS NOT NULL');
    expect(sql).toContain('stripe_payout_id IS NOT NULL');
    expect(sql).toContain("'processing_without_stripe_ids'");
  });

  it('makes destination verification service-only while preserving owner reads', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain('DROP POLICY IF EXISTS payout_dest_own');
    expect(sql).toContain('CREATE POLICY payout_dest_owner_read');
    expect(sql).toMatch(/FOR\s+SELECT\s+TO\s+authenticated/i);
    expect(sql).toMatch(/REVOKE\s+INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.payout_destinations\s+FROM\s+anon\s*,\s*authenticated/i);
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.save_verified_payout_destination');
    expect(sql).toMatch(/COALESCE\(auth\.role\(\),\s*''\)\s*<>\s*'service_role'/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.save_verified_payout_destination[\s\S]+TO service_role/i);
  });

  it('keeps TNG withdrawals out of Stripe-only risk checks and makes audit history append-only', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.approve_wallet_withdrawal');
    expect(sql).toContain("COALESCE(v_request.payout_provider, 'stripe_connect') = 'stripe_connect'");
    expect(sql).toContain('audit_logs_are_append_only');
    expect(sql).toMatch(/BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+public\.audit_logs/i);
    expect(sql).toMatch(/REVOKE\s+UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.audit_logs\s+FROM\s+anon\s*,\s*authenticated/i);
  });

  it('records payout retry attempts without inserting another approval', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.record_withdrawal_payout_retry');
    expect(sql).toContain("v_request.status <> 'approved'");
    expect(sql).toContain("'withdrawal.payout_retry_requested'");
    expect(sql).not.toMatch(/record_withdrawal_payout_retry[\s\S]+INSERT INTO public\.withdrawal_approvals/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.record_withdrawal_payout_retry[\s\S]+TO service_role/i);
  });

  it('settles and notifies using the selected payout provider', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.complete_withdrawal_payout');
    expect(sql).toContain("COALESCE(v_request.payout_provider, 'stripe_connect')");
    expect(sql).toContain("'Your withdrawal has been transferred to your selected payout destination.'");
    expect(sql).toContain("'Provider payout ' || p_status");
  });
});
