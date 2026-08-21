import { describe, expect, it } from 'vitest';
import { WITHDRAWAL_STATUS } from '@/lib/constants';
import { ACTIVE_WITHDRAWAL_STATUSES } from '../types';

describe('withdrawal lifecycle contract', () => {
  it('defines every non-terminal state that blocks a second withdrawal', () => {
    expect(ACTIVE_WITHDRAWAL_STATUSES).toEqual([
      'pending',
      'pending_second_approval',
      'approved',
      'processing',
      'hold',
      'overdue',
    ]);
  });

  it('keeps the shared withdrawal status vocabulary aligned with the governed lifecycle', () => {
    expect(WITHDRAWAL_STATUS).toEqual([
      'pending',
      'pending_second_approval',
      'hold',
      'overdue',
      'approved',
      'processing',
      'paid',
      'completed',
      'failed',
      'rejected',
    ]);
  });
});
