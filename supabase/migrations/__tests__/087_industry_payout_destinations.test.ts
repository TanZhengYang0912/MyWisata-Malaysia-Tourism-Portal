import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('industry payout destination migration contract', () => {
  it('supports verified destinations, cooldowns, snapshots, and failure details', () => {
    const sql = [
      new URL('../096_wallet_ledger_tng_mock_settlement.sql', import.meta.url),
      new URL('../098_provider_neutral_withdrawal_completion.sql', import.meta.url),
      new URL('../20260830013000_independent_capability_hard_guards.sql', import.meta.url),
    ].map((path) => readFileSync(path, 'utf8')).join('\n');

    expect(sql).toContain('cooldown_until');
    expect(sql).toContain('destination_provider');
    expect(sql).toContain('destination_masked_ref');
    expect(sql).toContain('payout_failure_code');
    expect(sql).toContain('payout_failure_category');
    expect(sql).toContain('payout_provider_event_id');
    expect(sql).toContain("v_destination.dest_type = 'ewallet'");
    expect(sql).toContain("RAISE EXCEPTION 'payout_destination_cooldown'");
  });
});
