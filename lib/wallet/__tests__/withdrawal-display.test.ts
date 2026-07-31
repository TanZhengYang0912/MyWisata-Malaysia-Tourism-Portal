import { describe, expect, it } from 'vitest';
import { getWithdrawalDisplayGroups, isWithdrawalReviewableStatus } from '../withdrawal-display';

describe('getWithdrawalDisplayGroups', () => {
  it('does not subtract reserved requests from earnings a second time', () => {
    const groups = getWithdrawalDisplayGroups([
      { status: 'pending', amount: 70 },
      { status: 'hold', amount: 20 },
      { status: 'completed', amount: 10 },
    ], 100);

    expect(groups.availableEarnings).toBe(100);
    expect(groups.pendingTotal).toBe(90);
    expect(groups.pending.map((item) => item.status)).toEqual(['pending', 'hold']);
    expect(groups.history.map((item) => item.status)).toEqual(['completed']);
  });

  it('uses the same reviewable status set as the admin queue', () => {
    expect(['pending', 'pending_second_approval', 'hold', 'overdue'].every(isWithdrawalReviewableStatus)).toBe(true);
    expect(isWithdrawalReviewableStatus('rejected')).toBe(false);
    expect(isWithdrawalReviewableStatus('completed')).toBe(false);
  });
});
