import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('payout failure detail migration contract', () => {
  it('stores normalized provider details idempotently', () => {
    const sql = readFileSync(new URL('../20260722000404_payout_failure_details.sql', import.meta.url), 'utf8');

    expect(sql).toContain('record_withdrawal_payout_failure');
    expect(sql).toContain('payout_failure_code');
    expect(sql).toContain('payout_failure_retryable');
    expect(sql).toContain('payout_provider_event_id');
    expect(sql).toContain('idempotent');
  });
});
