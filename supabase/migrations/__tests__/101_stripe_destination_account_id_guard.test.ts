import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('101 Stripe destination account ID guard migration', () => {
  const sql = readFileSync(
    new URL('../101_stripe_destination_account_id_guard.sql', import.meta.url),
    'utf8',
  );

  it('accepts only connected-account IDs for Stripe destination references', () => {
    expect(sql).toContain('payout_destinations_stripe_account_id');
    expect(sql).toMatch(/provider\s*<>\s*'stripe_connect'[\s\S]+provider_reference\s+IS\s+NOT\s+NULL[\s\S]+provider_reference\s*~\s*'\^acct_\[A-Za-z0-9\]\+\$'/i);
  });

  it('does not apply the Stripe account format to TNG references', () => {
    expect(sql).not.toMatch(/provider\s*=\s*'tng_direct_credit'[\s\S]+\^acct_/i);
  });
});
