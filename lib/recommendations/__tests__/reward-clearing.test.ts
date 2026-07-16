import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

import { clearMaturedRecommendationRewards } from '../reward-clearing';

const rpc = vi.fn();
const service = { rpc } as unknown as SupabaseClient;

describe('clearMaturedRecommendationRewards', () => {
  beforeEach(() => rpc.mockReset());

  it('reports a seven-day pending reward cleared only after KYC approval', async () => {
    rpc.mockResolvedValue({
      data: [{
        commission_id: '11111111-1111-4111-8111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        order_id: '33333333-3333-4333-8333-333333333333',
        action: 'cleared',
        amount_sen: 5000,
      }],
      error: null,
    });

    await expect(clearMaturedRecommendationRewards(service)).resolves.toEqual({
      cleared: [{
        commissionId: '11111111-1111-4111-8111-111111111111',
        userId: '22222222-2222-4222-8222-222222222222',
        orderId: '33333333-3333-4333-8333-333333333333',
        amountSen: 5000,
      }],
      reversed: [],
      skipped: 0,
    });
    expect(rpc).toHaveBeenCalledWith('clear_matured_recommendation_rewards');
  });

  it('keeps an overdue reward pending when the recommender has not passed KYC', async () => {
    rpc.mockResolvedValue({
      data: [{
        commission_id: '11111111-1111-4111-8111-111111111111',
        user_id: '22222222-2222-4222-8222-222222222222',
        order_id: '33333333-3333-4333-8333-333333333333',
        action: 'skipped_kyc',
        amount_sen: 5000,
      }],
      error: null,
    });

    await expect(clearMaturedRecommendationRewards(service)).resolves.toMatchObject({
      cleared: [],
      reversed: [],
      skipped: 1,
    });
  });

  it('surfaces the database failure instead of claiming rewards were cleared', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'wallet balance mismatch' } });

    await expect(clearMaturedRecommendationRewards(service)).rejects.toThrow('wallet balance mismatch');
  });
});
