import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../legacy-migrations/089_payout_report_pending_amounts.sql', import.meta.url), 'utf8');

describe('payout report pending amounts migration contract', () => {
  it('returns distinct wallet and withdrawal pending/reserved/available amounts', () => {
    expect(sql).toContain("'pending_withdrawal_amount_rm'");
    expect(sql).toContain("'pending_earnings_amount_rm'");
    expect(sql).toContain("'reserved_amount_rm'");
    expect(sql).toContain("'available_amount_rm'");
    expect(sql).toContain("'amount_reserved_rm'");
    expect(sql).toContain('FROM public.wallets');
  });
});
