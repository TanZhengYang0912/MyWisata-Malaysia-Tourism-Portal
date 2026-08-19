import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL(
  '../096_wallet_ledger_tng_mock_settlement.sql',
  import.meta.url,
);

describe('wallet ledger and TNG mock settlement migration contract', () => {
  it('makes wallet history append-only for application roles', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toMatch(
      /REVOKE\s+INSERT\s*,\s*UPDATE\s*,\s*DELETE\s+ON\s+TABLE\s+public\.wallet_transactions\s+FROM\s+anon\s*,\s*authenticated\s*,\s*service_role/i,
    );
    expect(sql).toContain('wallet_transactions_append_only');
    expect(sql).toMatch(/BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+public\.wallet_transactions/i);
    expect(sql).toContain('wallet_transactions_are_append_only');
  });

  it('records provider callbacks once in an append-only event table', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.payout_provider_events');
    expect(sql).toMatch(/UNIQUE\s*\(provider\s*,\s*event_id\)/i);
    expect(sql).toContain('payout_provider_events_append_only');
    expect(sql).toMatch(/BEFORE\s+UPDATE\s+OR\s+DELETE\s+ON\s+public\.payout_provider_events/i);
    expect(sql).toContain('payload_sha256');
  });

  it('exposes guarded provider processing and atomic settlement only to service role', () => {
    const sql = readFileSync(migrationUrl, 'utf8');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.mark_provider_withdrawal_processing');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.settle_provider_withdrawal');
    expect(sql).toMatch(/COALESCE\(auth\.role\(\),\s*''\)\s*<>\s*'service_role'/i);
    expect(sql).toContain('approval_count_insufficient');
    expect(sql).toContain('high_risk_override_required');
    expect(sql).toContain('provider_payout_id_conflict');
    expect(sql).toContain('complete_withdrawal_payout');
    expect(sql).toContain('ON CONFLICT (provider, event_id) DO NOTHING');

    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.mark_provider_withdrawal_processing\(UUID, TEXT, TEXT\)\s+TO service_role/i,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.settle_provider_withdrawal\(\s*UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT\s*\)\s+TO service_role/i,
    );
    expect(sql).not.toMatch(
      /GRANT EXECUTE ON FUNCTION public\.(mark_provider_withdrawal_processing|settle_provider_withdrawal)[^;]+ TO authenticated/i,
    );
  });
});
