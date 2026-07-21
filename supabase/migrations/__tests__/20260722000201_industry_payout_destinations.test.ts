import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('industry payout destination migration contract', () => {
  it('supports verified destinations, cooldowns, snapshots, and failure details', () => {
    const sql = readFileSync(new URL('../20260722000201_industry_payout_destinations.sql', import.meta.url), 'utf8');

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
