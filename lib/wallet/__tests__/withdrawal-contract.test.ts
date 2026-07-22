import { describe, expect, it } from 'vitest';
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
});
