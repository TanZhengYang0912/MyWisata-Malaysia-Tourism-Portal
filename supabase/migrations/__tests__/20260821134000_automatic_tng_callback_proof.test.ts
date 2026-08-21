import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../20260821134000_automatic_tng_callback_proof.sql', import.meta.url);

function migrationSql(): string {
  expect(existsSync(migrationUrl)).toBe(true);
  return readFileSync(migrationUrl, 'utf8');
}

describe('automatic TNG callback proof migration', () => {
  it('creates a service-only durable callback outbox', () => {
    const sql = migrationSql();

    expect(sql).toContain('CREATE TABLE public.tng_mock_callback_outbox');
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.tng_mock_callback_outbox\s+FROM PUBLIC, anon, authenticated, service_role/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.claim_tng_mock_callback_outbox\([\s\S]+?TO service_role/i);
    expect(sql).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]+?tng_mock_callback_outbox[\s\S]+?TO (?:anon|authenticated)/i);
  });

  it('starts processing and queues one callback in the same service-only transaction', () => {
    const sql = migrationSql();

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.start_tng_mock_payout');
    expect(sql).toContain("PERFORM public.record_tng_payout(");
    expect(sql).toContain("PERFORM public.mark_provider_withdrawal_processing(");
    expect(sql).toContain('ON CONFLICT (withdrawal_id, provider_payout_id, outcome) DO NOTHING');
    expect(sql).toContain("COALESCE(auth.role(), '') <> 'service_role'");
  });

  it('settles only matching MYR amounts and stores safe proof fields', () => {
    const sql = migrationSql();

    expect(sql).toContain('DROP FUNCTION IF EXISTS public.settle_provider_withdrawal(');
    expect(sql).toContain('p_amount_sen BIGINT');
    expect(sql).toContain('p_currency TEXT');
    expect(sql).toContain('p_provider_occurred_at TIMESTAMPTZ');
    expect(sql).toContain("p_currency IS DISTINCT FROM 'MYR'");
    expect(sql).toContain('p_amount_sen IS DISTINCT FROM v_expected_amount_sen');
    expect(sql).toContain('provider_occurred_at');
    expect(sql).toContain('payload_sha256');
    expect(sql).toContain('ON CONFLICT (provider, event_id) DO NOTHING');
  });

  it('keeps provider events append-only and authorizes proof at the database boundary', () => {
    const sql = migrationSql();
    const triggerDrop = sql.indexOf('DROP TRIGGER IF EXISTS payout_provider_events_append_only');
    const backfill = sql.indexOf('UPDATE public.payout_provider_events AS event');
    const triggerRestore = sql.indexOf('CREATE TRIGGER payout_provider_events_append_only');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_withdrawal_settlement_proof');
    expect(sql).toContain('auth.uid()');
    expect(sql).toContain('public.is_approver(v_actor)');
    expect(sql).toContain("RAISE EXCEPTION 'withdrawal_proof_forbidden'");
    expect(sql).toContain('v_is_approver := public.is_approver(v_actor)');
    expect(sql).toContain("'delivery', CASE WHEN NOT v_is_approver");
    expect(sql).toContain("'notification', CASE WHEN NOT v_is_approver");
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_withdrawal_settlement_proof\(UUID\)\s+TO authenticated/i);
    expect(triggerDrop).toBeGreaterThan(-1);
    expect(backfill).toBeGreaterThan(triggerDrop);
    expect(triggerRestore).toBeGreaterThan(backfill);
  });

  it('bounds retry attempts and never automatically resurrects exhausted jobs', () => {
    const sql = migrationSql();

    expect(sql).toContain('attempt_count < 5');
    expect(sql).toContain("status = 'exhausted'");
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reconcile_tng_mock_callbacks');
    expect(sql).toContain("outbox.status <> 'exhausted'");
    expect(sql).toContain("last_error_code = 'stale_claim_exhausted'");
  });
});
