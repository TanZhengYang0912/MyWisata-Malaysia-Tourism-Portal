import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/legacy-migrations/077_wallet_governance_report.sql', 'utf8');

describe('wallet governance report migration contract', () => {
  it('uses the configurable wallet clearance window for new recommendation rewards', () => {
    expect(sql).toContain('wallet.clearance_days');
    expect(sql).toContain('credit_pending_recommendation');
    expect(sql).toContain("now() + (v_hold_days || ' days')::INTERVAL");
  });

  it('returns failed, reserved and withdrawn report totals', () => {
    expect(sql).toContain("'amount_failed_rm'");
    expect(sql).toContain("'amount_reserved_rm'");
    expect(sql).toContain("'amount_withdrawn_rm'");
  });
});
