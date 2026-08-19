import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../097_fix_withdrawal_review_sources.sql', import.meta.url);

describe('withdrawal review source compatibility migration', () => {
  it('replaces the broken projection using columns that exist on wallet_transactions', () => {
    expect(existsSync(migrationUrl)).toBe(true);
    if (!existsSync(migrationUrl)) return;

    const sql = readFileSync(migrationUrl, 'utf8');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_withdrawal_review_sources');
    expect(sql).toContain("COALESCE(wt.order_id, wt.withdrawal_id)");
    expect(sql).not.toContain('wt.reference_id');
    expect(sql).toContain("'earnings_pending','earnings_confirm','earnings_reverse'");
    expect(sql).toContain('is_approver(auth.uid())');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_withdrawal_review_sources(UUID, INTEGER, INTEGER) FROM PUBLIC');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_withdrawal_review_sources(UUID, INTEGER, INTEGER) TO authenticated');
    expect(sql).not.toContain('ALTER TABLE public.wallet_transactions');
  });
});
