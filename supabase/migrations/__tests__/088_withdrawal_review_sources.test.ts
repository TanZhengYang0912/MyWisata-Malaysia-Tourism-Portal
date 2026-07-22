import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('withdrawal review source migration contract', () => {
  it('provides immutable approver snapshots and paginated source projections', () => {
    const sql = readFileSync(new URL('../088_withdrawal_review_sources.sql', import.meta.url), 'utf8');

    expect(sql).toContain('get_withdrawal_notification_snapshot');
    expect(sql).toContain('get_withdrawal_review_sources');
    expect(sql).toContain('rewardSources');
    expect(sql).toContain('affiliateSources');
    expect(sql).toContain('walletTransactions');
    expect(sql).toContain('fraudFlags');
    expect(sql).toContain('is_approver(auth.uid())');
  });
});
