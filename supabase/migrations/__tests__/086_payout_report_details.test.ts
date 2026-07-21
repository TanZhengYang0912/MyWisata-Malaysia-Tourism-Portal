import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../086_payout_report_details.sql', import.meta.url), 'utf8');

describe('payout report detail migration contract', () => {
  it('stores provider payout fees and returns user/date/source detail groups', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS payout_fee');
    expect(sql).toContain('record_withdrawal_payout_fee');
    expect(sql).toContain("'payout_fees_rm'");
    expect(sql).toContain("'details'");
    expect(sql).toContain('user_id');
    expect(sql).toContain('source');
    expect(sql).toContain("AT TIME ZONE 'Asia/Kuala_Lumpur'");
  });
});
